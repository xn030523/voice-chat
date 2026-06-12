'use client';

// 街机游戏通用框架:选单(单人/双人+按键说明)→ 对战(canvas+HUD+暂停)→ 结算
// 三态生命周期与 BGM 场景切换统一在此,新游戏只需提供 Core 类与元数据。
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Text } from '@mantine/core';
import { Play, RotateCcw, Pause } from 'lucide-react';
import { playScene, stopAll } from '@/lib/audio';

/**
 * @param {{
 *  title:string, desc:string, keys:Array<{tag:string,color?:string,text:string}>, extraHelp?:string,
 *  trackId:string, width:number, height:number,
 *  makeCore:(canvas, players, onEvent)=>{start():void,destroy():void,setPaused(p):void},
 *  hudOrder?:string[],
 * }} props
 */
export default function ArcadeGameFrame({ title, desc, keys, extraHelp, trackId, width, height, makeCore }) {
  const canvasRef = useRef(null);
  const coreRef = useRef(null);
  const [stage, setStage] = useState('menu'); // menu | playing | over
  const [players, setPlayers] = useState(1);
  const [hud, setHud] = useState({});
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);

  const startGame = (n) => {
    setPlayers(n);
    setStage('playing');
    setResult(null);
    setPaused(false);
    setHud({});
  };

  useEffect(() => {
    if (stage !== 'playing' || !canvasRef.current) return undefined;
    const core = makeCore(canvasRef.current, players, (e) => {
      if (e.kind === 'hud') setHud((h) => ({ ...h, ...e }));
      else if (e.kind === 'level') {
        setHud((h) => ({ ...h, level: e.level }));
        playScene(trackId, 'intro');
      } else if (e.kind === 'win' || e.kind === 'lose') {
        setResult({ win: e.kind === 'win', score: e.score, detail: e.detail });
        setStage('over');
        playScene(trackId, e.kind === 'win' ? 'victory' : 'defeat');
      }
    });
    coreRef.current = core;
    core.start();
    playScene(trackId, 'intro');
    return () => {
      core.destroy();
      coreRef.current = null;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, players]);

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
        <Text fw={800} size="xl">{title}</Text>
        <Text size="sm" c="dimmed" ta="center" maw={420}>
          {desc}
        </Text>
        <div className="arcade-keys">
          {keys.map((k) => (
            <div key={k.tag}>
              <Badge variant="light" color={k.color || 'indigo'}>{k.tag}</Badge>
              <Text size="xs" c="dimmed">{k.text}</Text>
            </div>
          ))}
          {extraHelp && <Text size="xs" c="dimmed">{extraHelp}</Text>}
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
        {hud.level !== undefined && <Badge variant="light">第 {hud.level} 关</Badge>}
        {hud.enemiesLeft !== undefined && <Badge variant="light" color="red">敌方 ×{hud.enemiesLeft}</Badge>}
        {(hud.lives || []).map((l, i) => (
          <Badge key={i} variant="light" color={i === 0 ? 'yellow' : 'green'}>
            P{i + 1} ♥{Math.max(0, l)}
          </Badge>
        ))}
        {hud.timer !== undefined && <Badge variant="light" color="orange">⏱ {hud.timer}</Badge>}
        {hud.score !== undefined && <Badge variant="light" color="gray">分数 {hud.score}</Badge>}
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
        <canvas ref={canvasRef} width={width} height={height} className="arcade-canvas" style={{ aspectRatio: `${width} / ${height}` }} />
        {paused && stage === 'playing' && (
          <div className="arcade-overlay">
            <Text fw={800} size="lg">已暂停</Text>
            <Text size="xs" c="dimmed">按 P 继续</Text>
          </div>
        )}
        {stage === 'over' && result && (
          <div className="arcade-overlay">
            <Text fw={800} size="xl">{result.win ? '🎉 胜利!' : '💥 失败'}</Text>
            {result.detail && <Text size="sm" c="dimmed">{result.detail}</Text>}
            {result.score !== undefined && <Text size="sm" c="dimmed">总分 {result.score}</Text>}
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
