// 军棋·两人经典暗棋:自摆布局 → 对战。
// 裁判规则:炸弹同归 / 地雷灭攻方(工兵挖雷、炸弹同归除外,雷持久)/ 同衔同尽 / 高吃低;
// 战斗结果只公布胜负("attacker"|"defender"|"both"),永不公布军衔;
// 司令阵亡 → 该方军旗位置亮明;胜负 = 夺旗 或 行动方无任何合法步(判负)。
// 行营内棋子免攻击;进入大本营永久冻结;地雷/军旗不可移动。
import {
  CELLS,
  CAMP_SET,
  HQ_SET,
  isRail,
  STEP_ADJ,
  railStraightDests,
  engineerRailDests,
  validateLayout,
  RANK_NAMES,
} from './junqi-board.js';

export const meta = {
  id: 'junqi',
  name: '军棋',
  minSeats: 2,
  maxSeats: 2,
  defaultOpts: {},
};

export function init(seatCount, opts, rng) {
  return {
    phase: 'setup', // setup | playing | ended
    cells: new Array(CELLS).fill(null), // {owner, rank, frozen}
    layouts: [null, null], // setup 期暂存
    ready: [false, false],
    firstMover: rng() < 0.5 ? 0 : 1,
    turn: null,
    cmdDead: [false, false],
    flagRevealed: [false, false],
    lastMove: null, // {from, to, result:'move'|'attacker'|'defender'|'both'}
    moveCount: 0,
    winner: null,
    endReason: null, // 'flag' | 'noMoves' | null
  };
}

const movable = (p) => p && p.rank !== 'L' && p.rank !== 'F' && !p.frozen;

/** from 处棋子的全部可达格(不含"己子占用"与"行营免攻"过滤后的非法格) */
export function destsOf(cells, from) {
  const p = cells[from];
  if (!movable(p)) return [];
  const dests = new Set(STEP_ADJ[from]);
  if (isRail(from)) {
    const railDests = p.rank === 1 ? engineerRailDests(cells, from) : railStraightDests(cells, from);
    for (const d of railDests) dests.add(d);
  }
  const out = [];
  for (const to of dests) {
    const t = cells[to];
    if (t) {
      if (t.owner === p.owner) continue; // 己子
      if (CAMP_SET.has(to)) continue; // 行营免攻
    }
    out.push(to);
  }
  return out;
}

function sideHasAnyMove(cells, owner) {
  for (let i = 0; i < CELLS; i++) {
    const p = cells[i];
    if (p && p.owner === owner && movable(p) && destsOf(cells, i).length > 0) return true;
  }
  return false;
}

/** 裁判:返回 'attacker' | 'defender' | 'both'(attacker 胜 = 守方亡) */
function referee(a, d) {
  if (a.rank === 'B' || d.rank === 'B') return 'both';
  if (d.rank === 'L') return a.rank === 1 ? 'attacker' : 'defender'; // 工兵挖雷;其余撞雷亡(雷存)
  if (d.rank === 'F') return 'attacker'; // 夺旗(终局)
  if (a.rank === d.rank) return 'both';
  return a.rank > d.rank ? 'attacker' : 'defender';
}

function applyDeploy(state, seat, layout) {
  if (state.phase !== 'setup') return { error: '布阵阶段已结束' };
  const reason = validateLayout(seat, layout);
  if (reason) return { error: reason };
  const next = {
    ...state,
    layouts: state.layouts.map((l, i) => (i === seat ? layout : l)),
    ready: state.ready.map((r, i) => (i === seat ? true : r)),
  };
  const events = [{ kind: 'deployed', seat }];
  if (next.ready[0] && next.ready[1]) {
    const cells = new Array(CELLS).fill(null);
    for (const owner of [0, 1]) {
      for (const { cell, rank } of next.layouts[owner]) {
        cells[cell] = { owner, rank, frozen: false };
      }
    }
    next.cells = cells;
    next.layouts = [null, null]; // 入盘后清暂存
    next.phase = 'playing';
    next.turn = next.firstMover;
    events.push({ kind: 'battleStart', firstMover: next.firstMover });
  }
  return { state: next, events };
}

function endGame(next, winner, reason, events, extra = {}) {
  next.winner = winner;
  next.endReason = reason;
  next.turn = null;
  events.push({ kind: 'end', winner, reason, ...extra });
  return { state: next, events };
}

function applyMove(state, seat, move) {
  if (state.phase !== 'playing') return { error: '对局未开始' };
  if (seat !== state.turn) return { error: '还没轮到你' };
  const from = move?.from | 0;
  const to = move?.to | 0;
  if (typeof move?.from !== 'number' || typeof move?.to !== 'number' || from < 0 || from >= CELLS || to < 0 || to >= CELLS) {
    return { error: '无效走法' };
  }
  const p = state.cells[from];
  if (!p || p.owner !== seat) return { error: '请选择己方棋子' };
  if (p.rank === 'L') return { error: '地雷不能移动' };
  if (p.rank === 'F') return { error: '军旗不能移动' };
  if (p.frozen) return { error: '大本营中的棋子不能再移动' };
  if (!destsOf(state.cells, from).includes(to)) {
    const t = state.cells[to];
    if (t && t.owner !== seat && CAMP_SET.has(to)) return { error: '行营中的棋子不可被攻击' };
    if (t && t.owner === seat) return { error: '不能吃自己的棋子' };
    return { error: '走法不通(检查公路/铁路路线)' };
  }

  const cells = state.cells.map((c) => (c ? { ...c } : null));
  const events = [];
  const next = {
    ...state,
    cells,
    moveCount: state.moveCount + 1,
    cmdDead: state.cmdDead.slice(),
    flagRevealed: state.flagRevealed.slice(),
  };
  const target = cells[to];
  const deaths = [];

  if (!target) {
    cells[to] = cells[from];
    cells[from] = null;
    if (HQ_SET.has(to)) cells[to].frozen = true; // 进大本营冻结
    next.lastMove = { from, to, result: 'move' };
    events.push({ kind: 'move', seat, from, to });
  } else {
    const result = referee(cells[from], target);
    next.lastMove = { from, to, result };
    events.push({ kind: 'battle', seat, from, to, result });
    if (result === 'attacker') {
      if (target.rank === 'F') {
        // 夺旗胜(棋子移入旗位)
        deaths.push(target);
        cells[to] = cells[from];
        cells[from] = null;
        recordDeaths(next, deaths, events);
        return endGame(next, seat, 'flag', events, { by: 'capture' });
      }
      deaths.push(target);
      cells[to] = cells[from];
      cells[from] = null;
      if (HQ_SET.has(to)) cells[to].frozen = true;
    } else if (result === 'defender') {
      deaths.push(cells[from]);
      cells[from] = null; // 守方保留(地雷持久同理)
    } else {
      deaths.push(cells[from], target);
      cells[from] = null;
      cells[to] = null;
    }
  }

  recordDeaths(next, deaths, events);

  // 对方军旗因雷区全失守?不——夺旗唯一旗终局;另一终局:行动方无步
  const enemy = 1 - seat;
  next.turn = enemy;
  if (!sideHasAnyMove(cells, enemy)) {
    return endGame(next, seat, 'noMoves', events);
  }
  return { state: next, events };
}

function recordDeaths(next, deaths, events) {
  for (const dead of deaths) {
    if (!dead) continue;
    if (dead.rank === 9 && !next.cmdDead[dead.owner]) {
      next.cmdDead[dead.owner] = true;
      next.flagRevealed[dead.owner] = true;
      events.push({ kind: 'flagReveal', owner: dead.owner });
    }
  }
}

export function apply(state, seat, move) {
  if (state.winner !== null) return { error: '对局已结束' };
  if (!move || typeof move.type !== 'string') return { error: '无效操作' };
  if (move.type === 'deploy') return applyDeploy(state, seat, move.layout);
  if (move.type === 'move') return applyMove(state, seat, move);
  return { error: '无效操作' };
}

/**
 * 分座位投影:己子全量;敌子 rank=null(亮旗后军旗例外);
 * 观战(null)双方全暗(亮明的军旗除外——属公开信息);布阵期只见己方暂存布局。
 */
export function view(state, seat) {
  const project = (p, i) => {
    if (!p) return null;
    const mine = seat !== null && p.owner === seat;
    if (mine) return { owner: p.owner, rank: p.rank, frozen: p.frozen };
    if (p.rank === 'F' && state.flagRevealed[p.owner]) return { owner: p.owner, rank: 'F', frozen: p.frozen };
    return { owner: p.owner, rank: null, frozen: false };
  };
  return {
    phase: state.phase,
    turn: state.turn,
    firstMover: state.firstMover,
    ready: state.ready,
    myLayout: seat !== null && state.phase === 'setup' ? state.layouts[seat] : null,
    cells: state.phase === 'setup' ? new Array(CELLS).fill(null) : state.cells.map(project),
    cmdDead: state.cmdDead,
    flagRevealed: state.flagRevealed,
    lastMove: state.lastMove,
    moveCount: state.moveCount,
    winner: state.winner,
    endReason: state.endReason,
  };
}

export function status(state) {
  if (state.winner !== null) {
    return {
      phase: 'ended',
      turn: null,
      winner: state.winner,
      detail: state.endReason === 'flag' ? '军旗被夺' : '对方无棋可走',
    };
  }
  if (state.phase === 'setup') {
    // 双方同时布阵:turn='any'(谁没提交谁可动,引擎自校验)
    return { phase: 'setup', turn: 'any', winner: null };
  }
  return { phase: 'playing', turn: state.turn, winner: null };
}

/** 点选高亮:仅依赖投影 view 即可工作(敌衔未知不影响可达性) */
export function legalMoves(viewState, seat, sel) {
  if (viewState.winner !== null || seat === null) return [];
  if (viewState.phase !== 'playing' || viewState.turn !== seat) return [];
  const from = sel?.from;
  if (typeof from !== 'number') return [];
  const p = viewState.cells[from];
  if (!p || p.owner !== seat) return [];
  return destsOf(viewState.cells, from);
}

export { RANK_NAMES };
