'use client';

import { Group, Badge, Button, ActionIcon, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { MonitorUp, MonitorStop, LogOut, Mic, MicOff } from 'lucide-react';

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
}) {
  const isMobile = useMediaQuery('(max-width: 600px)', false);

  const micBtn = muted
    ? isMobile ? (
        <ActionIcon variant="default" color="red" size={34} onClick={onToggleMute} aria-label="取消静音">
          <MicOff size={17} />
        </ActionIcon>
      ) : (
        <Button variant="default" color="red" leftSection={<MicOff size={15} />} onClick={onToggleMute}>
          已静音
        </Button>
      )
    : isMobile ? (
        <ActionIcon variant="default" size={34} onClick={onToggleMute} aria-label="静音">
          <Mic size={17} />
        </ActionIcon>
      ) : (
        <Button variant="default" leftSection={<Mic size={15} />} onClick={onToggleMute}>
          麦克风
        </Button>
      );

  let shareBtn;
  if (isSharing) {
    shareBtn = isMobile ? (
      <ActionIcon variant="default" color="yellow" size={34} onClick={onStopShare} aria-label="停止共享">
        <MonitorStop size={17} />
      </ActionIcon>
    ) : (
      <Button variant="default" color="yellow" leftSection={<MonitorStop size={15} />} onClick={onStopShare}>
        停止共享
      </Button>
    );
  } else if (isMobile) {
    shareBtn = (
      <ActionIcon
        variant="default"
        size={34}
        onClick={onShare}
        disabled={!connected || someoneElseSharing}
        aria-label="共享屏幕"
      >
        <MonitorUp size={17} />
      </ActionIcon>
    );
  } else {
    shareBtn = (
      <Tooltip label="已有人在共享" disabled={!someoneElseSharing} withArrow>
        <Button
          variant="default"
          leftSection={<MonitorUp size={15} />}
          onClick={onShare}
          disabled={!connected || someoneElseSharing}
        >
          {someoneElseSharing ? '他人共享中' : '共享屏幕'}
        </Button>
      </Tooltip>
    );
  }

  const leaveBtn = isMobile ? (
    <ActionIcon variant="default" color="red" size={34} onClick={onLeave} aria-label="离开">
      <LogOut size={17} />
    </ActionIcon>
  ) : (
    <Button variant="default" color="red" leftSection={<LogOut size={15} />} onClick={onLeave}>
      离开
    </Button>
  );

  return (
    <header className="room-header">
      <div className="brand">
        <div className="brand-mark">
          <span aria-hidden>🦌</span>
        </div>
        <div>
          <div className="brand-title">🦌专用会议</div>
          <div className="brand-sub">{muted ? '麦克风已静音' : '即说即聊'}</div>
        </div>
      </div>

      <Group gap={8} wrap="nowrap">
        <Badge variant="light" color={reconnecting ? 'yellow' : 'gray'} size={isMobile ? 'md' : 'sm'}>
          {reconnecting ? '重连中' : `${onlineCount} 人`}
        </Badge>
        {micBtn}
        {shareBtn}
        {leaveBtn}
      </Group>
    </header>
  );
}
