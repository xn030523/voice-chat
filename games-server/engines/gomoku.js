// 五子棋:15×15,无禁手,≥5 连即胜(长连算胜),满盘平局
// 引擎契约:纯函数、同构(浏览器会打包此文件)、零外部依赖

export const meta = {
  id: 'gomoku',
  name: '五子棋',
  minSeats: 2,
  maxSeats: 2,
  defaultOpts: {},
};

const SIZE = 15;

export function init(seatCount, opts, rng) {
  const black = rng() < 0.5 ? 0 : 1; // 随机定先手(黑先)
  return {
    size: SIZE,
    board: new Array(SIZE * SIZE).fill(0), // 0 空 / 1 seat0 / 2 seat1
    black,
    turn: black,
    moves: 0,
    lastMove: null, // {x,y,seat}
    winner: null, // 0 | 1 | 'draw' | null
    winLine: null, // [{x,y}×5+] 胜利连线
  };
}

function lineFrom(board, x, y, dx, dy, v) {
  // 以 (x,y) 为锚,沿 ±(dx,dy) 收集同色连续点
  const pts = [{ x, y }];
  for (const s of [1, -1]) {
    let cx = x + dx * s;
    let cy = y + dy * s;
    while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE && board[cy * SIZE + cx] === v) {
      pts.push({ x: cx, y: cy });
      cx += dx * s;
      cy += dy * s;
    }
  }
  return pts;
}

export function apply(state, seat, move) {
  if (state.winner !== null) return { error: '对局已结束' };
  if (seat !== state.turn) return { error: '还没轮到你' };
  const x = move?.x | 0;
  const y = move?.y | 0;
  if (!move || typeof move.x !== 'number' || typeof move.y !== 'number') return { error: '无效落子' };
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return { error: '落子越界' };
  const idx = y * SIZE + x;
  if (state.board[idx] !== 0) return { error: '该位置已有棋子' };

  const board = state.board.slice();
  const v = seat + 1;
  board[idx] = v;

  const next = {
    ...state,
    board,
    moves: state.moves + 1,
    lastMove: { x, y, seat },
    turn: 1 - seat,
  };
  const events = [{ kind: 'place', seat, x, y }];

  // 四方向找 ≥5 连
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const pts = lineFrom(board, x, y, dx, dy, v);
    if (pts.length >= 5) {
      next.winner = seat;
      next.winLine = pts;
      events.push({ kind: 'win', seat });
      return { state: next, events };
    }
  }
  if (next.moves >= SIZE * SIZE) {
    next.winner = 'draw';
    events.push({ kind: 'draw' });
  }
  return { state: next, events };
}

// 全公开信息,view 不裁剪
export function view(state /* , seat */) {
  return state;
}

export function status(state) {
  return {
    phase: state.winner !== null ? 'ended' : 'playing',
    turn: state.winner !== null ? null : state.turn,
    winner: state.winner,
  };
}

// 任意空点皆可落,hints 不必枚举(客户端直接点击空交叉点)
export function legalMoves(viewState, seat) {
  if (viewState.winner !== null || seat !== viewState.turn) return [];
  return null; // null = 任意空位
}
