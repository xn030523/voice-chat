'use client';

// 游戏面板顶层:连接状态屏 / 大厅 / 牌桌 三态
// 游戏服务不可用只影响本面板 —— 语音与聊天走 LiveKit,毫无关联
import { useEffect } from 'react';
import { Loader, Text } from '@mantine/core';
import { WifiOff, MonitorX, KeyRound } from 'lucide-react';
import Lobby from './Lobby';
import TableView from './TableView';

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

  // 错误提示 3s 自动消失
  useEffect(() => {
    if (!lastError) return undefined;
    const t = setTimeout(clearError, 3000);
    return () => clearTimeout(t);
  }, [lastError, clearError]);

  let body;
  if (status === 'connecting' || status === 'idle') {
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
    body = <Lobby games={games} />;
  }

  return (
    <div className="games-panel">
      {body}
      {lastError && <div className="games-toast">{lastError.msg}</div>}
    </div>
  );
}
