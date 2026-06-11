import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, canBeat, rankOf, sortDesc } from './doudizhu-cards.js';

/** 按 rank 列表造牌(自动分配花色;16=小王 17=大王) */
function byRanks(ranks) {
  const used = new Map();
  return ranks.map((r) => {
    if (r === 16) return 52;
    if (r === 17) return 53;
    const i = used.get(r) || 0;
    used.set(r, i + 1);
    if (i > 3) throw new Error(`rank ${r} 超过 4 张`);
    return (r - 3) * 4 + i;
  });
}

const C = (ranks) => classify(byRanks(ranks));

test('基础牌型:单/对/三/三带一/三带二/炸弹/火箭', () => {
  assert.deepEqual(C([7]), { type: 'single', len: 1, key: 7 });
  assert.deepEqual(C([15]), { type: 'single', len: 1, key: 15 }); // 单 2
  assert.deepEqual(C([9, 9]), { type: 'pair', len: 1, key: 9 });
  assert.deepEqual(C([12, 12, 12]), { type: 'trio', len: 1, key: 12 });
  assert.deepEqual(C([12, 12, 12, 3]), { type: 'trio1', len: 1, key: 12 });
  assert.deepEqual(C([12, 12, 12, 8, 8]), { type: 'trio2', len: 1, key: 12 });
  assert.deepEqual(C([5, 5, 5, 5]), { type: 'bomb', len: 1, key: 5 });
  assert.deepEqual(C([16, 17]), { type: 'rocket', len: 1, key: 17 });
});

test('非法组合返回 null', () => {
  assert.equal(C([3, 4]), null); // 杂二张
  assert.equal(C([3, 3, 4]), null); // 两带一
  assert.equal(C([12, 12, 12, 8, 9]), null); // 三带俩散
  assert.equal(C([16, 16]) ?? null, null); // 不存在两张小王(byRanks 会给 52,52?)—— 见下
  assert.equal(classify([52, 52]), null); // 重复 id
  assert.equal(classify([]), null);
});

test('顺子:≥5 连续、A 封顶、禁 2 与王', () => {
  assert.deepEqual(C([3, 4, 5, 6, 7]), { type: 'straight', len: 5, key: 7 });
  assert.deepEqual(C([10, 11, 12, 13, 14]), { type: 'straight', len: 5, key: 14 }); // 10JQKA
  assert.equal(C([3, 4, 5, 6]), null); // 4 张不够
  assert.equal(C([11, 12, 13, 14, 15]), null); // 带 2 非法
  assert.equal(C([3, 4, 5, 6, 8]), null); // 断档
  assert.deepEqual(C([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), { type: 'straight', len: 12, key: 14 }); // 龙
});

test('连对:≥3 对连续、禁 2', () => {
  assert.deepEqual(C([3, 3, 4, 4, 5, 5]), { type: 'pairChain', len: 3, key: 5 });
  assert.deepEqual(C([12, 12, 13, 13, 14, 14]), { type: 'pairChain', len: 3, key: 14 });
  assert.equal(C([3, 3, 4, 4]), null); // 两对不够
  assert.equal(C([14, 14, 15, 15, 3, 3]), null); // 2 不入链
  assert.equal(C([3, 3, 4, 4, 6, 6]), null); // 断档
});

test('飞机:纯飞机 / 带单 / 带对 / 经典歧义', () => {
  assert.deepEqual(C([3, 3, 3, 4, 4, 4]), { type: 'plane', len: 2, key: 4 });
  // 带单:33344455 → 333444 + 5,5(同点两单允许)
  assert.deepEqual(C([3, 3, 3, 4, 4, 4, 5, 5]), { type: 'plane1', len: 2, key: 4 });
  // 带对:3334445566 → 333444 + 55+66
  assert.deepEqual(C([3, 3, 3, 4, 4, 4, 5, 5, 6, 6]), { type: 'plane2', len: 2, key: 4 });
  // 经典歧义:333444555666 → 取最长纯飞机 len4(而非 len3 带 666 拆单)
  assert.deepEqual(C([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]), { type: 'plane', len: 4, key: 6 });
  // 33344455566:11 张,任何解释都不成立
  assert.equal(C([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6]), null);
  // 444555 + 3 + 7 → 带单
  assert.deepEqual(C([4, 4, 4, 5, 5, 5, 3, 7]), { type: 'plane1', len: 2, key: 5 });
  // 双王不可拆作翅膀:333444 + 小王大王
  assert.equal(C([3, 3, 3, 4, 4, 4, 16, 17]), null);
  // 2 不入飞机链:222AAA 不是飞机(2 与 A 不连续且 2 禁链)
  assert.equal(C([15, 15, 15, 14, 14, 14]) ?? null, null);
  // 飞机链 KKKAAA 合法(A 封顶)
  assert.deepEqual(C([13, 13, 13, 14, 14, 14]), { type: 'plane', len: 2, key: 14 });
});

test('四带二 / 四带两对 / 双王不拆', () => {
  assert.deepEqual(C([9, 9, 9, 9, 3, 4]), { type: 'four2', len: 1, key: 9 });
  assert.deepEqual(C([9, 9, 9, 9, 3, 3]), { type: 'four2', len: 1, key: 9 }); // 两单同点也算两单
  assert.deepEqual(C([9, 9, 9, 9, 3, 3, 5, 5]), { type: 'four2pairs', len: 1, key: 9 });
  assert.equal(C([9, 9, 9, 9, 16, 17]), null); // 火箭不可作翅膀
  assert.equal(C([9, 9, 9, 9, 3, 3, 5, 6]), null); // 一对一散非法
});

test('canBeat 压制矩阵', () => {
  const s7 = C([7]);
  const s9 = C([9]);
  const p8 = C([8, 8]);
  const bomb5 = C([5, 5, 5, 5]);
  const bombK = C([13, 13, 13, 13]);
  const rocket = C([16, 17]);
  const st37 = C([3, 4, 5, 6, 7]);
  const st48 = C([4, 5, 6, 7, 8]);
  const st39 = C([3, 4, 5, 6, 7, 8, 9]);

  assert.ok(canBeat(s9, s7)); // 同型比大小
  assert.ok(!canBeat(s7, s9));
  assert.ok(!canBeat(p8, s7)); // 异型不可压
  assert.ok(canBeat(st48, st37)); // 同长顺子比大小
  assert.ok(!canBeat(st39, st37)); // 不同长度不可压
  assert.ok(canBeat(bomb5, st39)); // 炸弹压一切非炸
  assert.ok(canBeat(bombK, bomb5)); // 炸弹比大小
  assert.ok(!canBeat(bomb5, bombK));
  assert.ok(canBeat(rocket, bombK)); // 火箭压炸弹
  assert.ok(!canBeat(bombK, rocket));
  assert.ok(canBeat(s7, null)); // 自由出牌
  assert.ok(!canBeat(null, s7)); // 非法牌不可出
});

test('单 2 与王的大小:大王>小王>2>A', () => {
  assert.ok(canBeat(C([16]), C([15])));
  assert.ok(canBeat(C([17]), C([16])));
  assert.ok(canBeat(C([15]), C([14])));
  assert.ok(!canBeat(C([14]), C([15])));
});

test('sortDesc:大王→3', () => {
  const hand = byRanks([3, 17, 9, 16, 14]);
  const sorted = sortDesc(hand).map(rankOf);
  assert.deepEqual(sorted, [17, 16, 14, 9, 3]);
});
