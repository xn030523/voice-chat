// 中国象棋:完整规则(蹩马腿/塞象眼/将帅照面禁/送将禁/兵过河横移/炮架),
// 终局 = 对方无合法步:被将 → 绝杀;未被将 → 困毙(象棋规则:困毙判走子方胜)。
// 长将/长捉禁手 v1 不实现(好友自律)。
// 纯函数同构,零外部依赖(前端 import 本文件做走法高亮)。

export const meta = {
  id: 'xiangqi',
  name: '象棋',
  minSeats: 2,
  maxSeats: 2,
  defaultOpts: {},
};

// 棋盘 9 列 × 10 行,idx = r*9+c。行 0 = 黑方底线(上),行 9 = 红方底线(下)。
// side 0 = 红(先行,向上走 r--),side 1 = 黑(向下走 r++)。
const W = 9;
const H = 10;
const idx = (r, c) => r * W + c;
const rcOf = (i) => [Math.floor(i / W), i % W];
const inBoard = (r, c) => r >= 0 && r < H && c >= 0 && c < W;
const inPalace = (side, r, c) => c >= 3 && c <= 5 && (side === 0 ? r >= 7 : r <= 2);
const crossedRiver = (side, r) => (side === 0 ? r <= 4 : r >= 5);

// kind: K帅/将 A仕/士 E相/象 H马 R车 C炮 P兵/卒
export const PIECE_NAMES = {
  0: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵' },
  1: { K: '将', A: '士', E: '象', H: '马', R: '车', C: '炮', P: '卒' },
};

function initialBoard() {
  const board = new Array(W * H).fill(null);
  const back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
  for (let c = 0; c < W; c++) {
    board[idx(0, c)] = { side: 1, kind: back[c] };
    board[idx(9, c)] = { side: 0, kind: back[c] };
  }
  for (const c of [1, 7]) {
    board[idx(2, c)] = { side: 1, kind: 'C' };
    board[idx(7, c)] = { side: 0, kind: 'C' };
  }
  for (const c of [0, 2, 4, 6, 8]) {
    board[idx(3, c)] = { side: 1, kind: 'P' };
    board[idx(6, c)] = { side: 0, kind: 'P' };
  }
  return board;
}

export function init(seatCount, opts, rng) {
  const redSeat = rng() < 0.5 ? 0 : 1;
  return {
    board: initialBoard(),
    redSeat, // 红方所在座位(红先行)
    turn: redSeat,
    inCheck: false, // 当前行动方是否正被将军(UI 提示)
    lastMove: null, // {from,to}
    moveCount: 0,
    winner: null,
    endReason: null, // 'mate' | 'stalemate'
  };
}

export function sideOfSeat(state, seat) {
  return seat === state.redSeat ? 0 : 1;
}

function findKing(board, side) {
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && p.side === side && p.kind === 'K') return i;
  }
  return -1;
}

/** 单步走法校验:返回 null(合法)或中文原因(只查棋子规则,不查送将/照面) */
function moveReason(board, side, from, to) {
  const p = board[from];
  if (!p || p.side !== side) return '请选择己方棋子';
  if (from === to) return '原地不动可不行';
  const t = board[to];
  if (t && t.side === side) return '不能吃自己的棋子';
  const [fr, fc] = rcOf(from);
  const [tr, tc] = rcOf(to);
  const dr = tr - fr;
  const dc = tc - fc;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  switch (p.kind) {
    case 'K': {
      if (!inPalace(side, tr, tc)) return '帅(将)不能出九宫';
      if (adr + adc !== 1) return '帅(将)一次只走一步';
      return null;
    }
    case 'A': {
      if (!inPalace(side, tr, tc)) return '仕(士)不能出九宫';
      if (adr !== 1 || adc !== 1) return '仕(士)只能斜走一步';
      return null;
    }
    case 'E': {
      if (adr !== 2 || adc !== 2) return '相(象)走田字';
      if (crossedRiver(side, tr)) return '相(象)不能过河';
      if (board[idx(fr + dr / 2, fc + dc / 2)]) return '塞象眼';
      return null;
    }
    case 'H': {
      if (!((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return '马走日字';
      const legR = fr + (adr === 2 ? dr / 2 : 0);
      const legC = fc + (adc === 2 ? dc / 2 : 0);
      if (board[idx(legR, legC)]) return '蹩马腿';
      return null;
    }
    case 'R':
    case 'C': {
      if (dr !== 0 && dc !== 0) return p.kind === 'R' ? '车走直线' : '炮走直线';
      let between = 0;
      const sr = Math.sign(dr);
      const sc = Math.sign(dc);
      let r = fr + sr;
      let c = fc + sc;
      while (r !== tr || c !== tc) {
        if (board[idx(r, c)]) between++;
        r += sr;
        c += sc;
      }
      if (p.kind === 'R') {
        if (between > 0) return '车不能越子';
        return null;
      }
      // 炮:平移需无遮挡,吃子必须恰好隔一个炮架
      if (t) {
        if (between !== 1) return between === 0 ? '炮吃子需要炮架' : '炮架只能有一个';
        return null;
      }
      if (between > 0) return '炮平移不能越子';
      return null;
    }
    case 'P': {
      const fwd = side === 0 ? -1 : 1;
      if (dr === fwd && dc === 0) return null;
      if (dr === 0 && adc === 1) {
        if (!crossedRiver(side, fr)) return '兵(卒)过河前只能前进';
        return null;
      }
      if (dr === -fwd) return '兵(卒)不能后退';
      return '兵(卒)只能走一步';
    }
    default:
      return '未知棋子';
  }
}

/** 将帅照面(同列无遮挡) */
export function facingGenerals(board) {
  const k0 = findKing(board, 0);
  const k1 = findKing(board, 1);
  if (k0 < 0 || k1 < 0) return false;
  const [r0, c0] = rcOf(k0);
  const [r1, c1] = rcOf(k1);
  if (c0 !== c1) return false;
  for (let r = Math.min(r0, r1) + 1; r < Math.max(r0, r1); r++) {
    if (board[idx(r, c0)]) return false;
  }
  return true;
}

/** side 的帅(将)是否正被攻击 */
export function isKingAttacked(board, side) {
  const k = findKing(board, side);
  if (k < 0) return true;
  const enemy = 1 - side;
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || p.side !== enemy) continue;
    if (moveReason(board, enemy, i, k) === null) return true;
  }
  return false;
}

function applyOnBoard(board, from, to) {
  const next = board.slice();
  next[to] = next[from];
  next[from] = null;
  return next;
}

/** 完整合法性(含送将/照面),返回 null 或原因 */
function fullMoveReason(board, side, from, to) {
  const r = moveReason(board, side, from, to);
  if (r) return r;
  const after = applyOnBoard(board, from, to);
  if (isKingAttacked(after, side)) return '不能送将';
  if (facingGenerals(after)) return '将帅不可照面';
  return null;
}

/** side 是否存在任意合法步 */
function hasAnyLegalMove(board, side) {
  for (let from = 0; from < board.length; from++) {
    const p = board[from];
    if (!p || p.side !== side) continue;
    for (let to = 0; to < board.length; to++) {
      if (fullMoveReason(board, side, from, to) === null) return true;
    }
  }
  return false;
}

export function apply(state, seat, move) {
  if (state.winner !== null) return { error: '对局已结束' };
  if (seat !== state.turn) return { error: '还没轮到你' };
  const from = move?.from | 0;
  const to = move?.to | 0;
  if (
    !move ||
    typeof move.from !== 'number' ||
    typeof move.to !== 'number' ||
    from < 0 ||
    from >= 90 ||
    to < 0 ||
    to >= 90
  ) {
    return { error: '无效走法' };
  }
  const side = sideOfSeat(state, seat);
  const reason = fullMoveReason(state.board, side, from, to);
  if (reason) return { error: reason };

  const captured = state.board[to];
  const board = applyOnBoard(state.board, from, to);
  const piece = board[to];
  const events = [
    {
      kind: 'move',
      seat,
      from,
      to,
      piece: PIECE_NAMES[piece.side][piece.kind],
      captured: captured ? PIECE_NAMES[captured.side][captured.kind] : null,
    },
  ];

  const enemySide = 1 - side;
  const enemySeat = 1 - seat;
  const enemyInCheck = isKingAttacked(board, enemySide);
  const enemyHasMove = hasAnyLegalMove(board, enemySide);

  const next = {
    ...state,
    board,
    lastMove: { from, to },
    moveCount: state.moveCount + 1,
    turn: enemySeat,
    inCheck: enemyInCheck,
  };

  if (!enemyHasMove) {
    next.winner = seat;
    next.endReason = enemyInCheck ? 'mate' : 'stalemate';
    events.push({ kind: enemyInCheck ? 'mate' : 'stalemate', winner: seat });
  } else if (enemyInCheck) {
    events.push({ kind: 'check', seat: enemySeat });
  }
  return { state: next, events };
}

// 全公开
export function view(state) {
  return state;
}

export function status(state) {
  return {
    phase: state.winner !== null ? 'ended' : 'playing',
    turn: state.winner !== null ? null : state.turn,
    winner: state.winner,
  };
}

/** 点选高亮:from 的全部合法落点(含送将/照面过滤) */
export function legalMoves(viewState, seat, sel) {
  if (viewState.winner !== null || seat === null || seat !== viewState.turn) return [];
  const from = sel?.from;
  if (typeof from !== 'number') return [];
  const side = sideOfSeat(viewState, seat);
  const out = [];
  for (let to = 0; to < viewState.board.length; to++) {
    if (fullMoveReason(viewState.board, side, from, to) === null) out.push(to);
  }
  return out;
}
