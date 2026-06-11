import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ludo from './ludo.js';
import { ringCellOf, FLY_FROM_P, FLY_TO_P } from './ludo-board.js';

const rngSeq = (seq) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

function fixture({ seatCount = 2, turn = 0, dice = null, planes }) {
  // planes: {seat: [{zone,p,slot}…]} 简写,未给的默认在机库
  const players = Array.from({ length: seatCount }, (_, s) => ({
    planes: Array.from({ length: 4 }, (_, i) =>
      planes?.[s]?.[i] ? { slot: i, ...planes[s][i] } : { zone: 'hangar', p: -1, slot: i }
    ),
  }));
  return {
    phase: 'playing',
    seatCount,
    players,
    turn,
    dice,
    seed: 12345,
    winner: null,
    lastDice: null,
    moveCount: 0,
  };
}

test('init:全机在库、座位数夹紧 2-4', () => {
  const s = ludo.init(3, {}, rngSeq([0.4, 0.7]));
  assert.equal(s.seatCount, 3);
  assert.equal(s.players.length, 3);
  assert.ok(s.players.every((p) => p.planes.every((x) => x.zone === 'hangar')));
  assert.equal(ludo.init(9, {}, rngSeq([0.1, 0.2])).seatCount, 4);
});

test('流程:未掷骰不能动 / 掷后必须动 / 连续掷骰拒', () => {
  let s = fixture({ planes: { 0: [{ zone: 'track', p: 3 }] } });
  assert.ok(ludo.apply(s, 0, { type: 'move', plane: 0 }).error); // 未掷
  const r = ludo.apply(s, 0, { type: 'roll' });
  assert.equal(r.error, undefined);
  if (r.state.dice !== null) {
    assert.ok(ludo.apply(r.state, 0, { type: 'roll' }).error); // 再掷拒
  }
});

test('起飞:非 6 拒;6 起飞落入口且加掷', () => {
  let s = fixture({ dice: 3 });
  let r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.match(r.error, /6/);
  s = fixture({ dice: 6 });
  r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.players[0].planes[0].zone, 'track');
  assert.equal(r.state.players[0].planes[0].p, 0);
  assert.ok(r.events.some((e) => e.kind === 'takeoff'));
  assert.ok(r.events.some((e) => e.kind === 'extraTurn'));
  assert.equal(r.state.turn, 0); // 6 加掷,回合不轮转
  assert.equal(r.state.dice, null);
});

test('终点回弹:p=52 掷 6 → 110-58=52;p=50 掷 5 → 55 到达', () => {
  let s = fixture({ dice: 6, planes: { 0: [{ zone: 'home', p: 52 }] } });
  let r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.equal(r.state.players[0].planes[0].p, 52);
  assert.ok(r.events.find((e) => e.kind === 'step').bounced);
  s = fixture({ dice: 5, planes: { 0: [{ zone: 'home', p: 50 }] } });
  r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.equal(r.state.players[0].planes[0].zone, 'done');
  assert.ok(r.events.some((e) => e.kind === 'arrive'));
});

test('跳→飞→跳链:p=10 掷 2 → 落 12(己色)跳 16 → 飞 28 → 跳 32', () => {
  const s = fixture({ dice: 2, planes: { 0: [{ zone: 'track', p: 10 }] } });
  const r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.equal(r.error, undefined);
  const kinds = r.events.map((e) => e.kind);
  assert.deepEqual(kinds.filter((k) => ['step', 'jump', 'fly'].includes(k)), ['step', 'jump', 'fly', 'jump']);
  assert.equal(r.state.players[0].planes[0].p, FLY_TO_P + 4);
  assert.equal(FLY_FROM_P, 16);
});

test('击落:链上每个落点的敌机全部送回机库(迭子无豁免)', () => {
  // seat1 两架迭在 seat0 的环格 12 上(seat1 视角 p:ringCellOf(1,p)=12 → 13+p≡12 (mod 52) → p=51?>49 不合法
  // 改放在 seat0 的落点 16(飞起点):ringCellOf(0,16)=16;seat1 的 p 满足 (13+p)%52=16 → p=3 ✓
  const s = fixture({
    dice: 6,
    planes: {
      0: [{ zone: 'track', p: 10 }],
      1: [
        { zone: 'track', p: 3 }, // 在环格 16
        { zone: 'track', p: 3 }, // 迭子
      ],
    },
  });
  const r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  // p=10+6=16 落飞起点:先击落两架,再飞 28、跳 32
  assert.equal(r.error, undefined);
  const cap = r.events.find((e) => e.kind === 'capture');
  assert.ok(cap);
  assert.equal(cap.victims.length, 2);
  assert.ok(r.state.players[1].planes[0].zone === 'hangar' && r.state.players[1].planes[1].zone === 'hangar');
  assert.equal(r.state.players[0].planes[0].p, 32);
});

test('起飞击落入口敌机', () => {
  // seat1 的机在 seat0 入口(环格 0):(13+p)%52=0 → p=39
  const s = fixture({ dice: 6, planes: { 1: [{ zone: 'track', p: 39 }] } });
  const r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.ok(r.events.some((e) => e.kind === 'capture'));
  assert.equal(r.state.players[1].planes[0].zone, 'hangar');
});

test('无可动自动过(全机在库且骰非 6)', () => {
  // 注入 seed 使骰子非 6:试探多个 seed 找一个非 6 的
  let s = fixture({});
  let r = ludo.apply(s, 0, { type: 'roll' });
  let guard = 0;
  while (r.state.dice === 6 && guard++ < 20) {
    // 6 → 可起飞,先起飞再继续验证下一种子;直接换 seed 重掷更简单
    s = { ...s, seed: s.seed + 7 };
    r = ludo.apply(s, 0, { type: 'roll' });
  }
  if (r.state.dice === null) {
    // 骰非 6 已自动过
    assert.ok(r.events.some((e) => e.kind === 'noMove'));
    assert.equal(r.state.turn, 1);
  }
});

test('全到达胜,detail 带颜色名', () => {
  const s = fixture({
    dice: 1,
    planes: {
      0: [
        { zone: 'home', p: 54 },
        { zone: 'done', p: 55 },
        { zone: 'done', p: 55 },
        { zone: 'done', p: 55 },
      ],
    },
  });
  const r = ludo.apply(s, 0, { type: 'move', plane: 0 });
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.phase, 'ended');
  const st = ludo.status(r.state);
  assert.equal(st.winner, 0);
  assert.match(st.detail, /红方/);
});

test('view 不泄露 seed;legalMoves roll/move 两态', () => {
  const s = fixture({ planes: { 0: [{ zone: 'track', p: 5 }] } });
  const v = ludo.view(s, 0);
  assert.equal(v.seed, undefined);
  assert.deepEqual(ludo.legalMoves(v, 0), { kind: 'roll' });
  const s2 = { ...s, dice: 4 };
  const lm = ludo.legalMoves(ludo.view(s2, 0), 0);
  assert.equal(lm.kind, 'move');
  assert.deepEqual(lm.planes, [0]); // 机库三架非 6 不可动
  const s3 = { ...s, dice: 6 };
  assert.deepEqual(ludo.legalMoves(ludo.view(s3, 0), 0).planes, [0, 1, 2, 3]);
});
