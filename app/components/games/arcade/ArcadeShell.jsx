'use client';

// 街机厅注册表 + 容器壳(本机游戏:单人/同屏双人,不经游戏服务端,语音照常)
import { Button, Text } from '@mantine/core';
import { ArrowLeft } from 'lucide-react';
import TankGame from './tank/TankGame';
import SnowGame from './snow/SnowGame';
import RunGame from './run/RunGame';
import FightGame from './fight/FightGame';

export const ARCADE_GAMES = [
  {
    id: 'tank',
    name: '坦克大作战',
    icon: '坦',
    desc: '守基地·灭敌军',
    players: '1-2 人同屏',
    component: TankGame,
  },
  {
    id: 'snow',
    name: '雪球兄弟',
    icon: '雪',
    desc: '冻怪·推雪球',
    players: '1-2 人同屏',
    component: SnowGame,
  },
  {
    id: 'run',
    name: '像素突击',
    icon: '突',
    desc: '横版闯关·轰堡垒',
    players: '1-2 人同屏',
    component: RunGame,
  },
  {
    id: 'fight',
    name: '功夫龟对决',
    icon: '龟',
    desc: '1v1 格斗·KO 制',
    players: '1-2 人对打',
    component: FightGame,
  },
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
