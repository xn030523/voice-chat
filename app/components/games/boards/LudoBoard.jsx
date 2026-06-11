'use client';

// 飞行棋盘:15×15 十字盘 SVG(主环按色染格、终点跑道、机库、飞行虚线),
// 掷骰按钮 + 可动飞机高亮点选。规则同构复用引擎 legalMoves。
import { useMemo } from 'react';
import { Button, Text } from '@mantine/core';
import { Dices } from 'lucide-react';
import {
  RING,
  RING_XY,
  HOME_XY,
  CENTER_XY,
  HANGAR_XY,
  COLOR_HEX,
  COLOR_NAMES,
  entryOf,
  ringCellOf,
  planeXY,
  FLY_FROM_P,
  FLY_TO_P,
} from '@/games-server/engines/ludo-board.js';
import { legalMoves } from '@/games-server/engines/ludo.js';

const CELL = 40;
const SIZE = CELL * 15;
const cx = (c) => c * CELL + CELL / 2;
const cy = (r) => r * CELL + CELL / 2;

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function LudoBoard({ table, onMove }) {
  const view = table.view;
  const mySeat = table.you.seat;
  const playing = view?.phase === 'playing';
  const myTurn = playing && mySeat !== null && view.turn === mySeat;

  const lm = useMemo(() => (myTurn ? legalMoves(view, mySeat) : null), [myTurn, view, mySeat]);
  const movableSet = useMemo(() => new Set(lm?.kind === 'move' ? lm.planes : []), [lm]);

  if (!view) return null;
  const seats = view.seatCount;

  // 底盘格子
  const cells = [];
  for (let k = 0; k < RING; k++) {
    const [c, r] = RING_XY[k];
    const color = COLOR_HEX[k % 4];
    const isEntry = k % 13 === 0;
    cells.push(
      <rect
        key={`ring${k}`}
        x={c * CELL + 2}
        y={r * CELL + 2}
        width={CELL - 4}
        height={CELL - 4}
        rx={7}
        fill={color}
        opacity={isEntry ? 0.85 : 0.3}
        stroke={color}
        strokeWidth={isEntry ? 2 : 1}
      />
    );
    if (isEntry) {
      cells.push(
        <text key={`e${k}`} x={cx(c)} y={cy(r) + 1} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#fff" fontWeight={700}>
          起
        </text>
      );
    }
  }
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 5; i++) {
      const [c, r] = HOME_XY[s][i];
      cells.push(
        <rect key={`h${s}-${i}`} x={c * CELL + 2} y={r * CELL + 2} width={CELL - 4} height={CELL - 4} rx={7} fill={COLOR_HEX[s]} opacity={0.55} />
      );
    }
  }
  // 中心终点
  cells.push(
    <g key="center">
      <circle cx={cx(CENTER_XY[0])} cy={cy(CENTER_XY[1])} r={CELL * 0.72} fill="#f4ead6" stroke="#c8a951" strokeWidth={2} />
      <text x={cx(CENTER_XY[0])} y={cy(CENTER_XY[1]) + 1} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={800} fill="#a07a2c">
        终
      </text>
    </g>
  );
  // 机库
  const hangars = [];
  const HANGAR_BOX = [
    [0, 0], [9, 0], [9, 9], [0, 9],
  ];
  for (let s = 0; s < 4; s++) {
    const active = s < seats;
    const [bc, br] = HANGAR_BOX[s];
    hangars.push(
      <g key={`hg${s}`} opacity={active ? 1 : 0.25}>
        <rect x={bc * CELL + 6} y={br * CELL + 6} width={6 * CELL - 12} height={6 * CELL - 12} rx={14} fill={COLOR_HEX[s]} opacity={0.18} stroke={COLOR_HEX[s]} strokeWidth={2} />
        {HANGAR_XY[s].map(([c, r], i) => (
          <circle key={i} cx={cx(c)} cy={cy(r)} r={14} fill="none" stroke={COLOR_HEX[s]} strokeWidth={1.6} strokeDasharray="4 3" />
        ))}
        <text x={(bc + 3) * CELL} y={(br + 3) * CELL + 4} textAnchor="middle" fontSize={13} fill={COLOR_HEX[s]} fontWeight={700} opacity={0.85}>
          {active ? `${COLOR_NAMES[s]}方${table.seats[s]?.name ? ` · ${table.seats[s].name}` : ''}` : ''}
        </text>
      </g>
    );
  }
  // 飞行虚线
  const flyLines = [];
  for (let s = 0; s < seats; s++) {
    const [c1, r1] = RING_XY[ringCellOf(s, FLY_FROM_P)];
    const [c2, r2] = RING_XY[ringCellOf(s, FLY_TO_P)];
    flyLines.push(
      <line key={`fly${s}`} x1={cx(c1)} y1={cy(r1)} x2={cx(c2)} y2={cy(r2)} stroke={COLOR_HEX[s]} strokeWidth={2} strokeDasharray="6 6" opacity={0.45} />
    );
  }

  // 飞机(同格堆叠偏移)
  const occupancy = new Map();
  const planes = [];
  for (let s = 0; s < seats; s++) {
    view.players[s].planes.forEach((pl, i) => {
      const [c, r] = planeXY(s, pl);
      const key = `${c},${r}`;
      const n = occupancy.get(key) || 0;
      occupancy.set(key, n + 1);
      const ox = (n % 2) * 10 - 5 * (n > 0 ? 1 : 0);
      const oy = Math.floor(n / 2) * 9 - 4 * (n > 1 ? 1 : 0);
      const movable = s === mySeat && movableSet.has(i);
      planes.push(
        <g
          key={`pl${s}-${i}`}
          onClick={(e) => {
            e.stopPropagation();
            if (movable) onMove({ type: 'move', plane: i });
          }}
          style={{ cursor: movable ? 'pointer' : 'default' }}
        >
          <g style={{ pointerEvents: 'none' }}>
            {movable && <circle cx={cx(c) + ox} cy={cy(r) + oy} r={16} fill="none" stroke="#fbbf24" strokeWidth={2.6} className="ludo-pulse" />}
            <circle cx={cx(c) + ox} cy={cy(r) + oy} r={11} fill={COLOR_HEX[s]} stroke="#fff" strokeWidth={2} />
            <text x={cx(c) + ox} y={cy(r) + oy + 1} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#fff" fontWeight={700}>
              {i + 1}
            </text>
          </g>
          <circle cx={cx(c) + ox} cy={cy(r) + oy} r={16} fill="transparent" />
        </g>
      );
    });
  }

  const turnName = view.turn !== null ? table.seats[view.turn]?.name || `${COLOR_NAMES[view.turn]}方` : '';
  const lastDice = view.lastDice;

  return (
    <div className="gomoku-board">
      <svg className="board-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ aspectRatio: '1' }}>
        <rect x={0} y={0} width={SIZE} height={SIZE} rx={12} fill="#20243a" />
        {hangars}
        {flyLines}
        {cells}
        {planes}
      </svg>
      <div className="board-legend ludo-legend">
        {lastDice && (
          <Text size="lg" fw={800} c="yellow.4" component="span" mr={8}>
            {DICE_FACES[lastDice.dice]} {lastDice.dice}
          </Text>
        )}
        {myTurn && lm?.kind === 'roll' ? (
          <Button size="xs" leftSection={<Dices size={14} />} onClick={() => onMove({ type: 'roll' })}>
            掷骰子
          </Button>
        ) : (
          <Text size="xs" c="dimmed" component="span">
            {playing
              ? myTurn
                ? movableSet.size
                  ? '选择要移动的棋子'
                  : '…'
                : `等待 ${turnName} 行动…`
              : ''}
            {mySeat !== null && playing && ` · 你是${COLOR_NAMES[mySeat]}方`}
          </Text>
        )}
      </div>
    </div>
  );
}
