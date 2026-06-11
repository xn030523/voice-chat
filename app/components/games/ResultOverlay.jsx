'use client';

// 对局结果遮罩:胜负展示 + 再来一局/离开牌桌
import { Button, Text } from '@mantine/core';
import { Trophy, RotateCcw, DoorOpen } from 'lucide-react';

export default function ResultOverlay({ table, isHost, onRestart, onLeave }) {
  const r = table.result;
  if (!r) return null;

  let title;
  let sub = '';
  if (r.reason === 'dissolved') {
    title = '本局已解散';
  } else if (r.winner === 'draw') {
    title = '平局';
  } else if (typeof r.winner === 'number') {
    title = `${r.winnerName || `${r.winner + 1} 号位`} 获胜!`;
  } else if (r.winner) {
    title = `${r.winner} 获胜!`; // 阵营字符串(如斗地主 地主/农民,由引擎本地化)
  } else {
    title = '对局结束';
  }
  if (r.detail) sub = r.detail;

  const seated = table.you.seat !== null;

  return (
    <div className="game-result-overlay">
      <div className="game-result-card">
        <Trophy size={30} color="var(--mantine-color-yellow-5)" />
        <Text fw={700} size="lg" mt={6}>
          {title}
        </Text>
        {sub && (
          <Text size="sm" c="dimmed" mt={2}>
            {sub}
          </Text>
        )}
        <div className="game-result-actions">
          {isHost && (
            <Button leftSection={<RotateCcw size={15} />} onClick={onRestart}>
              再来一局
            </Button>
          )}
          {seated && (
            <Button variant="light" color="gray" leftSection={<DoorOpen size={15} />} onClick={onLeave}>
              离开牌桌
            </Button>
          )}
        </div>
        {!isHost && seated && (
          <Text size="xs" c="dimmed" mt={8}>
            等待房主再来一局…
          </Text>
        )}
      </div>
    </div>
  );
}
