'use client';

// 坦克大作战 React 壳:选人数 → 对战(canvas+HUD)→ 结算
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Text } from '@mantine/core';
import { Play, RotateCcw, Pause } from 'lucide-react';
import { TankCore, FIELD } from './TankCore';
import { playScene, stopAll } from '@/lib/audio';

export default function TankGame({ onExit }) {
  const canvasRef = useRef(null);
  const coreRef = useRef(null);
  const [stage, setStage] = useState('menu'); // menu | playing | over
  const [players, setPlayers] = useState(1);
  const [hud, setHud] = useState({ level: 1, enemiesLeft: 20, lives: [3], score: 0 });
  const [result, setResult] = useState(null); // {win, score}
  const [paused, setPaused] = useState(false);

  const startGame = (n) => {
    setPlayers(n);
    setStage('playing');
    setResult(null);
    setPaused(false);
  };

  useEffect(() => {
    if (stage !== 'playing' || !canvasRef.current) return undefined;
    const core = new TankCore(canvasRef.current, {
      players,
      onEvent: (e) => {
        if (e.kind === 'hud') setHud((h) => ({ ...h, ...e }));
        else if (e.kind === 'level') {
          setHud((h) => ({ ...h, level: e.level }));
          playScene('tank', 'intro');
        } else if (e.kind === 'win' || e.kind === 'lose') {
          setResult({ win: e.kind === 'win', score: e.score });
          setStage('over');
          playScene('tank', e.kind === 'win' ? 'victory' : 'defeat');
        }
      },
    });
    coreRef.current = core;
    core.start();
    playScene('tank', 'intro');
    return () => {
      core.destroy();
      coreRef.current = null;
      stopAll();
    };
  }, [stage, players]);

  // P 键暂停
  useEffect(() => {
    if (stage !== 'playing') return undefined;
    const onKey = (e) => {
      if (e.key === 'p' || e.key === 'P') {
        setPaused((prev) => {
          coreRef.current?.setPaused(!prev);
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  if (stage === 'menu') {
    return (
      <div className="arcade-menu">
        <Text fw={800} size="xl">🛡 坦克大作战</Text>
        <Text size="sm" c="dimmed" ta="center">
          守住基地,消灭每关 20 辆敌军坦克!砖墙可破,钢墙吃三星才能打穿。
        </Text>
        <div className="arcade-keys">
          <div>
            <Badge variant="light">P1</Badge>
            <Text size="xs" c="dimmed">WASD 移动 · J / 空格 开火</Text>
          </div>
          <div>
            <Badge variant="light" color="green">P2</Badge>
            <Text size="xs" c="dimmed">方向键移动 · 回车 / 0 开火</Text>
          </div>
          <Text size="xs" c="dimmed">P 暂停 · 道具:★火力 ◈护盾 ✸清屏 ♥加命</Text>
        </div>
        <div className="arcade-menu-actions">
          <Button leftSection={<Play size={15} />} onClick={() => startGame(1)}>
            单人出击
          </Button>
          <Button color="green" leftSection={<Play size={15} />} onClick={() => startGame(2)}>
            双人同屏
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="arcade-stage">
      <div className="arcade-hud">
        <Badge variant="light">第 {hud.level} 关</Badge>
        <Badge variant="light" color="red">敌军 ×{hud.enemiesLeft}</Badge>
        {hud.lives.map((l, i) => (
          <Badge key={i} variant="light" color={i === 0 ? 'yellow' : 'green'}>
            P{i + 1} ♥{Math.max(0, l)}
          </Badge>
        ))}
        <Badge variant="light" color="gray">分数 {hud.score}</Badge>
        <Button
          size="compact-xs"
          variant="subtle"
          leftSection={<Pause size={12} />}
          onClick={() => {
            setPaused((prev) => {
              coreRef.current?.setPaused(!prev);
              return !prev;
            });
          }}
        >
          {paused ? '继续' : '暂停'}
        </Button>
      </div>
      <div className="arcade-canvas-wrap">
        <canvas ref={canvasRef} width={FIELD} height={FIELD} className="arcade-canvas" />
        {paused && stage === 'playing' && (
          <div className="arcade-overlay">
            <Text fw={800} size="lg">已暂停</Text>
            <Text size="xs" c="dimmed">按 P 继续</Text>
          </div>
        )}
        {stage === 'over' && result && (
          <div className="arcade-overlay">
            <Text fw={800} size="xl">{result.win ? '🎉 通关胜利!' : '💥 战败'}</Text>
            <Text size="sm" c="dimmed">总分 {result.score}</Text>
            <div className="arcade-menu-actions">
              <Button leftSection={<RotateCcw size={15} />} onClick={() => startGame(players)}>
                再来一局
              </Button>
              <Button variant="light" color="gray" onClick={() => setStage('menu')}>
                返回选单
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
