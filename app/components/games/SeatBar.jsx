'use client';

// 座位条:每个座位一枚芯片(名字/房主/离线/轮到谁/我)
import { Badge } from '@mantine/core';
import { Crown, User } from 'lucide-react';

export default function SeatBar({ table }) {
  const { seats, turn, phase, you } = table;
  return (
    <div className="table-seats">
      {seats.map((s, i) => {
        if (!s) {
          return (
            <div key={`empty-${i}`} className="seat-chip empty">
              <User size={13} opacity={0.4} />
              <span className="seat-name">空位</span>
            </div>
          );
        }
        const isTurn = phase === 'playing' && turn === s.seat;
        const cls = ['seat-chip'];
        if (isTurn) cls.push('turn');
        if (!s.connected) cls.push('offline');
        return (
          <div key={s.seat} className={cls.join(' ')}>
            {s.isHost && <Crown size={13} className="seat-host" />}
            <span className="seat-name">
              {s.name}
              {you.seat === s.seat ? '(我)' : ''}
            </span>
            {!s.connected && (
              <Badge size="xs" color="gray" variant="filled">
                {s.abandoned ? '已离开' : '离线'}
              </Badge>
            )}
            {isTurn && s.connected && (
              <Badge size="xs" color="indigo" variant="filled">
                行动中
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
