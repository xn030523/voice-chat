'use client';

// 大厅:联机牌桌 + 街机厅 + 回归座位横幅
import { Badge, Button, Text, ScrollArea } from '@mantine/core';
import { Eye, Plus, Undo2, Gamepad2 } from 'lucide-react';
import { ARCADE_GAMES } from './arcade/ArcadeShell';

const PHASE_LABEL = { waiting: '等待中', playing: '进行中', ended: '已结束' };
const PHASE_COLOR = { waiting: 'teal', playing: 'indigo', ended: 'gray' };

export default function Lobby({ games, onArcade }) {
  const { games: metas, tables, reclaimable, createTable, joinTable, spectateTable } = games;

  return (
    <div className="games-body">
      <div className="games-head">
        <Text fw={700} size="sm">
          游戏大厅
        </Text>
        <Text size="xs" c="dimmed">
          边语音边开局,聊天不打断
        </Text>
      </div>

      <ScrollArea className="lobby-scroll" type="auto">
        {reclaimable.length > 0 && (
          <div className="reclaim-banner">
            <Text size="sm">检测到你的牌局,是否回到座位?</Text>
            {reclaimable.map((r) => (
              <Button
                key={`${r.tableId}-${r.seat}`}
                size="xs"
                variant="light"
                leftSection={<Undo2 size={14} />}
                onClick={() => joinTable(r.tableId, r.seat, true)}
              >
                回到 {r.gameName}
              </Button>
            ))}
          </div>
        )}

        <div className="lobby-section">
          <Text size="xs" c="dimmed" fw={600} mb={6}>
            创建牌桌
          </Text>
          <div className="game-pick-grid">
            {metas.map((m) => (
              <button key={m.id} type="button" className="game-pick" onClick={() => createTable(m.id)}>
                <span className="game-pick-icon">{m.name.slice(0, 1)}</span>
                <span className="game-pick-name">{m.name}</span>
                <span className="game-pick-seats">
                  {m.minSeats === m.maxSeats ? `${m.maxSeats} 人` : `${m.minSeats}-${m.maxSeats} 人`}
                </span>
                <Plus size={14} className="game-pick-plus" />
              </button>
            ))}
          </div>
        </div>

        <div className="lobby-section">
          <Text size="xs" c="dimmed" fw={600} mb={6}>
            街机厅(本机 · 单人/同屏双人 · 语音不中断)
          </Text>
          <div className="game-pick-grid">
            {ARCADE_GAMES.map((g) => (
              <button key={g.id} type="button" className="game-pick arcade" onClick={() => onArcade?.(g.id)}>
                <span className="game-pick-icon arcade-icon">{g.icon}</span>
                <span className="game-pick-name">{g.name}</span>
                <span className="game-pick-seats">{g.players}</span>
                <Gamepad2 size={14} className="game-pick-plus" />
              </button>
            ))}
          </div>
        </div>

        <div className="lobby-section">
          <Text size="xs" c="dimmed" fw={600} mb={6}>
            当前牌桌
          </Text>
          {tables.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py={18}>
              暂无牌桌,选择上方游戏开一桌
            </Text>
          ) : (
            <div className="lobby-list">
              {tables.map((t) => {
                const full = t.seated.length >= t.seatMax;
                return (
                  <div key={t.id} className="lobby-card">
                    <div className="lobby-card-main">
                      <div className="lobby-card-title">
                        <span className="game-pick-icon sm">{t.gameName.slice(0, 1)}</span>
                        <Text fw={600} size="sm">
                          {t.gameName}
                        </Text>
                        <Badge size="xs" variant="light" color={PHASE_COLOR[t.phase] || 'gray'}>
                          {PHASE_LABEL[t.phase] || t.phase}
                        </Badge>
                      </div>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {t.seated.join('、') || '虚位以待'}({t.seated.length}/{t.seatMax})
                        {t.spectators > 0 ? ` · ${t.spectators} 人观战` : ''}
                      </Text>
                    </div>
                    <div className="lobby-card-actions">
                      {t.phase === 'waiting' && !full && (
                        <Button size="xs" onClick={() => joinTable(t.id)}>
                          加入
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<Eye size={14} />}
                        onClick={() => spectateTable(t.id)}
                      >
                        观战
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
