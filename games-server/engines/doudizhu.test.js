import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ddz from './doudizhu.js';

const rngFixed = (seq) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

function fresh(rng = rngFixed([0.5, 0.31, 0.77, 0.12, 0.9, 0.45, 0.66, 0.23, 0.81])) {
  return ddz.init(3, {}, rng);
}

/** 构造指定手牌的对局中状态(landlord 已定) */
function playingState({ hands, landlord = 0, turn = landlord, lastPlay = null, playsBySeat = [0, 0, 0] }) {
  return {
    phase: 'playing',
    hands,
    bottom: [0, 1, 2],
    bidding: { highest: { seat: landlord, score: 3 }, acted: 1 },
    landlord,
    firstBidder: 0,
    turn,
    lastPlay,
    passCount: 0,
    multiplier: { base: 3, bombs: 0, spring: false },
    playsBySeat,
    winnerSeat: null,
    winnerCamp: null,
    seed: 42,
    redeals: 0,
  };
}

// rank 造牌辅助(同 cards 测试)
function byRanks(ranks) {
  const used = new Map();
  return ranks.map((r) => {
    if (r === 16) return 52;
    if (r === 17) return 53;
    const i = used.get(r) || 0;
    used.set(r, i + 1);
    return (r - 3) * 4 + i;
  });
}

test('init:17×3+3 底牌,54 张不重不漏,bidding 阶段', () => {
  const s = fresh();
  assert.equal(s.phase, 'bidding');
  assert.deepEqual(s.hands.map((h) => h.length), [17, 17, 17]);
  assert.equal(s.bottom.length, 3);
  const all = [...s.hands.flat(), ...s.bottom].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 54 }, (_, i) => i));
  assert.equal(s.turn, s.firstBidder);
});

test('叫分流转:1 分 → 2 分 → 不叫 → 2 分者当地主,底牌并入', () => {
  let s = fresh();
  const a = s.firstBidder;
  const b = (a + 1) % 3;
  const c = (a + 2) % 3;
  let r = ddz.apply(s, a, { type: 'bid', score: 1 });
  assert.equal(r.error, undefined);
  r = ddz.apply(r.state, b, { type: 'bid', score: 2 });
  assert.equal(r.error, undefined);
  // 不能叫平分
  assert.ok(ddz.apply(r.state, c, { type: 'bid', score: 2 }).error);
  r = ddz.apply(r.state, c, { type: 'bid', score: 0 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'playing');
  assert.equal(r.state.landlord, b);
  assert.equal(r.state.turn, b);
  assert.equal(r.state.hands[b].length, 20);
  assert.equal(r.state.multiplier.base, 2);
  assert.ok(r.events.some((e) => e.kind === 'landlord' && e.seat === b));
});

test('叫 3 分立即定地主', () => {
  const s = fresh();
  const r = ddz.apply(s, s.firstBidder, { type: 'bid', score: 3 });
  assert.equal(r.state.phase, 'playing');
  assert.equal(r.state.landlord, s.firstBidder);
});

test('全不叫 → 重新发牌,首叫人轮转', () => {
  let s = fresh();
  const first = s.firstBidder;
  let r = { state: s };
  for (let i = 0; i < 3; i++) {
    r = ddz.apply(r.state, r.state.turn, { type: 'bid', score: 0 });
    assert.equal(r.error, undefined);
  }
  assert.equal(r.state.phase, 'bidding');
  assert.equal(r.state.redeals, 1);
  assert.equal(r.state.firstBidder, (first + 1) % 3);
  assert.deepEqual(r.state.hands.map((h) => h.length), [17, 17, 17]);
  assert.ok(r.events.some((e) => e.kind === 'redeal'));
});

test('出牌:跟牌须压制,管不上拒,两过后自由出', () => {
  const hands = [byRanks([14, 14, 9, 8]), byRanks([10, 10, 5]), byRanks([13, 12, 4])];
  let s = playingState({ hands, landlord: 0 });
  // 地主出对 A?手牌 [A,A,9,8]:出对 A
  let r = ddz.apply(s, 0, { type: 'play', cards: [hands[0][0], hands[0][1]] });
  assert.equal(r.error, undefined);
  // seat1 对 10 管不上对 A
  assert.equal(ddz.apply(r.state, 1, { type: 'play', cards: [hands[1][0], hands[1][1]] }).error, '管不上');
  // seat1 过
  r = ddz.apply(r.state, 1, { type: 'pass' });
  assert.equal(r.error, undefined);
  // seat2 过 → lastPlay 清空
  r = ddz.apply(r.state, 2, { type: 'pass' });
  assert.equal(r.state.lastPlay, null);
  // 回到 seat0 自由出;此时不能 pass(首家不能不出)
  assert.ok(ddz.apply(r.state, 0, { type: 'pass' }).error);
  r = ddz.apply(r.state, 0, { type: 'play', cards: [hands[0][2]] }); // 单 9
  assert.equal(r.error, undefined);
  // 不在手中的牌
  assert.ok(ddz.apply(r.state, 1, { type: 'play', cards: [hands[0][3]] }).error);
});

test('炸弹翻倍 + 王炸再翻倍', () => {
  const hands = [byRanks([5, 5, 5, 5, 3]), byRanks([16, 17, 4]), byRanks([9, 9, 8])];
  let s = playingState({ hands, landlord: 0 });
  let r = ddz.apply(s, 0, { type: 'play', cards: hands[0].slice(0, 4) }); // 炸弹
  assert.ok(r.events.some((e) => e.kind === 'bomb'));
  assert.equal(r.state.multiplier.bombs, 1);
  r = ddz.apply(r.state, 1, { type: 'play', cards: [52, 53] }); // 王炸压炸弹
  assert.equal(r.error, undefined);
  assert.equal(r.state.multiplier.bombs, 2);
  assert.equal(ddz.displayMultiplier(r.state), 3 * 4);
});

test('终局:农民先空手 → 农民阵营胜;detail 带倍数', () => {
  const hands = [byRanks([14, 13]), byRanks([5]), byRanks([9, 9, 8])];
  let s = playingState({ hands, landlord: 0, turn: 1, playsBySeat: [2, 1, 1] });
  const r = ddz.apply(s, 1, { type: 'play', cards: hands[1] });
  assert.equal(r.state.phase, 'ended');
  assert.equal(r.state.winnerSeat, 1);
  assert.equal(r.state.winnerCamp, 'farmers');
  const st = ddz.status(r.state);
  assert.equal(st.winner, 1);
  assert.match(st.detail, /农民阵营获胜/);
});

test('春天:地主全程独走 ×2;反春:地主仅出一手', () => {
  // 春天:农民 0 手
  const hands = [byRanks([5]), byRanks([9, 9]), byRanks([8, 8])];
  let s = playingState({ hands, landlord: 0, turn: 0, playsBySeat: [5, 0, 0] });
  let r = ddz.apply(s, 0, { type: 'play', cards: hands[0] });
  assert.equal(r.state.winnerCamp, 'landlord');
  assert.equal(r.state.multiplier.spring, true);
  assert.ok(r.events.some((e) => e.kind === 'spring' && !e.anti));
  // 反春:地主 playsBySeat=1,农民胜
  const hands2 = [byRanks([5, 6]), byRanks([9]), byRanks([8, 8])];
  let s2 = playingState({ hands: hands2, landlord: 0, turn: 1, playsBySeat: [1, 3, 2] });
  let r2 = ddz.apply(s2, 1, { type: 'play', cards: hands2[1] });
  assert.equal(r2.state.winnerCamp, 'farmers');
  assert.equal(r2.state.multiplier.spring, true);
  assert.ok(r2.events.some((e) => e.kind === 'spring' && e.anti));
});

test('view 三视角投影(隐藏信息回归红线)', () => {
  let s = fresh();
  // 叫分阶段:底牌全隐藏
  for (const seat of [0, 1, 2]) {
    const v = ddz.view(s, seat);
    assert.equal(v.bottom, null);
    assert.deepEqual(v.hand, s.hands[seat]);
    assert.equal(v.allHands, null);
    assert.deepEqual(v.counts, [17, 17, 17]);
    assert.equal(Object.prototype.hasOwnProperty.call(v, 'hands'), false); // 原始 hands 不入 view
    assert.equal(Object.prototype.hasOwnProperty.call(v, 'seed'), false);
  }
  // 观战:手牌不可见
  const vSpec = ddz.view(s, null);
  assert.equal(vSpec.hand, null);
  assert.equal(vSpec.bottom, null);
  assert.equal(vSpec.allHands, null);
  // 定地主后:底牌公开,他人手牌仍只有张数
  const r = ddz.apply(s, s.firstBidder, { type: 'bid', score: 3 });
  const v0 = ddz.view(r.state, (r.state.landlord + 1) % 3);
  assert.deepEqual(v0.bottom, r.state.bottom);
  assert.equal(v0.hand.length, 17);
  assert.equal(v0.counts[r.state.landlord], 20);
  // 终局:全亮
  const hands = [byRanks([5]), byRanks([9, 9]), byRanks([8, 8])];
  const endState = ddz.apply(playingState({ hands, landlord: 0 }), 0, { type: 'play', cards: hands[0] }).state;
  assert.ok(ddz.view(endState, null).allHands);
});

test('legalMoves:叫分档位过滤 / 跟牌可过', () => {
  let s = fresh();
  let r = ddz.apply(s, s.firstBidder, { type: 'bid', score: 2 });
  const nextSeat = r.state.turn;
  assert.deepEqual(ddz.legalMoves(ddz.view(r.state, nextSeat), nextSeat), { kind: 'bid', scores: [0, 3] });
  // playing:首家不能过
  const hands = [byRanks([14, 9]), byRanks([10, 5]), byRanks([13, 4])];
  const ps = playingState({ hands, landlord: 0 });
  assert.deepEqual(ddz.legalMoves(ddz.view(ps, 0), 0), { kind: 'play', canPass: false });
});
