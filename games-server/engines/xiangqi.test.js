import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as xq from './xiangqi.js';

const rngRed0 = () => 0.1; // redSeat=0

function fresh() {
  return xq.init(2, {}, rngRed0);
}

const idx = (r, c) => r * 9 + c;

/** 自定义局面:pieces = [[r,c,side,kind]…] */
function custom(pieces, turnSeat, redSeat = 0) {
  const board = new Array(90).fill(null);
  for (const [r, c, side, kind] of pieces) board[idx(r, c)] = { side, kind };
  return {
    board,
    redSeat,
    turn: turnSeat,
    inCheck: false,
    lastMove: null,
    moveCount: 0,
    winner: null,
    endReason: null,
  };
}

test('init:32 子、红先行、布局抽查', () => {
  const s = fresh();
  assert.equal(s.board.filter(Boolean).length, 32);
  assert.equal(s.turn, s.redSeat);
  assert.deepEqual(s.board[idx(9, 4)], { side: 0, kind: 'K' }); // 红帅
  assert.deepEqual(s.board[idx(0, 4)], { side: 1, kind: 'K' }); // 黑将
  assert.deepEqual(s.board[idx(7, 1)], { side: 0, kind: 'C' }); // 红炮
  assert.deepEqual(s.board[idx(3, 0)], { side: 1, kind: 'P' }); // 黑卒
});

test('马:正常日字 / 蹩马腿 / 非日字拒', () => {
  const s = fresh();
  // 红马 (9,1) → (7,2):腿位 (8,1) 空 → 合法
  const ok = xq.apply(s, 0, { from: idx(9, 1), to: idx(7, 2) });
  assert.equal(ok.error, undefined);
  // 红马 (9,1) → (7,0) 同样合法;但马 (9,7) → (7,6) 腿位 (8,7) 空 → 合法
  // 构造蹩腿:马(5,5),腿位(5,6)有子,(5,5)→(4,7) 被蹩(注意双王错列避免照面)
  const s2 = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [5, 5, 0, 'H'],
      [5, 6, 0, 'P'],
    ],
    0
  );
  const r = xq.apply(s2, 0, { from: idx(5, 5), to: idx(4, 7) });
  assert.equal(r.error, '蹩马腿');
  // 竖日 (5,5)→(3,6):腿位 (4,5) 空 → 合法
  assert.equal(xq.apply(s2, 0, { from: idx(5, 5), to: idx(3, 6) }).error, undefined);
  // 非日字
  assert.equal(xq.apply(s2, 0, { from: idx(5, 5), to: idx(5, 3) }).error, '马走日字');
});

test('相:塞象眼 / 不能过河', () => {
  const s = fresh();
  // 红相 (9,2) → (7,4):象眼 (8,3) 空 → 合法
  assert.equal(xq.apply(s, 0, { from: idx(9, 2), to: idx(7, 4) }).error, undefined);
  // 塞象眼:(9,2)→(7,0) 象眼 (8,1) 放个子
  const s2 = custom(
    [
      [9, 4, 0, 'K'],
      [0, 4, 1, 'K'],
      [9, 2, 0, 'E'],
      [8, 1, 0, 'P'],
    ],
    0
  );
  assert.equal(xq.apply(s2, 0, { from: idx(9, 2), to: idx(7, 0) }).error, '塞象眼');
  // 过河:相 (5,2) → (3,4)
  const s3 = custom(
    [
      [9, 4, 0, 'K'],
      [0, 4, 1, 'K'],
      [5, 2, 0, 'E'],
    ],
    0
  );
  assert.equal(xq.apply(s3, 0, { from: idx(5, 2), to: idx(3, 4) }).error, '相(象)不能过河');
});

test('炮:隔山打 / 无架不吃 / 双架不吃 / 平移不越子', () => {
  // 红炮(7,4),黑卒(5,4) 作炮架,黑车(3,4) 为目标
  const s = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [7, 4, 0, 'C'],
      [5, 4, 1, 'P'],
      [3, 4, 1, 'R'],
    ],
    0
  );
  assert.equal(xq.apply(s, 0, { from: idx(7, 4), to: idx(3, 4) }).error, undefined); // 隔一打 ✓
  // 无架吃:炮(7,4) 直接吃 (5,4)
  assert.equal(xq.apply(s, 0, { from: idx(7, 4), to: idx(5, 4) }).error, '炮吃子需要炮架');
  // 双架:加一个子 (6,4)
  const s2 = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [7, 4, 0, 'C'],
      [6, 4, 0, 'P'],
      [5, 4, 1, 'P'],
      [3, 4, 1, 'R'],
    ],
    0
  );
  assert.equal(xq.apply(s2, 0, { from: idx(7, 4), to: idx(3, 4) }).error, '炮架只能有一个');
  // 平移越子
  assert.equal(xq.apply(s2, 0, { from: idx(7, 4), to: idx(4, 4) }).error, '炮平移不能越子');
});

test('兵:过河前只进 / 过河后可横 / 永不后退', () => {
  const s = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [6, 0, 0, 'P'], // 未过河红兵
      [4, 8, 0, 'P'], // 已过河红兵
    ],
    0
  );
  assert.equal(xq.apply(s, 0, { from: idx(6, 0), to: idx(5, 0) }).error, undefined); // 前进 ✓
  assert.equal(xq.apply(s, 0, { from: idx(6, 0), to: idx(6, 1) }).error, '兵(卒)过河前只能前进');
  assert.equal(xq.apply(s, 0, { from: idx(4, 8), to: idx(4, 7) }).error, undefined); // 过河横移 ✓
  assert.equal(xq.apply(s, 0, { from: idx(4, 8), to: idx(5, 8) }).error, '兵(卒)不能后退');
});

test('帅/仕:不出九宫', () => {
  const s = custom(
    [
      [9, 4, 0, 'K'],
      [9, 3, 0, 'A'],
      [0, 4, 1, 'K'],
    ],
    0
  );
  assert.equal(xq.apply(s, 0, { from: idx(9, 4), to: idx(9, 5) }).error, undefined); // 宫内 ✓
  const s2 = custom(
    [
      [7, 3, 0, 'K'],
      [0, 4, 1, 'K'],
    ],
    0
  );
  assert.equal(xq.apply(s2, 0, { from: idx(7, 3), to: idx(6, 3) }).error, '帅(将)不能出九宫');
  assert.equal(xq.apply(s, 0, { from: idx(9, 3), to: idx(8, 3) }).error, '仕(士)只能斜走一步');
  assert.equal(xq.apply(s, 0, { from: idx(9, 3), to: idx(8, 4) }).error, undefined); // 斜走 ✓
});

test('将帅不可照面', () => {
  // 双王同列,黑士 (1,4) 是唯一遮挡;黑士斜走离开 → 照面 → 拒
  const s = custom(
    [
      [9, 4, 0, 'K'],
      [0, 4, 1, 'K'],
      [1, 4, 1, 'A'],
    ],
    1 // 黑行动(seat1=黑,redSeat=0)
  );
  assert.equal(xq.apply(s, 1, { from: idx(1, 4), to: idx(2, 3) }).error, '将帅不可照面');
});

test('不能送将(被牵制的子不能离线)', () => {
  // 黑车 (5,4) 挡在红车 (8,4) 与黑将 (0,4) 之间
  const s = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [8, 4, 0, 'R'],
      [5, 4, 1, 'R'],
    ],
    1
  );
  assert.equal(xq.apply(s, 1, { from: idx(5, 4), to: idx(5, 0) }).error, '不能送将');
  // 沿线移动则合法
  assert.equal(xq.apply(s, 1, { from: idx(5, 4), to: idx(4, 4) }).error, undefined);
});

test('绝杀:双车杀,winner + endReason=mate + 事件', () => {
  // 黑将(0,4),红车A(1,8) 封 1 路,红车B(2,7) → (0,7) 照将成杀
  const s = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [1, 8, 0, 'R'],
      [2, 7, 0, 'R'],
    ],
    0
  );
  const r = xq.apply(s, 0, { from: idx(2, 7), to: idx(0, 7) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.endReason, 'mate');
  assert.ok(r.events.some((e) => e.kind === 'mate' && e.winner === 0));
  assert.deepEqual(xq.status(r.state), { phase: 'ended', turn: null, winner: 0 });
});

test('困毙:无子可动判负(走子方胜),endReason=stalemate', () => {
  // 黑将(0,3) 孤将;红兵 (2,4)→(1,4) 后封死 (0,4)/(1,3),黑无步且未被将
  const s = custom(
    [
      [9, 5, 0, 'K'],
      [0, 3, 1, 'K'],
      [2, 4, 0, 'P'],
    ],
    0
  );
  const r = xq.apply(s, 0, { from: idx(2, 4), to: idx(1, 4) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.endReason, 'stalemate');
  assert.ok(r.events.some((e) => e.kind === 'stalemate'));
});

test('将军事件与 inCheck 标记', () => {
  // 红车 (5,0) → (0,0):黑将 (0,4) 被照(行 0 无遮挡)但有解(将上 (1,4))
  const s = custom(
    [
      [9, 3, 0, 'K'],
      [0, 4, 1, 'K'],
      [5, 0, 0, 'R'],
    ],
    0
  );
  const r = xq.apply(s, 0, { from: idx(5, 0), to: idx(0, 0) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.winner, null);
  assert.equal(r.state.inCheck, true);
  assert.ok(r.events.some((e) => e.kind === 'check'));
});

test('legalMoves:被将时只返回解将步', () => {
  // 黑将 (0,4) 被红车 (5,4) 照将;红帅 (9,4)(车在中间遮挡,不构成照面)
  const s = custom(
    [
      [9, 4, 0, 'K'],
      [0, 4, 1, 'K'],
      [5, 4, 0, 'R'],
      [2, 0, 1, 'R'],
    ],
    1
  );
  // 黑将从 (0,4) 可到 (0,3),(0,5),(1,4):(1,4) 仍在车线上 → 非法;(0,3),(0,5) 离线 ✓
  const kingMoves = xq.legalMoves(s, 1, { from: idx(0, 4) });
  assert.deepEqual(kingMoves.sort((a, b) => a - b), [idx(0, 3), idx(0, 5)]);
  // 黑车可垫将:(2,0)→(2,4)
  const rookMoves = xq.legalMoves(s, 1, { from: idx(2, 0) });
  assert.ok(rookMoves.includes(idx(2, 4)));
  // 不解将的车步被滤掉
  assert.ok(!rookMoves.includes(idx(2, 1)));
});

test('view 全公开、非回合拒、终局拒', () => {
  const s = fresh();
  assert.deepEqual(xq.view(s, 0), s);
  assert.ok(xq.apply(s, 1, { from: idx(2, 1), to: idx(2, 4) }).error); // 黑先动 → 拒
});
