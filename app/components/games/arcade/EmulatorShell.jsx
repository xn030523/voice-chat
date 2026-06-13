'use client';

// 经典模拟器容器:把 EmulatorJS 播放页嵌入独立 iframe。
// iframe 完全隔离 —— 键盘/音频/WASM 都在 iframe 内,绝不影响语音房与其他游戏。
// 游戏自带原版画面与音乐,因此本容器不启动项目 BGM。
import { useMemo } from 'react';
import { Button, Text } from '@mantine/core';
import { ArrowLeft, Maximize2 } from 'lucide-react';

export default function EmulatorShell({ game, onExit }) {
  const src = useMemo(() => {
    const p = new URLSearchParams({
      core: game.core,
      rom: `/roms/${game.file}`,
      name: game.name,
    });
    if (game.bios) p.set('bios', `/roms/${game.bios}`);
    return `/emulator/index.html?${p.toString()}`;
  }, [game]);

  return (
    <div className="games-body arcade-shell">
      <div className="games-head">
        <div className="games-head-title">
          <Text fw={700} size="sm">🎮 {game.name}</Text>
          <Text size="xs" c="dimmed">真机模拟 · 原版音画 · 语音不中断</Text>
        </div>
        <div className="games-head-actions">
          <Button
            size="xs"
            variant="subtle"
            leftSection={<Maximize2 size={13} />}
            onClick={() => window.open(src, '_blank', 'noopener')}
          >
            新窗口全屏
          </Button>
          <Button size="xs" variant="subtle" color="gray" leftSection={<ArrowLeft size={13} />} onClick={onExit}>
            返回大厅
          </Button>
        </div>
      </div>
      <div className="emu-wrap">
        <iframe
          key={game.id}
          className="emu-frame"
          src={src}
          title={game.name}
          allow="autoplay; gamepad; fullscreen"
        />
      </div>
      <div className="emu-hint">
        <Text size="xs" c="dimmed">
          方向键移动 · X/Z = A/B · Enter 开始 · Shift 选择 · 可在模拟器设置里改键或接手柄
        </Text>
      </div>
    </div>
  );
}
