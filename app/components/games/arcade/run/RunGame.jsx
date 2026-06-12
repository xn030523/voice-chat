'use client';

// 像素突击(壳:通用街机框架)
import ArcadeGameFrame from '../ArcadeGameFrame';
import { RunCore, VIEW_W, VIEW_H } from './RunCore';

export default function RunGame() {
  return (
    <ArcadeGameFrame
      title="🔫 像素突击"
      desc="横版突进!穿越敌阵,小心哨兵与炮台,干掉关底的装甲堡垒即可通关。站定按住上可朝天射击。"
      keys={[
        { tag: 'P1', text: 'AD 移动 · W 跳 · J / 空格 射击' },
        { tag: 'P2', color: 'green', text: '←→ 移动 · ↑ 跳 · 回车 / 0 射击' },
      ]}
      extraHelp="P 暂停 · 掉坑即损命,踩稳再跳!"
      trackId="run"
      width={VIEW_W}
      height={VIEW_H}
      makeCore={(canvas, players, onEvent) => new RunCore(canvas, { players, onEvent })}
    />
  );
}
