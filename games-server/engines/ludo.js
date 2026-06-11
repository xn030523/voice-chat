// 飞行棋(2-4 人):掷 6 起飞、6 行动后加掷(无三连惩罚)、己色跳 +4、
// 飞行线 +12(可与跳衔接:跳→飞→跳)、落点敌机全部击落(迭子无豁免)、
// 终点 p=55 精确到达,超出回弹;首位 4 机全到达者胜,对局即终。
// 骰子:state.seed 内联 PRNG 链(apply 保持纯函数)。
import {
  RING,
  DONE_P,
  TRACK_MAX_P,
  JUMP_STEP,
  FLY_FROM_P,
  FLY_TO_P,
  COLOR_NAMES,
  ringCellOf,
  colorOfRingCell,
  bouncedP,
} from './ludo-board.js';

export const meta = {
  id: 'ludo',
  name: '飞行棋',
  minSeats: 2,
  maxSeats: 4,
  defaultOpts: {},
};

function nextRand(seed) {
  let a = seed >>> 0;
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [v, a >>> 0];
}

export function init(seatCount, opts, rng) {
  const n = Math.max(2, Math.min(4, seatCount));
  return {
    phase: 'playing',
    seatCount: n,
    players: Array.from({ length: n }, () => ({
      planes: Array.from({ length: 4 }, (_, slot) => ({ zone: 'hangar', p: -1, slot })),
    })),
    turn: Math.floor(rng() * n),
    dice: null, // 待掷 | 1-6 待行动
    seed: Math.floor(rng() * 2 ** 31),
    winner: null,
    lastDice: null,
    moveCount: 0,
  };
}

/** dice 已定时,seat 的可动飞机下标 */
export function movablePlanes(state, seat) {
  const dice = state.dice;
  if (dice === null) return [];
  const out = [];
  state.players[seat].planes.forEach((pl, i) => {
    if (pl.zone === 'done') return;
    if (pl.zone === 'hangar') {
      if (dice === 6) out.push(i);
      return;
    }
    out.push(i); // 环上/跑道恒可动(回弹也算合法移动)
  });
  return out;
}

/** 击落 ringCell 上的所有敌机 → 返回受害者列表 [{seat, plane}] */
function captureAt(state, seat, ringCell, events) {
  const victims = [];
  state.players.forEach((player, s) => {
    if (s === seat) return;
    player.planes.forEach((pl, i) => {
      if (pl.zone === 'track' && pl.p <= TRACK_MAX_P && ringCellOf(s, pl.p) === ringCell) {
        victims.push({ seat: s, plane: i });
        player.planes[i] = { zone: 'hangar', p: -1, slot: i };
      }
    });
  });
  if (victims.length) {
    events.push({ kind: 'capture', seat, victims, cell: ringCell });
  }
}

function applyRoll(state, seat) {
  if (state.dice !== null) return { error: '请先移动棋子' };
  const [v, seed] = nextRand(state.seed);
  const dice = 1 + Math.floor(v * 6);
  const next = { ...state, seed, dice, lastDice: { seat, dice }, moveCount: state.moveCount + 1 };
  const events = [{ kind: 'dice', seat, dice }];
  const movable = movablePlanes(next, seat);
  if (movable.length === 0) {
    // 无可动 → 直接过(6 也照常加掷不到——没起飞也没法动,标准:6 无可动同样过)
    events.push({ kind: 'noMove', seat });
    next.dice = null;
    if (dice !== 6) next.turn = (seat + 1) % next.seatCount;
    else events.push({ kind: 'extraTurn', seat }); // 掷 6 仍可再掷(机库全空才会发生,理论极少)
    return { state: next, events };
  }
  return { state: next, events };
}

function applyMovePlane(state, seat, planeIdx) {
  const dice = state.dice;
  if (dice === null) return { error: '请先掷骰子' };
  if (typeof planeIdx !== 'number' || planeIdx < 0 || planeIdx > 3) return { error: '无效棋子' };
  if (!movablePlanes(state, seat).includes(planeIdx)) {
    return { error: state.players[seat].planes[planeIdx]?.zone === 'hangar' ? '需要掷出 6 才能起飞' : '该棋子不可移动' };
  }

  const next = {
    ...state,
    players: state.players.map((pl) => ({ planes: pl.planes.map((x) => ({ ...x })) })),
    moveCount: state.moveCount + 1,
  };
  const events = [];
  const plane = next.players[seat].planes[planeIdx];

  if (plane.zone === 'hangar') {
    // 起飞(不触发跳/飞链)
    plane.zone = 'track';
    plane.p = 0;
    events.push({ kind: 'takeoff', seat, plane: planeIdx });
    captureAt(next, seat, ringCellOf(seat, 0), events);
  } else {
    const from = plane.p;
    let p = bouncedP(plane.p, dice);
    events.push({ kind: 'step', seat, plane: planeIdx, from, to: p, bounced: plane.p + dice > DONE_P });
    // 跳/飞链(仅环上):跳后只能接飞,飞后可再跳(跳→飞→跳 / 飞→跳);飞至多一次
    let flew = false;
    let lastWasJump = false;
    const land = () => {
      if (p > TRACK_MAX_P) return false; // 跑道内无链
      captureAt(next, seat, ringCellOf(seat, p), events);
      return true;
    };
    if (land()) {
      for (;;) {
        if (!flew && p === FLY_FROM_P) {
          p = FLY_TO_P;
          flew = true;
          lastWasJump = false;
          events.push({ kind: 'fly', seat, plane: planeIdx, to: p });
          if (!land()) break;
          continue;
        }
        if (
          !lastWasJump &&
          p <= TRACK_MAX_P &&
          colorOfRingCell(ringCellOf(seat, p)) === seat % 4 &&
          p + JUMP_STEP <= TRACK_MAX_P
        ) {
          p += JUMP_STEP;
          lastWasJump = true;
          events.push({ kind: 'jump', seat, plane: planeIdx, to: p });
          if (!land()) break;
          continue;
        }
        break;
      }
    }
    plane.p = p;
    if (p === DONE_P) {
      plane.zone = 'done';
      events.push({ kind: 'arrive', seat, plane: planeIdx });
    } else if (p > TRACK_MAX_P) {
      plane.zone = 'home';
    } else {
      plane.zone = 'track';
    }
  }

  // 终局
  if (next.players[seat].planes.every((x) => x.zone === 'done')) {
    next.winner = seat;
    next.phase = 'ended';
    next.dice = null;
    next.turn = null;
    events.push({ kind: 'win', seat });
    return { state: next, events };
  }

  // 回合:6 加掷,否则轮转
  next.dice = null;
  if (dice === 6) {
    events.push({ kind: 'extraTurn', seat });
  } else {
    next.turn = (seat + 1) % next.seatCount;
  }
  return { state: next, events };
}

export function apply(state, seat, move) {
  if (state.phase === 'ended') return { error: '对局已结束' };
  if (seat !== state.turn) return { error: '还没轮到你' };
  if (!move || typeof move.type !== 'string') return { error: '无效操作' };
  if (move.type === 'roll') return applyRoll(state, seat);
  if (move.type === 'move') return applyMovePlane(state, seat, move.plane);
  return { error: '无效操作' };
}

// 全公开(seed 不泄露以防预测骰子)
export function view(state) {
  const { seed, ...pub } = state;
  return pub;
}

export function status(state) {
  return {
    phase: state.phase,
    turn: state.phase === 'ended' ? null : state.turn,
    winner: state.winner,
    detail: state.winner !== null ? `${COLOR_NAMES[state.winner]}方四机全部到达` : undefined,
  };
}

/** UI:dice=null → 掷骰;否则可动飞机下标 */
export function legalMoves(viewState, seat) {
  if (viewState.phase !== 'playing' || viewState.turn !== seat) return null;
  if (viewState.dice === null) return { kind: 'roll' };
  return { kind: 'move', planes: movablePlanes(viewState, seat) };
}
