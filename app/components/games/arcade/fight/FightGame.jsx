'use client';

// 功夫龟对决(壳:通用街机框架)
import ArcadeGameFrame from '../ArcadeGameFrame';
import { FightCore, VIEW_W, VIEW_H } from './FightCore';

export default function FightGame() {
  return (
    <ArcadeGameFrame
      title="🐢 功夫龟对决"
      desc="月下道场 1v1!拳快脚重,按住后退方向自动格挡(伤害大减)。KO 对手或 90 秒内血量领先者胜。单人模式挑战 AI 龟。"
      keys={[
        { tag: 'P1', text: 'AD 移动 · W 跳 · J 拳 · K 脚' },
        { tag: 'P2', color: 'green', text: '←→ 移动 · ↑ 跳 · 回车 拳 · 0 脚' },
      ]}
      extraHelp="P 暂停 · 格挡只受 20% 伤害"
      trackId="fight"
      width={VIEW_W}
      height={VIEW_H}
      makeCore={(canvas, players, onEvent) => new FightCore(canvas, { players, onEvent })}
    />
  );
}
