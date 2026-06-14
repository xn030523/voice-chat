'use client';

// 游戏面板顶层:连接状态屏 / 大厅 / 牌桌 三态 + 全屏开关(手机/大棋盘友好)
// 游戏服务不可用只影响本面板 —— 语音与聊天走 LiveKit,毫无关联
import { useEffect, useState } from 'react';
import { ActionIcon, Loader, Text, Tooltip } from '@mantine/core';
import { WifiOff, MonitorX, KeyRound, Maximize2, Minimize2 } from 'lucide-react';
import Lobby from './Lobby';
import TableView from './TableView';
import ArcadeShell from './arcade/ArcadeShell';

function StatusScreen({ icon, title, sub }) {
  return (
    <div className="games-status">
      {icon}
      <Text fw={600} mt={10}>
        {title}
      </Text>
      {sub && (
        <Text size="sm" c="dimmed" mt={4}>
          {sub}
        </Text>
      )}
    </div>
  );
}

export default function GamesPanel({ games }) {
  const { status, activeTable, lastError, clearError } = games;
  const [expanded, setExpanded] = useState(false);
  const [arcade, setArcade] = useState(null); // {type:'builtin',id} | {type:'emu',game}(不依赖游戏服)
  const [emuGames, setEmuGames] = useState([]); // 经典模拟器清单(public/roms/roms.json)
  const [emuPresent, setEmuPresent] = useState(() => new Set()); // 已放入卡带(ROM 文件存在)的 id
  const [emuAllPresent, setEmuAllPresent] = useState(false); // 自动扫描清单:全部已存在,免逐个探测

  // 拉取模拟器 ROM 清单(失败/为空则不显示该区,不影响其他功能)
  useEffect(() => {
    let alive = true;
    fetch('/roms/roms.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !Array.isArray(d.games)) return;
        const list = d.games.filter((g) => g && g.id && g.core && g.file);
        setEmuGames(list);
        if (d.scanned) {
          // 自动扫描出的清单 = 文件都在,直接全标可玩,避免成百上千次 HEAD 探测
          setEmuAllPresent(true);
          return;
        }
        // 手工维护的目录:逐个探测卡带是否就位(条目少,开销可控)
        list.forEach((g) => {
          fetch(`/roms/${g.file}`, { method: 'HEAD' })
            .then((res) => {
              if (alive && res.ok) setEmuPresent((prev) => new Set(prev).add(g.id));
            })
            .catch(() => {});
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 错误提示 3s 自动消失
  useEffect(() => {
    if (!lastError) return undefined;
    const t = setTimeout(clearError, 3000);
    return () => clearTimeout(t);
  }, [lastError, clearError]);

  // 全屏时 ESC 退出(捕获阶段,避免被浮层组件拦截)
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  let body;
  if (arcade) {
    // 街机/模拟器优先:本机运行,游戏服务不可用时也能玩
    body = <ArcadeShell selection={arcade} onExit={() => setArcade(null)} />;
  } else if (status === 'connecting' || status === 'idle') {
    body = <StatusScreen icon={<Loader size="sm" />} title="正在连接游戏服务…" />;
  } else if (status === 'unavailable') {
    body = (
      <StatusScreen
        icon={<WifiOff size={28} opacity={0.7} />}
        title="游戏服务不可用,正在重试…"
        sub="不影响语音与聊天"
      />
    );
  } else if (status === 'replaced') {
    body = (
      <StatusScreen
        icon={<MonitorX size={28} opacity={0.7} />}
        title="你在其他页面打开了游戏"
        sub="本页面的游戏连接已断开"
      />
    );
  } else if (status === 'authExpired') {
    body = (
      <StatusScreen
        icon={<KeyRound size={28} opacity={0.7} />}
        title="登录凭证已过期"
        sub="请重新进入房间后再打开游戏"
      />
    );
  } else if (activeTable) {
    body = <TableView games={games} />;
  } else {
    body = <Lobby games={games} emuGames={emuGames} emuPresent={emuPresent} emuAllPresent={emuAllPresent} onArcade={setArcade} />;
  }

  return (
    <div className={`games-panel${expanded ? ' expanded' : ''}`}>
      {body}
      <Tooltip label={expanded ? '退出全屏(Esc)' : '全屏'} withArrow position="left">
        <ActionIcon
          className="games-expand-btn"
          variant="subtle"
          color="gray"
          size={28}
          onClick={(e) => {
            e.currentTarget.blur();
            setExpanded((v) => !v);
          }}
          aria-label={expanded ? '退出全屏' : '全屏'}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </ActionIcon>
      </Tooltip>
      {lastError && <div className="games-toast">{lastError.msg}</div>}
    </div>
  );
}
