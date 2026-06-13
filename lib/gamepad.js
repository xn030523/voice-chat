'use client';

// 手柄支持(Gamepad API)—— 统一轮询,非侵入注入到各街机 Core 的按键集合。
// 设计:只删除"自己上一帧注入的键",绝不动键盘按下的键 → 键盘/手柄可共存互不干扰。
// 手柄 0 → P1,手柄 1 → P2(与同屏双人一致)。
//
// 用法(在 Core.update 顶部):
//   pollGamepads(this.keys, this._gpInjected ??= [new Set(), new Set()], MAPS);
// MAPS = [{up,down,left,right,a,b,start,select}, ...]  值为该游戏实际用的按键字符串

const AXIS_THRESH = 0.5;

// 标准手柄按钮编号(W3C Standard Gamepad)
const BTN = { A: 0, B: 1, X: 2, Y: 3, L: 4, R: 5, START: 9, SELECT: 8, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export function gamepadConnected() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
  const pads = navigator.getGamepads();
  for (const p of pads) if (p) return true;
  return false;
}

/**
 * @param {Set<string>} keys      Core 的按键集合(会被增删)
 * @param {Set<string>[]} injected 每个玩家上一帧注入的键(Core 持有,传入复用)
 * @param {Array} maps            每玩家映射:{up,down,left,right,a,b,start,select} → 键字符串
 */
export function pollGamepads(keys, injected, maps) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    const prev = injected[i] || (injected[i] = new Set());
    const gp = pads[i];
    const desired = new Set();
    if (gp && map) {
      const b = gp.buttons || [];
      const ax = gp.axes || [];
      const on = (n) => b[n] && b[n].pressed;
      const want = (cond, key) => {
        if (key && cond) desired.add(key);
      };
      want(on(BTN.UP) || ax[1] < -AXIS_THRESH, map.up);
      want(on(BTN.DOWN) || ax[1] > AXIS_THRESH, map.down);
      want(on(BTN.LEFT) || ax[0] < -AXIS_THRESH, map.left);
      want(on(BTN.RIGHT) || ax[0] > AXIS_THRESH, map.right);
      want(on(BTN.A) || on(BTN.X), map.a); // 主键(开火/拳/跳)
      want(on(BTN.B) || on(BTN.Y), map.b); // 副键(脚/特殊)
      want(on(BTN.START), map.start);
      want(on(BTN.SELECT), map.select);
    }
    // 增:本帧想要的;删:仅删上一帧由本玩家注入、本帧不再想要的(不碰键盘键)
    for (const k of desired) keys.add(k);
    for (const k of prev) if (!desired.has(k)) keys.delete(k);
    injected[i] = desired;
  }
}
