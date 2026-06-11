'use client';

import { Group, Badge, Button, ActionIcon, Tooltip, Indicator } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { MonitorUp, MonitorStop, LogOut, Mic, MicOff, Gamepad2 } from 'lucide-react';

export default function RoomHeader({
  onlineCount,
  connected,
  isSharing,
  someoneElseSharing,
  reconnecting,
  muted,
  onToggleMute,
  onShare,
  onStopShare,
  onLeave,
  gamesOpen,
  onToggleGames,
  gamesAlert,
}) {
  const isMobile = useMediaQuery('(max-width: 600px)', false);

  const micBtn = muted ? (
    isMobile ? (
      <ActionIcon
        color="red"
        variant="filled"
        size={36}
        onClick={onToggleMute}
        aria-label="取消静音"
      >
        <MicOff size={18} />
      </ActionIcon>
    ) : (
      <Button
        color="red"
        variant="filled"
        leftSection={<MicOff size={16} />}
        onClick={onToggleMute}
      >
        已静音
      </Button>
    )
  ) : isMobile ? (
    <ActionIcon
      variant="light"
      size={36}
      onClick={onToggleMute}
      aria-label="静音"
    >
      <Mic size={18} />
    </ActionIcon>
  ) : (
    <Button
      variant="light"
      leftSection={<Mic size={16} />}
      onClick={onToggleMute}
    >
      麦克风
    </Button>
  );

  let shareBtn;
  if (isSharing) {
    shareBtn = isMobile ? (
      <ActionIcon
        color="yellow"
        variant="filled"
        size={36}
        onClick={onStopShare}
        aria-label="停止共享"
      >
        <MonitorStop size={18} />
      </ActionIcon>
    ) : (
      <Button
        color="yellow"
        variant="filled"
        leftSection={<MonitorStop size={16} />}
        onClick={onStopShare}
      >
        停止共享
      </Button>
    );
  } else if (isMobile) {
    shareBtn = (
      <ActionIcon
        variant="light"
        size={36}
        onClick={onShare}
        disabled={!connected || someoneElseSharing}
        aria-label="共享屏幕"
      >
        <MonitorUp size={18} />
      </ActionIcon>
    );
  } else {
    shareBtn = (
      <Tooltip label="已有人在共享" disabled={!someoneElseSharing} withArrow>
        <Button
          variant="light"
          leftSection={<MonitorUp size={16} />}
          onClick={onShare}
          disabled={!connected || someoneElseSharing}
        >
          {someoneElseSharing ? '他人共享中' : '共享屏幕'}
        </Button>
      </Tooltip>
    );
  }

  const leaveBtn = isMobile ? (
    <ActionIcon color="red" variant="filled" size={36} onClick={onLeave} aria-label="离开">
      <LogOut size={18} />
    </ActionIcon>
  ) : (
    <Button color="red" variant="filled" leftSection={<LogOut size={16} />} onClick={onLeave}>
      离开
    </Button>
  );

  const gamesBtn = (
    <Indicator disabled={!gamesAlert} color="red" size={9} processing offset={3}>
      {isMobile ? (
        <ActionIcon
          variant={gamesOpen ? 'filled' : 'light'}
          size={36}
          onClick={onToggleGames}
          disabled={!connected && !gamesOpen}
          aria-label="游戏"
        >
          <Gamepad2 size={18} />
        </ActionIcon>
      ) : (
        <Button
          variant={gamesOpen ? 'filled' : 'light'}
          leftSection={<Gamepad2 size={16} />}
          onClick={onToggleGames}
          disabled={!connected && !gamesOpen}
        >
          游戏
        </Button>
      )}
    </Indicator>
  );

  return (
    <header className="room-header">
      <Group gap={10} wrap="nowrap">
        <div className="brand">
          <Mic size={18} />
        </div>
        <div>
          <div className="brand-title">语音聊天室</div>
          <div className="brand-sub">
            {muted ? '麦克风已静音' : '麦克风已开启 · 即说即聊'}
          </div>
        </div>
      </Group>

      <Group gap={8} wrap="nowrap">
        <Badge variant="light" color={reconnecting ? 'yellow' : 'indigo'} size={isMobile ? 'md' : 'lg'}>
          {reconnecting ? '重连中…' : `${onlineCount} 人在线`}
        </Badge>
        {micBtn}
        {shareBtn}
        {gamesBtn}
        {leaveBtn}
      </Group>
    </header>
  );
}
