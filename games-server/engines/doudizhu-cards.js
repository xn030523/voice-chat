// 斗地主·牌与牌型解析器(纯函数同构,零依赖 —— 前端 UI 同样 import 本文件)
//
// 牌 id 0..53:id = (rank-3)*4 + suit(suit 0♦ 1♣ 2♥ 3♠);52=小王,53=大王
// rank 数值:3..10、11J、12Q、13K、14A、15(2)、16 小王、17 大王
// 链(顺子/连对/飞机)只允许 3..14(A 封顶),禁 2 与王

export const JOKER_SMALL = 52;
export const JOKER_BIG = 53;

export function rankOf(id) {
  if (id === JOKER_SMALL) return 16;
  if (id === JOKER_BIG) return 17;
  return 3 + Math.floor(id / 4);
}

export function suitOf(id) {
  return id >= 52 ? -1 : id % 4;
}

const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
export function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

export const SUIT_SYMBOLS = ['♦', '♣', '♥', '♠'];

export function fullDeck() {
  return Array.from({ length: 54 }, (_, i) => i);
}

/** 排序:大牌在前(大王→3),同 rank 按花色 */
export function sortDesc(ids) {
  return ids.slice().sort((a, b) => rankOf(b) - rankOf(a) || b - a);
}

function countByRank(ids) {
  const m = new Map();
  for (const id of ids) {
    const r = rankOf(id);
    m.set(r, (m.get(r) || 0) + 1);
  }
  return m;
}

/** 找出 counts 中所有 ≥need 张的连续 rank 链(长度 ≥minLen,rank ≤14),返回 [{start,len}] 全部候选 */
function chains(counts, need, minLen) {
  const ranks = [];
  for (let r = 3; r <= 14; r++) if ((counts.get(r) || 0) >= need) ranks.push(r);
  const out = [];
  let i = 0;
  while (i < ranks.length) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
    const runLen = j - i + 1;
    // 枚举该连续段内所有 (start, len) 组合
    for (let len = minLen; len <= runLen; len++) {
      for (let s = i; s + len - 1 <= j; s++) {
        out.push({ start: ranks[s], len });
      }
    }
    i = j + 1;
  }
  return out;
}

/**
 * classify(cards) → {type, len, key} | null
 * type ∈ single/pair/trio/trio1/trio2/straight/pairChain/plane/plane1/plane2/four2/four2pairs/bomb/rocket
 * key = 主牌比较值;len = 链长(顺子张数/连对对数/飞机组数)
 */
export function classify(cards) {
  const n = cards.length;
  if (!n) return null;
  if (new Set(cards).size !== n) return null; // 重复 id
  const counts = countByRank(cards);
  const ranks = [...counts.keys()];

  // 火箭
  if (n === 2 && counts.get(16) === 1 && counts.get(17) === 1) return { type: 'rocket', len: 1, key: 17 };
  // 单/对/三/炸
  if (n === 1) return { type: 'single', len: 1, key: rankOf(cards[0]) };
  if (ranks.length === 1) {
    const r = ranks[0];
    const c = counts.get(r);
    if (c === 2) return { type: 'pair', len: 1, key: r };
    if (c === 3) return { type: 'trio', len: 1, key: r };
    if (c === 4) return { type: 'bomb', len: 1, key: r };
  }
  // 三带一 / 三带二
  if (n === 4 && ranks.length === 2) {
    const trio = ranks.find((r) => counts.get(r) === 3);
    if (trio !== undefined) return { type: 'trio1', len: 1, key: trio };
  }
  if (n === 5 && ranks.length === 2) {
    const trio = ranks.find((r) => counts.get(r) === 3);
    const pair = ranks.find((r) => counts.get(r) === 2);
    if (trio !== undefined && pair !== undefined) return { type: 'trio2', len: 1, key: trio };
  }
  // 四带二(单)/ 四带二对
  if (n === 6) {
    const four = ranks.find((r) => counts.get(r) === 4);
    if (four !== undefined) {
      // 火箭不可作翅膀(双王不拆) —— 其余任意两单(可同点)
      if (counts.get(16) === 1 && counts.get(17) === 1) return null;
      return { type: 'four2', len: 1, key: four };
    }
  }
  if (n === 8) {
    const four = ranks.find((r) => counts.get(r) === 4);
    if (four !== undefined) {
      const rest = ranks.filter((r) => r !== four);
      if (rest.length === 2 && rest.every((r) => counts.get(r) === 2)) {
        return { type: 'four2pairs', len: 1, key: four };
      }
    }
  }
  // 顺子(全单且连续,≥5)
  if (n >= 5 && ranks.length === n && Math.max(...ranks) <= 14) {
    const sorted = ranks.slice().sort((a, b) => a - b);
    if (sorted[sorted.length - 1] - sorted[0] === n - 1) {
      return { type: 'straight', len: n, key: sorted[sorted.length - 1] };
    }
  }
  // 连对(全对且连续,≥3 对)
  if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 && Math.max(...ranks) <= 14) {
    if (ranks.every((r) => counts.get(r) === 2)) {
      const sorted = ranks.slice().sort((a, b) => a - b);
      if (sorted[sorted.length - 1] - sorted[0] === ranks.length - 1) {
        return { type: 'pairChain', len: ranks.length, key: sorted[sorted.length - 1] };
      }
    }
  }
  // 飞机(k≥2 连续三条):纯飞机 / 带 k 单 / 带 k 对
  // 枚举所有三条链候选,核验剩牌恰为 k 单(任意牌,含同点)或 k 对;偏好更长的链
  const trioChains = chains(counts, 3, 2).sort((a, b) => b.len - a.len || b.start - a.start);
  for (const { start, len } of trioChains) {
    const used = new Map();
    for (let r = start; r < start + len; r++) used.set(r, 3);
    const restCount = n - len * 3;
    if (restCount === 0) {
      // 纯飞机:必须恰好用尽(无散牌)
      if (ranks.every((r) => (used.get(r) || 0) === counts.get(r))) {
        return { type: 'plane', len, key: start + len - 1 };
      }
      continue;
    }
    if (restCount === len) {
      // 带 k 单:剩余张数恰为 k(火箭不可拆作翅膀)
      const leftover = [];
      let ok = true;
      for (const r of ranks) {
        const extra = counts.get(r) - (used.get(r) || 0);
        if (extra < 0) {
          ok = false;
          break;
        }
        for (let i = 0; i < extra; i++) leftover.push(r);
      }
      if (!ok) continue;
      if (leftover.filter((r) => r >= 16).length === 2) continue; // 双王不拆
      return { type: 'plane1', len, key: start + len - 1 };
    }
    if (restCount === len * 2) {
      // 带 k 对:剩余恰为 k 个对子
      let pairs = 0;
      let ok = true;
      for (const r of ranks) {
        const extra = counts.get(r) - (used.get(r) || 0);
        if (extra === 0) continue;
        if (extra === 2) pairs++;
        else if (extra === 4) pairs += 2; // 四张拆两对,常见规则允许
        else {
          ok = false;
          break;
        }
      }
      if (ok && pairs === len) return { type: 'plane2', len, key: start + len - 1 };
    }
  }
  return null;
}

/** a 能否压过 b(b 为当前桌面牌型;a、b 均为 classify 结果) */
export function canBeat(a, b) {
  if (!a) return false;
  if (!b) return true; // 自由出牌
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb' && b.type !== 'bomb') return true;
  if (a.type === 'bomb' && b.type === 'bomb') return a.key > b.key;
  if (b.type === 'bomb') return false;
  return a.type === b.type && a.len === b.len && a.key > b.key;
}

/** 牌面文案(事件/出牌区展示用):如「三带一」「顺子×6」 */
export function typeLabel(parsed) {
  if (!parsed) return '';
  const names = {
    single: '单张',
    pair: '对子',
    trio: '三张',
    trio1: '三带一',
    trio2: '三带二',
    straight: '顺子',
    pairChain: '连对',
    plane: '飞机',
    plane1: '飞机带单',
    plane2: '飞机带对',
    four2: '四带二',
    four2pairs: '四带两对',
    bomb: '炸弹',
    rocket: '王炸',
  };
  return names[parsed.type] || parsed.type;
}
