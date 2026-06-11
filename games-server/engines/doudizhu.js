// 斗地主(3 人):叫分制(1-3 分,3 分立即定地主),全不叫重新发牌;
// 地主得 3 张底牌(公开);先出完者阵营胜;炸弹/王炸翻倍,春天/反春 ×2(仅展示)。
// 隐藏信息:他人手牌只暴露张数;观战全隐藏;终局亮全部手牌。
// 纯函数同构:重发牌用 state.seed 内联 PRNG(引擎零外部依赖)。
import { classify, canBeat, sortDesc, fullDeck, typeLabel, rankLabel, rankOf } from './doudizhu-cards.js';

export const meta = {
  id: 'doudizhu',
  name: '斗地主',
  minSeats: 3,
  maxSeats: 3,
  defaultOpts: {},
};

function prng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deal(rng) {
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    hands: [sortDesc(deck.slice(0, 17)), sortDesc(deck.slice(17, 34)), sortDesc(deck.slice(34, 51))],
    bottom: deck.slice(51),
  };
}

export function init(seatCount, opts, rng) {
  const seed = Math.floor(rng() * 2 ** 31);
  const { hands, bottom } = deal(rng);
  const firstBidder = Math.floor(rng() * 3);
  return {
    phase: 'bidding', // bidding | playing | ended
    hands,
    bottom,
    bidding: { highest: null, acted: 0 },
    landlord: null,
    firstBidder,
    turn: firstBidder,
    lastPlay: null, // {seat, cards, parsed, label}
    passCount: 0,
    multiplier: { base: 1, bombs: 0, spring: false },
    playsBySeat: [0, 0, 0],
    winnerSeat: null,
    winnerCamp: null, // 'landlord' | 'farmers'
    seed,
    redeals: 0,
  };
}

export function displayMultiplier(state) {
  return state.multiplier.base * 2 ** state.multiplier.bombs * (state.multiplier.spring ? 2 : 1);
}

function finalizeLandlord(state, events) {
  const seat = state.bidding.highest.seat;
  state.landlord = seat;
  state.multiplier.base = state.bidding.highest.score;
  state.hands = state.hands.map((h, i) => (i === seat ? sortDesc(h.concat(state.bottom)) : h));
  state.phase = 'playing';
  state.turn = seat;
  events.push({ kind: 'landlord', seat, score: state.bidding.highest.score });
}

function applyBid(state, seat, score) {
  if (typeof score !== 'number' || score < 0 || score > 3) return { error: '叫分只能是 0-3 分' };
  const cur = state.bidding.highest?.score || 0;
  if (score > 0 && score <= cur) return { error: `必须叫高于 ${cur} 分或不叫` };

  const next = {
    ...state,
    bidding: { highest: state.bidding.highest, acted: state.bidding.acted + 1 },
    multiplier: { ...state.multiplier },
    hands: state.hands,
  };
  const events = [{ kind: 'bid', seat, score }];

  if (score === 3) {
    next.bidding = { highest: { seat, score }, acted: next.bidding.acted };
    finalizeLandlord(next, events);
    return { state: next, events };
  }
  if (score > 0) next.bidding = { ...next.bidding, highest: { seat, score } };

  if (next.bidding.acted >= 3) {
    if (next.bidding.highest) {
      finalizeLandlord(next, events);
    } else {
      // 全不叫 → 重新发牌(seed 派生内联 PRNG,保持纯函数);首叫人轮转
      const rng = prng((next.seed ^ (next.redeals + 1) * 0x9e3779b9) >>> 0);
      const fresh = init(3, {}, rng);
      const firstBidder = (state.firstBidder + 1) % 3;
      events.push({ kind: 'redeal' });
      return {
        state: {
          ...fresh,
          seed: next.seed,
          redeals: next.redeals + 1,
          firstBidder,
          turn: firstBidder,
        },
        events,
      };
    }
  } else {
    next.turn = (seat + 1) % 3;
  }
  return { state: next, events };
}

function applyPlay(state, seat, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return { error: '请选择要出的牌' };
  const hand = state.hands[seat];
  const handSet = new Set(hand);
  if (new Set(cards).size !== cards.length || !cards.every((c) => handSet.has(c))) {
    return { error: '出的牌不在你手中' };
  }
  const parsed = classify(cards);
  if (!parsed) return { error: '不符合牌型' };
  if (state.lastPlay && !canBeat(parsed, state.lastPlay.parsed)) return { error: '管不上' };

  const remove = new Set(cards);
  const newHand = hand.filter((c) => !remove.has(c));
  const events = [
    {
      kind: 'play',
      seat,
      cards: sortDesc(cards),
      label: typeLabel(parsed),
      top: rankLabel(parsed.key),
    },
  ];
  const next = {
    ...state,
    hands: state.hands.map((h, i) => (i === seat ? newHand : h)),
    lastPlay: { seat, cards: sortDesc(cards), parsed, label: typeLabel(parsed) },
    passCount: 0,
    turn: (seat + 1) % 3,
    playsBySeat: state.playsBySeat.map((n, i) => (i === seat ? n + 1 : n)),
    multiplier: { ...state.multiplier },
  };
  if (parsed.type === 'bomb' || parsed.type === 'rocket') {
    next.multiplier.bombs += 1;
    events.push({ kind: 'bomb', seat });
  }

  if (newHand.length === 0) {
    next.phase = 'ended';
    next.winnerSeat = seat;
    next.winnerCamp = seat === state.landlord ? 'landlord' : 'farmers';
    next.turn = null;
    // 春天:地主胜且两农民一手未出;反春:农民胜且地主只出过一手(首手)
    if (next.winnerCamp === 'landlord') {
      const farmerPlays = next.playsBySeat.reduce((s, n, i) => (i === state.landlord ? s : s + n), 0);
      if (farmerPlays === 0) {
        next.multiplier.spring = true;
        events.push({ kind: 'spring' });
      }
    } else if (next.playsBySeat[state.landlord] === 1) {
      next.multiplier.spring = true;
      events.push({ kind: 'spring', anti: true });
    }
    events.push({ kind: 'end', winnerSeat: seat, camp: next.winnerCamp });
  }
  return { state: next, events };
}

function applyPass(state, seat) {
  if (!state.lastPlay) return { error: '首家不能不出' };
  if (state.lastPlay.seat === seat) return { error: '你是当前最大,必须出牌' };
  const next = { ...state, passCount: state.passCount + 1, turn: (seat + 1) % 3 };
  const events = [{ kind: 'pass', seat }];
  if (next.passCount >= 2) {
    next.lastPlay = null; // 两家不要 → 原出牌者重新自由出
    next.passCount = 0;
  }
  return { state: next, events };
}

export function apply(state, seat, move) {
  if (state.phase === 'ended') return { error: '对局已结束' };
  if (seat !== state.turn) return { error: '还没轮到你' };
  if (!move || typeof move.type !== 'string') return { error: '无效操作' };

  if (state.phase === 'bidding') {
    if (move.type !== 'bid') return { error: '叫分阶段请先叫分' };
    return applyBid(state, seat, move.score);
  }
  if (move.type === 'play') return applyPlay(state, seat, move.cards);
  if (move.type === 'pass') return applyPass(state, seat);
  return { error: '无效操作' };
}

/** 分座位投影:他人手牌只给张数;底牌定地主前隐藏;观战(null)全隐藏;终局全亮 */
export function view(state, seat) {
  const ended = state.phase === 'ended';
  return {
    phase: state.phase,
    turn: state.turn,
    landlord: state.landlord,
    firstBidder: state.firstBidder,
    bidding: { highest: state.bidding.highest, acted: state.bidding.acted },
    bottom: state.landlord !== null || ended ? state.bottom : null,
    bottomCount: 3,
    lastPlay: state.lastPlay
      ? { seat: state.lastPlay.seat, cards: state.lastPlay.cards, label: state.lastPlay.label, parsed: state.lastPlay.parsed }
      : null,
    passCount: state.passCount,
    multiplier: state.multiplier,
    displayMultiplier: displayMultiplier(state),
    playsBySeat: state.playsBySeat,
    counts: state.hands.map((h) => h.length),
    hand: seat !== null ? state.hands[seat] : null,
    allHands: ended ? state.hands : null,
    winnerSeat: state.winnerSeat,
    winnerCamp: state.winnerCamp,
    redeals: state.redeals,
  };
}

export function status(state) {
  if (state.phase === 'ended') {
    const campText = state.winnerCamp === 'landlord' ? '地主' : '农民';
    return {
      phase: 'ended',
      turn: null,
      winner: state.winnerSeat,
      detail: `${campText}阵营获胜 · 倍数 ×${displayMultiplier(state)}`,
    };
  }
  return { phase: state.phase, turn: state.turn, winner: null };
}

/** UI 辅助:当前 seat 可执行的操作骨架(详细牌力判断由 UI 用 classify/canBeat 自查) */
export function legalMoves(viewState, seat) {
  if (seat === null || viewState.turn !== seat) return null;
  if (viewState.phase === 'bidding') {
    const cur = viewState.bidding.highest?.score || 0;
    return { kind: 'bid', scores: [0, 1, 2, 3].filter((s) => s === 0 || s > cur) };
  }
  if (viewState.phase === 'playing') {
    return { kind: 'play', canPass: !!viewState.lastPlay && viewState.lastPlay.seat !== seat };
  }
  return null;
}
