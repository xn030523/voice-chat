'use client';

// 街机厅注册表 + 容器壳(本机游戏:单人/同屏双人,不经游戏服务端,语音照常)
import { Button, Text } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import TankGame from './tank/TankGame';

export const ARCADE_GAMES = [
  {
    id: 'tank',
    name: '坦克大作战',
    icon: '坦',
    desc: '守基地·灭敌军',
    players: '1-2 人同屏',
    component: TankGame,
  },
  // 后续上架:雪球兄弟 → 像素突击(横版射击)→ 功夫龟对决
];

export default function ArcadeShell({ gameId, onExit }) {
  const game = ARCADE_GAMES.find((g) => g.id === gameId);
  if (!game) return null;
  const GameComp = game.component;
  return (
    <div className="games-body arcade-shell">
      <div className="games-head">
        <div className="games-head-title">
          <Text fw={700} size="sm">🕹 {game.name}</Text>
          <Text size="xs" c="dimmed">本机街机 · 语音不中断</Text>
        </div>
        <div className="games-head-actions">
          <Button size="xs" variant="subtle" color="gray" leftSection={<ArrowLeft size={13} />} onClick={onExit}>
            返回大厅
          </Button>
        </div>
      </div>
      <GameComp onExit={onExit} />
    </div>
  );
}
