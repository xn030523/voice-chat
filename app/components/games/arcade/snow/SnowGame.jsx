'use client';

// 雪球兄弟(壳:通用街机框架)
import ArcadeGameFrame from '../ArcadeGameFrame';
import { SnowCore, FIELD_W, FIELD_H } from './SnowCore';

export default function SnowGame() {
  return (
    <ArcadeGameFrame
      title="❄ 雪球兄弟"
      desc="扔雪球把毛怪冻成大雪球,再推出去弹墙碾压全场!每关清光怪物过关,共 3 关。"
      keys={[
        { tag: 'P1', text: 'AD 移动 · W 跳 · S+W 下跳 · J / 空格 扔雪球' },
        { tag: 'P2', color: 'green', text: '←→ 移动 · ↑ 跳 · ↓+↑ 下跳 · 回车 / 0 扔雪球' },
      ]}
      extraHelp="P 暂停 · 碰到雪球态的怪 = 推出去!"
      trackId="snow"
      width={FIELD_W}
      height={FIELD_H}
      makeCore={(canvas, players, onEvent) => new SnowCore(canvas, { players, onEvent })}
    />
  );
}
