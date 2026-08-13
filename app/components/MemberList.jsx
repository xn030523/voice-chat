'use client';

import { ScrollArea, Stack, Group, Avatar, Text, Badge, Tooltip } from '@mantine/core';
import { Users, MonitorUp, MicOff } from 'lucide-react';

const STATE_LABEL = {
  new: '等待连接',
  connecting: '连接中…',
  connected: '已连接',
  disconnected: '连接中断',
  failed: '连接失败',
  closed: '已关闭',
};

export default function MemberList({ roster, activeSharerId, connectedCount = 0, peerTotal = 0 }) {
  return (
    <div className="member-panel">
      <div className="panel-title">
        <Users size={15} /> 成员 · {roster.length}
        {peerTotal > 0 && (
          <span
            className={`conn-summary${connectedCount < peerTotal ? ' warn' : ''}`}
            title="语音已连接成员数 / 应连接总数"
          >
            语音 {connectedCount}/{peerTotal}
          </span>
        )}
      </div>
      <ScrollArea className="member-scroll" type="auto">
        <Stack gap={6} p="xs">
          {roster.map((m) => (
            <Group key={m.id} className={`member-row${m.self ? ' me' : ''}`} gap={10} wrap="nowrap">
              <Avatar radius="xl" size={32} color="gray">
                {(m.name || '?').charAt(0).toUpperCase()}
              </Avatar>
              <Text className="member-name" size="sm" fw={500} truncate>
                {m.name}
              </Text>
              {activeSharerId && activeSharerId === m.id && (
                <MonitorUp size={15} className="sharing-icon" />
              )}
              {m.muted && (
                <Tooltip label="已静音" withArrow>
                  <MicOff size={15} className="muted-icon" />
                </Tooltip>
              )}
              {m.self ? (
                <Badge size="xs" variant="light">
                  你
                </Badge>
              ) : (
                <Tooltip label={STATE_LABEL[m.state] || m.state} withArrow>
                  <span className={`dot state-${m.state}`} />
                </Tooltip>
              )}
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </div>
  );
}
