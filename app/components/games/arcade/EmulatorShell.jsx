'use client';

// 经典模拟器容器:把 EmulatorJS 播放页嵌入独立 iframe。
// iframe 完全隔离 —— 键盘/音频/WASM 都在 iframe 内,绝不影响语音房与其他游戏。
// 游戏自带原版画面与音乐,因此本容器不启动项目 BGM。
import { useEffect, useMemo, useState } from 'react';
import { Button, Code, Text } from '@mantine/core';
import { ArrowLeft, Maximize2, PackageOpen } from 'lucide-react';

export default function EmulatorShell({ game, onExit }) {
  const [status, setStatus] = useState(game.pick ? 'ready' : 'checking'); // checking | ready | missing
  const romUrl = `/roms/${game.file}`;
  const src = useMemo(() => {
    if (game.pick) return '/emulator/index.html?pick=1'; // 本地载入模式
    const p = new URLSearchParams({ core: game.core, rom: romUrl, name: game.name });
    if (game.bios) p.set('bios', `/roms/${game.bios}`);
    return `/emulator/index.html?${p.toString()}`;
  }, [game, romUrl]);

  // 服务器卡带模式:进入前确认卡带是否已放入(本地载入模式跳过)
  useEffect(() => {
    if (game.pick) return undefined;
    let alive = true;
    setStatus('checking');
    fetch(romUrl, { method: 'HEAD' })
      .then((r) => alive && setStatus(r.ok ? 'ready' : 'missing'))
      .catch(() => alive && setStatus('missing'));
    return () => {
      alive = false;
    };
  }, [romUrl, game.pick]);

  return (
    <div className="games-body arcade-shell">
      <div className="games-head">
        <div className="games-head-title">
          <Text fw={700} size="sm">🎮 {game.name}</Text>
          <Text size="xs" c="dimmed">真机模拟 · 原版音画 · 语音不中断</Text>
        </div>
        <div className="games-head-actions">
          {status === 'ready' && (
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Maximize2 size={13} />}
              onClick={() => window.open(src, '_blank', 'noopener')}
            >
              新窗口全屏
            </Button>
          )}
          <Button size="xs" variant="subtle" color="gray" leftSection={<ArrowLeft size={13} />} onClick={onExit}>
            返回大厅
          </Button>
        </div>
      </div>

      {status === 'ready' ? (
        <>
          <div className="emu-wrap">
            <iframe key={game.id} className="emu-frame" src={src} title={game.name} allow="autoplay; gamepad; fullscreen" />
          </div>
          <div className="emu-hint">
            <Text size="xs" c="dimmed">
              方向键移动 · X/Z = A/B · Enter 开始 · Shift 选择 · 支持手柄 · 可在模拟器设置里改键
            </Text>
          </div>
        </>
      ) : (
        <div className="emu-missing">
          <PackageOpen size={40} opacity={0.7} />
          {status === 'checking' ? (
            <Text c="dimmed" mt={10}>正在检查卡带…</Text>
          ) : (
            <>
              <Text fw={700} size="lg" mt={10}>该游戏卡带未放入</Text>
              <Text size="sm" c="dimmed" mt={4} ta="center" maw={420}>
                把 ROM 文件命名为下面的名字,放进服务器的 <Code>public/roms/</Code> 目录即可游玩
                {game.bios ? `(街机游戏还需 BIOS:${game.bios})` : ''}:
              </Text>
              <Code block mt={10}>{`public/roms/${game.file}`}</Code>
              <Text size="xs" c="dimmed" mt={10}>
                平台 {game.system} · 内核 {game.core} · 版权 ROM 需自备,放置与否由你决定
              </Text>
            </>
          )}
        </div>
      )}
    </div>
  );
}
