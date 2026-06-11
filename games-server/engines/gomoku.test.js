import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gomoku from './gomoku.js';

const rngConst = (v) => () => v;

function freshState(black = 0) {
  // rng()<0.5 → black=0
  return gomoku.init(2, {}, rngConst(black === 0 ? 0.1 : 0.9));
}

// 依次落子的辅助:moves = [[seat,x,y]…],返回最后一次 apply 结果
function play(state, moves) {
  let res = { state };
  for (const [seat, x, y] of moves) {
    res = gomoku.apply(res.state, seat, { x, y });
    assert.equal(res.error, undefined, `落子 (${x},${y}) 不应失败:${res.error}`);
  }
  return res;
}

test('init:随机定先手,黑方先行', () => {
  const s0 = freshState(0);
  assert.equal(s0.black, 0);
  assert.equal(s0.turn, 0);
  const s1 = freshState(1);
  assert.equal(s1.black, 1);
  assert.equal(s1.turn, 1);
  assert.equal(s0.board.length, 225);
});

test('横向五连胜', () => {
  const res = play(freshState(), [
    [0, 0, 0], [1, 0, 1],
    [0, 1, 0], [1, 1, 1],
    [0, 2, 0], [1, 2, 1],
    [0, 3, 0], [1, 3, 1],
    [0, 4, 0],
  ]);
  assert.equal(res.state.winner, 0);
  assert.equal(res.state.winLine.length, 5);
  assert.ok(res.events.some((e) => e.kind === 'win' && e.seat === 0));
});

test('纵向五连胜', () => {
  const res = play(freshState(), [
    [0, 7, 0], [1, 8, 0],
    [0, 7, 1], [1, 8, 1],
    [0, 7, 2], [1, 8, 2],
    [0, 7, 3], [1, 8, 3],
    [0, 7, 4],
  ]);
  assert.equal(res.state.winner, 0);
});

test('主斜五连胜(\\)', () => {
  const res = play(freshState(), [
    [0, 0, 0], [1, 1, 0],
    [0, 1, 1], [1, 2, 0],
    [0, 2, 2], [1, 3, 0],
    [0, 3, 3], [1, 4, 0],
    [0, 4, 4],
  ]);
  assert.equal(res.state.winner, 0);
});

test('副斜五连胜(/),且中间补点也算(锚点在线中部)', () => {
  // seat0 落 (4,0),(3,1),(1,3),(0,4) 后补中点 (2,2) 成五连
  const res = play(freshState(), [
    [0, 4, 0], [1, 10, 10],
    [0, 3, 1], [1, 10, 11],
    [0, 1, 3], [1, 10, 12],
    [0, 0, 4], [1, 10, 13],
    [0, 2, 2],
  ]);
  assert.equal(res.state.winner, 0);
});

test('长连(六连)也算胜', () => {
  // 先摆 _XXXX_ 再补中间成 6 连:0,1,2,3,5 → 补 4(seat1 填充子彼此隔开不成连)
  const res = play(freshState(), [
    [0, 0, 7], [1, 0, 0],
    [0, 1, 7], [1, 2, 0],
    [0, 2, 7], [1, 4, 0],
    [0, 3, 7], [1, 6, 0],
    [0, 5, 7], [1, 8, 0],
    [0, 4, 7],
  ]);
  assert.equal(res.state.winner, 0);
  assert.equal(res.state.winLine.length, 6);
});

test('占位拒、越界拒、非回合拒、终局拒', () => {
  const s = freshState();
  const r1 = gomoku.apply(s, 0, { x: 5, y: 5 });
  assert.equal(r1.error, undefined);
  // 同点再落
  assert.ok(gomoku.apply(r1.state, 1, { x: 5, y: 5 }).error);
  // 越界
  assert.ok(gomoku.apply(r1.state, 1, { x: 15, y: 0 }).error);
  assert.ok(gomoku.apply(r1.state, 1, { x: -1, y: 0 }).error);
  // 非回合(轮到 1,0 来落)
  assert.ok(gomoku.apply(r1.state, 0, { x: 6, y: 6 }).error);
  // 终局后落子拒
  const win = play(r1.state, [
    [1, 0, 14],
    [0, 6, 5], [1, 1, 14],
    [0, 7, 5], [1, 2, 14],
    [0, 8, 5], [1, 3, 14],
    [0, 9, 5],
  ]);
  assert.equal(win.state.winner, 0);
  assert.ok(gomoku.apply(win.state, 1, { x: 4, y: 14 }).error);
});

test('满盘平局', () => {
  // 构造无五连满盘:错位砖纹——偶数行 AABB 循环,奇数行平移 2(BBAA)。
  // 四个方向最大同色连长均为 2(横 2/竖 1/两斜 2),全程安全。
  const s = freshState();
  const cells = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const color = (x + 2 * (y % 2)) % 4 < 2 ? 0 : 1;
      cells.push({ x, y, color });
    }
  }
  // 按回合交替喂子:每次轮到 seatN 时从其颜色池取一个(色 0 共 113 子,先手恰好用完)
  const pool = [cells.filter((c) => c.color === 0), cells.filter((c) => c.color === 1)];
  let st = s;
  let guard = 0;
  while (st.winner === null && guard++ < 300) {
    const seat = st.turn;
    const cell = pool[seat].pop();
    assert.ok(cell, `seat${seat} 颜色池意外用尽于第 ${st.moves} 手`);
    const r = gomoku.apply(st, seat, cell);
    assert.equal(r.error, undefined, `(${cell.x},${cell.y}) 落子失败`);
    st = r.state;
  }
  assert.equal(st.winner, 'draw');
  assert.equal(st.moves, 225);
});

test('view 全公开,status 正确', () => {
  const s = freshState();
  assert.deepEqual(gomoku.view(s, 0), s);
  assert.deepEqual(gomoku.view(s, null), s);
  assert.deepEqual(gomoku.status(s), { phase: 'playing', turn: 0, winner: null });
});
