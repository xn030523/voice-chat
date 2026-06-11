// Table:单张牌桌的全部生命周期(座位/观战/FSM/宽限/解散/引擎驱动)
// 设计原则:Table 不持有 ws 连接 —— 通过 notify(table, events) 回调请求 hub 重新 fanout;
//          所有引擎调用都在 hub 的 try/catch 里(坏桌只废本桌,不波及他桌)。
import { getEngine } from './engines/index.js';
import { makeRng, cryptoSeed } from './rng.js';
import { ERR } from './protocol.js';

const GRACE_MS = 60 * 1000;        // 掉线宽限 60s
const DISSOLVE_VOTE_MS = 30 * 1000; // 解散投票窗口 30s

let nextTableSeq = 1;

export class Table {
  /**
   * @param {string} gameId 引擎 id
   * @param {{identity:string,name:string}} creator 创建者(自动坐 0 号位,成为房主)
   * @param {(table:Table, events:Array)=>void} notify 状态变化回调(hub 负责广播)
   */
  constructor(gameId, creator, notify) {
    const engine = getEngine(gameId);
    if (!engine) throw new Error(`未知游戏:${gameId}`);
    this.id = `t${nextTableSeq++}`;
    this.gameId = gameId;
    this.engine = engine;
    this.notify = notify;
    this.phase = 'waiting'; // waiting | playing | ended
    this.seats = Array.from({ length: engine.meta.maxSeats }, () => null);
    // seat: { identity, name, connected, abandoned, graceTimer }
    this.spectators = new Map(); // identity -> name
    this.hostIdentity = null;
    this.engineState = null;
    this.version = 0;
    this.dissolve = null; // { requesterSeat, votes:{seat:bool}, deadline, timer }
    this.result = null;   // { winner, reason, names? }
    this.corrupt = false;
    this.createdAt = Date.now();
    this.endedAt = null;
    this.lastActivity = Date.now();
    this.sit(creator.identity, creator.name, 0);
    this.hostIdentity = creator.identity;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // ---------- 查询 ----------

  seatOf(identity) {
    const i = this.seats.findIndex((s) => s && s.identity === identity);
    return i === -1 ? null : i;
  }

  seatedCount() {
    return this.seats.filter(Boolean).length;
  }

  onlineSeatedCount() {
    return this.seats.filter((s) => s && s.connected).length;
  }

  isHost(identity) {
    return this.hostIdentity === identity;
  }

  /** 本桌所有应收 table.state 的 identity(在座 + 观战);
   *  已弃局(abandoned)座位不再是受众 —— 主动离桌者不应再被广播拉回牌桌视图,
   *  其复座经 hello 自动回桌或 table.join 复位(onReconnect 会清除 abandoned)。 */
  audienceIdentities() {
    const ids = new Set();
    for (const s of this.seats) if (s && !s.abandoned) ids.add(s.identity);
    for (const id of this.spectators.keys()) ids.add(id);
    return ids;
  }

  /** 大厅摘要 */
  summary() {
    return {
      id: this.id,
      game: this.gameId,
      gameName: this.engine.meta.name,
      phase: this.phase,
      seated: this.seats.filter(Boolean).map((s) => s.name),
      seatMax: this.engine.meta.maxSeats,
      seatMin: this.engine.meta.minSeats,
      spectators: this.spectators.size,
    };
  }

  /** 给某个 identity 构造 table.state(分用户 view 投影 —— 隐藏信息的关键) */
  buildStateFor(identity, events = []) {
    const seat = this.seatOf(identity);
    let view = null;
    if (this.engineState) {
      view = this.engine.view(this.engineState, seat); // 观战者 seat=null → 全隐藏
    }
    const st = this.engineState ? this.engine.status(this.engineState) : null;
    return {
      type: 'table.state',
      tableId: this.id,
      game: this.gameId,
      gameName: this.engine.meta.name,
      version: this.version,
      phase: this.phase,
      seatMin: this.engine.meta.minSeats,
      seatMax: this.engine.meta.maxSeats,
      seats: this.seats.map((s, i) =>
        s
          ? { seat: i, name: s.name, connected: s.connected, abandoned: !!s.abandoned, isHost: s.identity === this.hostIdentity }
          : null
      ),
      turn: st ? st.turn : null,
      you: { seat },
      view,
      events,
      dissolve: this.dissolve
        ? { requesterSeat: this.dissolve.requesterSeat, votes: this.dissolve.votes, deadline: this.dissolve.deadline }
        : null,
      result: this.result,
      spectators: this.spectators.size,
    };
  }

  // ---------- 座位 ----------

  sit(identity, name, seatIdx) {
    this.seats[seatIdx] = { identity, name, connected: true, abandoned: false, graceTimer: null };
    this.spectators.delete(identity);
    this.touch();
  }

  /** 入座(含 reclaim 顶座:按显示名换绑死座) */
  join(identity, name, seatIdx, reclaim = false) {
    if (this.phase === 'ended') return { error: { code: ERR.BAD_PHASE, msg: '本局已结束,等待房主开启下一局' } };
    if (this.seatOf(identity) !== null) return { error: { code: ERR.ALREADY_SEATED, msg: '你已在座' } };

    if (reclaim) {
      // 顶座:找同显示名且离线的座位(多座取最早离线——这里按座号序即可)
      const idx = this.seats.findIndex((s) => s && !s.connected && s.name === name);
      if (idx === -1) return { error: { code: ERR.NOT_FOUND, msg: '没有可回归的座位' } };
      const old = this.seats[idx];
      if (old.graceTimer) clearTimeout(old.graceTimer);
      const wasHost = old.identity === this.hostIdentity;
      this.seats[idx] = { identity, name, connected: true, abandoned: false, graceTimer: null };
      if (wasHost) this.hostIdentity = identity;
      this.touch();
      return { seat: idx };
    }

    if (this.phase !== 'waiting') return { error: { code: ERR.BAD_PHASE, msg: '对局进行中,可选择观战' } };
    if (seatIdx == null || seatIdx < 0 || seatIdx >= this.seats.length) {
      // 未指定座位 → 取最小空位
      seatIdx = this.seats.findIndex((s) => !s);
      if (seatIdx === -1) return { error: { code: ERR.TABLE_FULL, msg: '牌桌已满' } };
    }
    if (this.seats[seatIdx]) return { error: { code: ERR.SEAT_TAKEN, msg: '该座位已有人' } };
    this.sit(identity, name, seatIdx);
    if (!this.hostIdentity) this.hostIdentity = identity;
    return { seat: seatIdx };
  }

  /** 离座(waiting 直接退;playing 中=断绑显示,触发对手解散权) */
  leave(identity) {
    const seat = this.seatOf(identity);
    if (seat === null) {
      this.spectators.delete(identity);
      this.touch();
      return {};
    }
    const s = this.seats[seat];
    if (s.graceTimer) clearTimeout(s.graceTimer);
    if (this.phase === 'playing') {
      // 对局中主动离桌:座位保留但标记弃局,对手获得单方解散权
      s.connected = false;
      s.abandoned = true;
    } else {
      this.seats[seat] = null;
      if (identity === this.hostIdentity) this.passHost();
    }
    this.touch();
    return {};
  }

  passHost() {
    const next = this.seats.find(Boolean);
    this.hostIdentity = next ? next.identity : null;
  }

  // ---------- 开局 / 重开 ----------

  start(identity) {
    if (this.phase !== 'waiting') return { error: { code: ERR.BAD_PHASE, msg: '当前不能开始' } };
    if (!this.isHost(identity)) return { error: { code: ERR.NOT_HOST, msg: '只有房主可以开始游戏' } };
    const count = this.seatedCount();
    if (count < this.engine.meta.minSeats) {
      return { error: { code: ERR.BAD_PHASE, msg: `至少需要 ${this.engine.meta.minSeats} 人才能开始` } };
    }
    // 压缩座位(消除中间空洞,引擎座号 = 0..n-1)
    const compact = this.seats.filter(Boolean);
    this.seats = compact.concat(Array.from({ length: this.engine.meta.maxSeats - compact.length }, () => null)).slice(0, count);
    const rng = makeRng(cryptoSeed());
    this.engineState = this.engine.init(count, this.engine.meta.defaultOpts, rng);
    this.phase = 'playing';
    this.result = null;
    this.dissolve = null;
    this.version++;
    this.touch();
    return { events: [{ kind: 'start' }] };
  }

  restart(identity) {
    if (this.phase !== 'ended') return { error: { code: ERR.BAD_PHASE, msg: '本局尚未结束' } };
    if (!this.isHost(identity)) return { error: { code: ERR.NOT_HOST, msg: '只有房主可以再来一局' } };
    // 清掉弃局/离线座位,人数不足则回 waiting
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s && (s.abandoned || !s.connected)) this.seats[i] = null;
    }
    if (!this.seats.find((s) => s && s.identity === this.hostIdentity)) this.passHost();
    this.endedAt = null;
    this.result = null;
    this.engineState = null;
    this.phase = 'waiting';
    this.version++;
    this.touch();
    if (this.seatedCount() >= this.engine.meta.minSeats && this.hostIdentity) {
      return this.start(this.hostIdentity);
    }
    return { events: [{ kind: 'reopen' }] };
  }

  // ---------- 行棋 ----------

  move(identity, version, mv) {
    if (this.phase !== 'playing') return { error: { code: ERR.BAD_PHASE, msg: '对局未在进行中' } };
    const seat = this.seatOf(identity);
    if (seat === null) return { error: { code: ERR.NOT_FOUND, msg: '你不在本桌' } };
    const st = this.engine.status(this.engineState);
    // 同时行动阶段(如军棋双方布阵,turn='any')不做 version 竞态裁决——提交各自独立校验
    if (st.turn !== 'any' && typeof version === 'number' && version !== this.version) {
      return { error: { code: ERR.STALE_STATE, msg: '状态已更新,请以最新棋局为准' } };
    }
    // turn=null 的多人同时阶段由引擎自行校验
    if (st.turn !== null && st.turn !== seat && st.turn !== 'any') {
      return { error: { code: ERR.NOT_YOUR_TURN, msg: '还没轮到你' } };
    }
    const res = this.engine.apply(this.engineState, seat, mv);
    if (res.error) return { error: { code: ERR.ILLEGAL_MOVE, msg: res.error } };
    this.engineState = res.state;
    this.version++;
    this.touch();
    const after = this.engine.status(this.engineState);
    if (after.phase === 'ended') {
      this.finish({ winner: after.winner, reason: 'normal', detail: after.detail || null });
      return { events: res.events || [] };
    }
    return { events: res.events || [] };
  }

  finish(result) {
    this.phase = 'ended';
    this.endedAt = Date.now();
    // winner 可能是 seat 序号 / 'draw' / 阵营字符串(斗地主 'landlord'|'farmers')
    const w = result.winner;
    this.result = {
      ...result,
      winnerName: typeof w === 'number' ? this.seats[w]?.name || null : null,
    };
    if (this.dissolve?.timer) clearTimeout(this.dissolve.timer);
    this.dissolve = null;
    this.version++;
    this.touch();
  }

  // ---------- 掉线 / 重连 ----------

  onDisconnect(identity) {
    const seat = this.seatOf(identity);
    if (seat === null) {
      if (this.spectators.delete(identity)) this.touch();
      return false;
    }
    const s = this.seats[seat];
    if (!s.connected) return false;
    s.connected = false;
    this.touch();
    if (this.phase === 'waiting') {
      // 等待中直接退座
      this.seats[seat] = null;
      if (identity === this.hostIdentity) this.passHost();
      return true;
    }
    if (this.phase === 'playing') {
      if (s.graceTimer) clearTimeout(s.graceTimer);
      s.graceTimer = setTimeout(() => {
        s.graceTimer = null;
        if (!s.connected) {
          s.abandoned = true; // 超宽限 → 对手获得单方解散权
          this.version++;
          this.notify(this, [{ kind: 'abandoned', seat, name: s.name }]);
        }
      }, GRACE_MS);
    }
    return true;
  }

  onReconnect(identity) {
    const seat = this.seatOf(identity);
    if (seat === null) return false;
    const s = this.seats[seat];
    if (s.graceTimer) {
      clearTimeout(s.graceTimer);
      s.graceTimer = null;
    }
    const wasOffline = !s.connected;
    s.connected = true;
    s.abandoned = false;
    this.touch();
    return wasOffline;
  }

  // ---------- 解散 ----------

  requestDissolve(identity) {
    if (this.phase !== 'playing') return { error: { code: ERR.BAD_PHASE, msg: '当前无需解散' } };
    const seat = this.seatOf(identity);
    if (seat === null) return { error: { code: ERR.NOT_FOUND, msg: '你不在本桌' } };
    if (this.dissolve) return { error: { code: ERR.BAD_PHASE, msg: '已有解散投票进行中' } };

    // 有人弃局(超宽限/主动离桌)→ 单方解散直接通过
    const anyAbandoned = this.seats.some((s) => s && s.abandoned);
    if (anyAbandoned) {
      this.finish({ winner: null, reason: 'dissolved' });
      return { events: [{ kind: 'dissolved', by: seat }], ended: true };
    }

    const votes = { [seat]: true };
    // 只需在线在座者投票;若只有发起者一人在线 → 立即通过
    const voters = this.seats.filter((s, i) => s && s.connected && i !== seat);
    if (voters.length === 0) {
      this.finish({ winner: null, reason: 'dissolved' });
      return { events: [{ kind: 'dissolved', by: seat }], ended: true };
    }
    this.dissolve = {
      requesterSeat: seat,
      votes,
      deadline: Date.now() + DISSOLVE_VOTE_MS,
      timer: setTimeout(() => {
        if (this.dissolve) {
          this.dissolve = null;
          this.version++;
          this.notify(this, [{ kind: 'dissolveExpired' }]);
        }
      }, DISSOLVE_VOTE_MS),
    };
    this.version++;
    this.touch();
    return { events: [{ kind: 'dissolveRequested', seat }] };
  }

  voteDissolve(identity, agree) {
    if (!this.dissolve) return { error: { code: ERR.BAD_PHASE, msg: '没有进行中的解散投票' } };
    const seat = this.seatOf(identity);
    if (seat === null) return { error: { code: ERR.NOT_FOUND, msg: '你不在本桌' } };
    if (this.dissolve.votes[seat] !== undefined) return { error: { code: ERR.BAD_PHASE, msg: '你已投过票' } };

    if (!agree) {
      clearTimeout(this.dissolve.timer);
      this.dissolve = null;
      this.version++;
      this.touch();
      return { events: [{ kind: 'dissolveRejected', seat }] };
    }
    this.dissolve.votes[seat] = true;
    // 全部在线在座者同意 → 通过(离线/弃局者不计票)
    const needed = this.seats.filter((s) => s && s.connected && !s.abandoned);
    const allAgreed = needed.every((s) => this.dissolve.votes[this.seatOf(s.identity)]);
    if (allAgreed) {
      clearTimeout(this.dissolve.timer);
      this.finish({ winner: null, reason: 'dissolved' });
      return { events: [{ kind: 'dissolved', by: seat }], ended: true };
    }
    this.version++;
    this.touch();
    return { events: [{ kind: 'dissolveVoted', seat }] };
  }

  // ---------- GC 判定 ----------

  /** 是否可被回收 */
  gcEligible(now = Date.now()) {
    if (this.corrupt) return true;
    const idle = now - this.lastActivity;
    if (this.seatedCount() === 0 && this.spectators.size === 0 && idle > 60 * 1000) return true; // 空桌 60s
    if (this.phase === 'ended' && this.endedAt && now - this.endedAt > 10 * 60 * 1000) return true; // 结束桌 10min
    if (this.onlineSeatedCount() === 0 && this.spectators.size === 0 && idle > 5 * 60 * 1000) return true; // 全员断线 5min
    return false;
  }

  /** 清理定时器(GC 前调用) */
  destroy() {
    for (const s of this.seats) if (s?.graceTimer) clearTimeout(s.graceTimer);
    if (this.dissolve?.timer) clearTimeout(this.dissolve.timer);
  }
}
