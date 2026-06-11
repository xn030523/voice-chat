'use client';

// 五子棋盘:SVG 15×15,响应式 viewBox,悬浮虚子提示,最后一手标记,胜利连线高亮
import { useMemo, useState } from 'react';
import { Text } from '@mantine/core';

const N = 15;
const PAD = 28;
const CELL = 42;
const SIZE = PAD * 2 + CELL * (N - 1); // 644
const STAR_POINTS = [
  [3, 3], [11, 3], [7, 7], [3, 11], [11, 11],
];

const px = (i) => PAD + i * CELL;

export default function GomokuBoard({ table, onMove }) {
  const view = table.view;
  const [hover, setHover] = useState(null); // {x,y}
  const mySeat = table.you.seat;
  const playing = table.phase === 'playing';
  const myTurn = playing && mySeat !== null && view && view.turn === mySeat;

  const winSet = useMemo(() => {
    if (!view?.winLine) return null;
    return new Set(view.winLine.map((p) => p.y * N + p.x));
  }, [view]);

  if (!view) return null;

  const stoneColorOf = (seat) => (seat === view.black ? 'black' : 'white');
  const myStone = mySeat !== null ? stoneColorOf(mySeat) : null;

  const toCell = (evt) => {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const sx = ((evt.clientX - rect.left) / rect.width) * SIZE;
    const sy = ((evt.clientY - rect.top) / rect.height) * SIZE;
    const x = Math.round((sx - PAD) / CELL);
    const y = Math.round((sy - PAD) / CELL);
    if (x < 0 || x >= N || y < 0 || y >= N) return null;
    // 距交叉点过远不算
    if (Math.abs(sx - px(x)) > CELL * 0.42 || Math.abs(sy - px(y)) > CELL * 0.42) return null;
    return { x, y };
  };

  const handleMove = (evt) => {
    if (!myTurn) return setHover(null);
    const c = toCell(evt);
    if (!c || view.board[c.y * N + c.x] !== 0) return setHover(null);
    setHover(c);
  };

  const handleClick = (evt) => {
    if (!myTurn) return;
    const c = toCell(evt);
    if (!c || view.board[c.y * N + c.x] !== 0) return;
    setHover(null);
    onMove({ x: c.x, y: c.y });
  };

  const stones = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = view.board[y * N + x];
      if (!v) continue;
      const seat = v - 1;
      const color = stoneColorOf(seat);
      const isWin = winSet?.has(y * N + x);
      const isLast = view.lastMove && view.lastMove.x === x && view.lastMove.y === y;
      stones.push(
        <g key={`${x}-${y}`}>
          <circle
            cx={px(x)}
            cy={px(y)}
            r={17}
            fill={color === 'black' ? '#16181f' : '#f2f3f7'}
            stroke={isWin ? 'var(--gmk-win, #fbbf24)' : color === 'black' ? '#000' : '#c0c4cf'}
            strokeWidth={isWin ? 3 : 1}
          />
          {isLast && !isWin && (
            <circle cx={px(x)} cy={px(y)} r={4} fill={color === 'black' ? '#f2f3f7' : '#16181f'} />
          )}
        </g>
      );
    }
  }

  return (
    <div className="gomoku-board">
      <svg
        className="board-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        style={{ cursor: myTurn ? 'pointer' : 'default' }}
      >
        <rect x={0} y={0} width={SIZE} height={SIZE} rx={10} fill="#caa472" />
        <rect x={PAD - 10} y={PAD - 10} width={CELL * (N - 1) + 20} height={CELL * (N - 1) + 20} fill="#d3b07f" rx={6} />
        {Array.from({ length: N }, (_, i) => (
          <g key={i} stroke="#7a5b34" strokeWidth={i === 0 || i === N - 1 ? 1.6 : 0.9}>
            <line x1={px(0)} y1={px(i)} x2={px(N - 1)} y2={px(i)} />
            <line x1={px(i)} y1={px(0)} x2={px(i)} y2={px(N - 1)} />
          </g>
        ))}
        {STAR_POINTS.map(([x, y]) => (
          <circle key={`${x}${y}`} cx={px(x)} cy={px(y)} r={3.4} fill="#7a5b34" />
        ))}
        {stones}
        {hover && (
          <circle
            cx={px(hover.x)}
            cy={px(hover.y)}
            r={17}
            fill={myStone === 'black' ? '#16181f' : '#f2f3f7'}
            opacity={0.45}
          />
        )}
      </svg>
      <div className="board-legend">
        {mySeat !== null ? (
          <Text size="xs" c="dimmed">
            你执{myStone === 'black' ? '黑' : '白'}
            {playing && (myTurn ? ' · 轮到你了' : ` · 等待 ${table.seats[view.turn]?.name || '对方'} 行动…`)}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            黑方:{table.seats[view.black]?.name || '—'} · 白方:{table.seats[1 - view.black]?.name || '—'}
          </Text>
        )}
      </div>
    </div>
  );
}
