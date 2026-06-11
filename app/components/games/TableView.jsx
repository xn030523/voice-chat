'use client';

// 牌桌视图:座位条 + 按游戏分发棋盘 + 操作栏 + 解散投票条 + 结果遮罩
import { Badge, Button, Text } from '@mantine/core';
import { DoorOpen, Flag, Play, Eye } from 'lucide-react';
import SeatBar from './SeatBar';
import ResultOverlay from './ResultOverlay';
import GomokuBoard from './boards/GomokuBoard';

const BOARDS = {
  gomoku: GomokuBoard,
};

export default function TableView({ games }) {
  const { activeTable: table, leaveTable, startGame, restartGame, sendMove, requestDissolve, voteDissolve, identity } =
    games;
  if (!table) return null;

  const mySeat = table.you.seat;
  const seated = mySeat !== null;
  const me = seated ? table.seats[mySeat] : null;
  const isHost = !!me?.isHost;
  const seatedCount = table.seats.filter(Boolean).length;
  const Board = BOARDS[table.game];

  // 解散投票条
  let dissolveBar = null;
  if (table.dissolve && table.phase === 'playing') {
    const d = table.dissolve;
    const requesterName = table.seats[d.requesterSeat]?.name || '对方';
    const iVoted = seated && d.votes[mySeat] !== undefined;
    dissolveBar = (
      <div className="dissolve-bar">
        <Text size="sm">{requesterName} 申请解散本局</Text>
        {seated && !iVoted ? (
          <div className="dissolve-actions">
            <Button size="xs" color="red" onClick={() => voteDissolve(true)}>
              同意解散
            </Button>
            <Button size="xs" variant="light" onClick={() => voteDissolve(false)}>
              继续对局
            </Button>
          </div>
        ) : (
          <Text size="xs" c="dimmed">
            等待其他玩家表态…
          </Text>
        )}
      </div>
    );
  }

  // 有人弃局(超宽限/主动离桌)→ 单方解散提示
  const someoneAbandoned =
    table.phase === 'playing' && table.seats.some((s) => s && s.abandoned);

  // 等待区:开始按钮 / 等待提示
  let waitingBar = null;
  if (table.phase === 'waiting') {
    const minSeats = table.seatMin || 2;
    const enough = seatedCount >= minSeats;
    waitingBar = (
      <div className="waiting-bar">
        {isHost ? (
          <Button leftSection={<Play size={15} />} disabled={!enough} onClick={startGame}>
            开始游戏
          </Button>
        ) : (
          <Text size="sm" c="dimmed">
            等待房主开始…
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {enough ? `已就座 ${seatedCount} 人` : `至少需要 ${minSeats} 人(已就座 ${seatedCount} 人)`}
        </Text>
      </div>
    );
  }

  return (
    <div className="games-body table-view">
      <div className="games-head">
        <div className="games-head-title">
          <Text fw={700} size="sm">
            {table.gameName}
          </Text>
          {!seated && (
            <Badge size="xs" variant="light" color="gray" leftSection={<Eye size={11} />}>
              观战中
            </Badge>
          )}
          {table.spectators > 0 && (
            <Text size="xs" c="dimmed">
              {table.spectators} 人观战
            </Text>
          )}
        </div>
        <div className="games-head-actions">
          {seated && table.phase === 'playing' && !table.dissolve && (
            <Button size="xs" variant="subtle" color="red" leftSection={<Flag size={13} />} onClick={requestDissolve}>
              {someoneAbandoned ? '解散本局' : '申请解散'}
            </Button>
          )}
          <Button size="xs" variant="subtle" color="gray" leftSection={<DoorOpen size={13} />} onClick={leaveTable}>
            离开牌桌
          </Button>
        </div>
      </div>

      <SeatBar table={table} />
      {someoneAbandoned && !table.dissolve && (
        <div className="abandon-banner">对方已离线,可解散本局</div>
      )}
      {dissolveBar}
      {waitingBar}

      <div className="board-wrap">
        {Board ? (
          <Board table={table} onMove={sendMove} identity={identity} />
        ) : (
          <Text c="dimmed">该游戏即将上线</Text>
        )}
        {table.phase === 'ended' && (
          <ResultOverlay table={table} isHost={isHost} onRestart={restartGame} onLeave={leaveTable} />
        )}
      </div>
    </div>
  );
}
