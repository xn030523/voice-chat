// 可种子化 RNG(mulberry32),种子来自 crypto——服务端注入引擎,保证发牌/洗子公正且可测
import { randomBytes } from 'node:crypto';

export function makeRng(seed) {
  let a = seed >>> 0;
  if (!a) a = randomBytes(4).readUInt32LE(0) || 0x9e3779b9;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoSeed() {
  return randomBytes(4).readUInt32LE(0);
}

// Fisher–Yates,原地洗牌并返回数组
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
