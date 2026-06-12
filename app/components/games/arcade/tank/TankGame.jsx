'use client';

// 坦克大作战(壳:通用街机框架)
import ArcadeGameFrame from '../ArcadeGameFrame';
import { TankCore, FIELD } from './TankCore';

export default function TankGame() {
  return (
    <ArcadeGameFrame
      title="🛡 坦克大作战"
      desc="守住基地,消灭每关 20 辆敌军坦克!砖墙可破,钢墙吃三星才能打穿。"
      keys={[
        { tag: 'P1', text: 'WASD 移动 · J / 空格 开火' },
        { tag: 'P2', color: 'green', text: '方向键移动 · 回车 / 0 开火' },
      ]}
      extraHelp="P 暂停 · 道具:★火力 ◈护盾 ✸清屏 ♥加命"
      trackId="tank"
      width={FIELD}
      height={FIELD}
      makeCore={(canvas, players, onEvent) => new TankCore(canvas, { players, onEvent })}
    />
  );
}
