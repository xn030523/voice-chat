'use client';

// 中国象棋盘:SVG 9×10 交叉点,汉字棋子(零图片资产),点选高亮合法落点,黑方视角自动翻转
// 走法提示直接复用服务端同一引擎(同构纯函数)—— 服务端仍是唯一裁决者
import { useMemo, useState } from 'react';
import { Text } from '@mantine/core';
import { legalMoves, PIECE_NAMES, sideOfSeat } from '@/games-server/engines/xiangqi.js';

const COLS = 9;
const ROWS = 10;
const CELL = 60;
const PAD = 42;
const W = PAD * 2 + CELL * (COLS - 1); // 564
const H = PAD * 2 + CELL * (ROWS - 1); // 624

const px = (c) => PAD + c * CELL;
const py = (r) => PAD + r * CELL;

// 兵/炮位的小十字标记
function PointMark({ r, c }) {
  const x = px(c);
  const y = py(r);
  const a = 6;
  const g = 3;
  const seg = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if ((c === 0 && sx < 0) || (c === COLS - 1 && sx > 0)) continue;
    seg.push(
      <path
        key={`${sx}${sy}`}
        d={`M ${x + sx * g} ${y + sy * (g + a)} L ${x + sx * g} ${y + sy * g} L ${x + sx * (g + a)} ${y + sy * g}`}
        fill="none"
      />
    );
  }
  return <g stroke="#9a7747" strokeWidth={1.4}>{seg}</g>;
}

export default function XiangqiBoard({ table, onMove }) {
  const view = table.view;
  const [selected, setSelected] = useState(null);
  const mySeat = table.you.seat;
  const playing = table.phase === 'playing';
  const myTurn = playing && mySeat !== null && view && view.turn === mySeat;
  const mySide = mySeat !== null && view ? sideOfSeat(view, mySeat) : 0;
  const flip = mySide === 1; // 黑方视角翻转,自己永远在下方

  const hints = useMemo(() => {
    if (selected === null || !myTurn) return new Set();
    return new Set(legalMoves(view, mySeat, { from: selected }));
  }, [selected, myTurn, view, mySeat]);

  if (!view) return null;

  const dispRC = (r, c) => (flip ? [ROWS - 1 - r, COLS - 1 - c] : [r, c]);
  const realIdx = (dr, dc) => {
    const [r, c] = flip ? [ROWS - 1 - dr, COLS - 1 - dc] : [dr, dc];
    return r * COLS + c;
  };

  const toCell = (evt) => {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const sx = ((evt.clientX - rect.left) / rect.width) * W;
    const sy = ((evt.clientY - rect.top) / rect.height) * H;
    const dc = Math.round((sx - PAD) / CELL);
    const dr = Math.round((sy - PAD) / CELL);
    if (dc < 0 || dc >= COLS || dr < 0 || dr >= ROWS) return null;
    if (Math.abs(sx - px(dc)) > CELL * 0.44 || Math.abs(sy - py(dr)) > CELL * 0.44) return null;
    return realIdx(dr, dc);
  };

  const handleClick = (evt) => {
    if (!myTurn) return;
    const cell = toCell(evt);
    if (cell === null) return;
    const piece = view.board[cell];
    if (selected !== null && hints.has(cell)) {
      onMove({ from: selected, to: cell });
      setSelected(null);
      return;
    }
    if (piece && piece.side === mySide) {
      setSelected(cell === selected ? null : cell);
      return;
    }
    setSelected(null);
  };

  // 网格线
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    lines.push(<line key={`h${r}`} x1={px(0)} y1={py(r)} x2={px(COLS - 1)} y2={py(r)} />);
  }
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) {
      lines.push(<line key={`v${c}`} x1={px(c)} y1={py(0)} x2={px(c)} y2={py(ROWS - 1)} />);
    } else {
      lines.push(<line key={`v${c}a`} x1={px(c)} y1={py(0)} x2={px(c)} y2={py(4)} />);
      lines.push(<line key={`v${c}b`} x1={px(c)} y1={py(5)} x2={px(c)} y2={py(ROWS - 1)} />);
    }
  }
  // 九宫斜线(显示坐标恒定:上下两宫)
  const palace = [
    <line key="p1" x1={px(3)} y1={py(0)} x2={px(5)} y2={py(2)} />,
    <line key="p2" x1={px(5)} y1={py(0)} x2={px(3)} y2={py(2)} />,
    <line key="p3" x1={px(3)} y1={py(7)} x2={px(5)} y2={py(9)} />,
    <line key="p4" x1={px(5)} y1={py(7)} x2={px(3)} y2={py(9)} />,
  ];
  // 兵/炮位标记(对称,翻转不变)
  const marks = [];
  for (const [r, c] of [
    [2, 1], [2, 7], [7, 1], [7, 7], // 炮位
    [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
    [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
  ]) {
    marks.push(<PointMark key={`m${r}-${c}`} r={r} c={c} />);
  }

  // 棋子与标记
  const pieces = [];
  const overlays = [];
  for (let i = 0; i < view.board.length; i++) {
    const p = view.board[i];
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const [dr, dc] = dispRC(r, c);
    const x = px(dc);
    const y = py(dr);
    const isLastFrom = view.lastMove && view.lastMove.from === i;
    const isLastTo = view.lastMove && view.lastMove.to === i;
    if (isLastFrom) {
      overlays.push(<rect key={`lf${i}`} x={x - 8} y={y - 8} width={16} height={16} fill="none" stroke="#fbbf24" strokeWidth={1.6} opacity={0.8} />);
    }
    if (p) {
      const isSel = selected === i;
      const red = p.side === 0;
      pieces.push(
        <g key={`pc${i}`}>
          <circle cx={x} cy={y} r={25} fill={red ? '#f8e9d2' : '#f3ead8'} stroke={isSel ? '#fbbf24' : red ? '#b03a2e' : '#3b3a36'} strokeWidth={isSel ? 3.5 : 2} />
          <circle cx={x} cy={y} r={21} fill="none" stroke={red ? '#c0392b' : '#4a473f'} strokeWidth={0.8} opacity={0.7} />
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={700} fill={red ? '#b03a2e' : '#2f2d28'}>
            {PIECE_NAMES[p.side][p.kind]}
          </text>
          {isLastTo && <circle cx={x} cy={y} r={29} fill="none" stroke="#fbbf24" strokeWidth={1.6} opacity={0.85} />}
        </g>
      );
    }
    if (hints.has(i)) {
      overlays.push(
        p ? (
          <circle key={`h${i}`} cx={x} cy={y} r={29} fill="none" stroke="#34d399" strokeWidth={2.4} strokeDasharray="6 4" />
        ) : (
          <circle key={`h${i}`} cx={x} cy={y} r={7} fill="#34d399" opacity={0.85} />
        )
      );
    }
  }

  const turnName = table.seats[view.turn]?.name || '对方';
  const checkNow = playing && view.inCheck;

  return (
    <div className="gomoku-board">
      <svg className="board-svg xiangqi-svg" viewBox={`0 0 ${W} ${H}`} onClick={handleClick} style={{ cursor: myTurn ? 'pointer' : 'default', aspectRatio: `${W} / ${H}` }}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="#caa472" />
        <rect x={PAD - 14} y={PAD - 14} width={CELL * (COLS - 1) + 28} height={CELL * (ROWS - 1) + 28} fill="#d3b07f" rx={6} />
        <g stroke="#7a5b34" strokeWidth={1.1}>{lines}</g>
        <rect x={px(0)} y={py(0)} width={CELL * (COLS - 1)} height={CELL * (ROWS - 1)} fill="none" stroke="#7a5b34" strokeWidth={2} />
        <g stroke="#7a5b34" strokeWidth={1.1}>{palace}</g>
        {marks}
        <text x={px(1) + CELL} y={py(4) + CELL / 2 + 9} fontSize={30} fill="#8a6a3e" fontWeight={600} style={{ letterSpacing: 6 }}>
          楚 河
        </text>
        <text x={px(5)} y={py(4) + CELL / 2 + 9} fontSize={30} fill="#8a6a3e" fontWeight={600} style={{ letterSpacing: 6 }}>
          汉 界
        </text>
        {overlays}
        {pieces}
      </svg>
      <div className="board-legend">
        <Text size="xs" c={checkNow ? 'red.4' : 'dimmed'} fw={checkNow ? 700 : 400}>
          {mySeat !== null
            ? `你执${mySide === 0 ? '红' : '黑'}${
                playing ? (myTurn ? `${checkNow ? ' · 将军!' : ''} · 轮到你了` : ` · 等待 ${turnName} 行动…${checkNow ? '(将军!)' : ''}`) : ''
              }`
            : `红方:${table.seats[view.redSeat]?.name || '—'} · 黑方:${table.seats[1 - view.redSeat]?.name || '—'}${checkNow ? ' · 将军!' : ''}`}
        </Text>
      </div>
    </div>
  );
}
