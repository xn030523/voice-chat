'use client';

// 精灵图加载器:预加载 PNG,按 key 缓存,渲染时同步取用(未就绪则游戏用兜底绘制)。
// 全部素材为 Kenney CC0(见 public/sprites/CREDITS.md)。

const cache = new Map(); // key -> HTMLImageElement(loaded)
const loading = new Map(); // key -> Promise

function load1(key, url) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (loading.has(key)) return loading.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(key, img);
      resolve(img);
    };
    img.onerror = () => resolve(null); // 加载失败 → 游戏走兜底绘制
    img.src = url;
  });
  loading.set(key, p);
  return p;
}

/**
 * 预加载一组精灵。
 * @param {Record<string,string>} map  key -> url
 * @returns {Promise<void>}
 */
export function preload(map) {
  return Promise.all(Object.entries(map).map(([k, u]) => load1(k, u))).then(() => {});
}

/** 同步取已加载精灵(未就绪返回 null) */
export function sprite(key) {
  return cache.get(key) || null;
}

export function spritesReady(keys) {
  return keys.every((k) => cache.has(k));
}
