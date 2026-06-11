'use client';

// 军棋盘:5×12 SVG(公路细线/铁路粗线/行营圆圈/大本营/山界),
// 布阵模式(点选互换 + 预设 + 随机 + 提交)与对战模式(点选高亮 + 暗子),
// 己方永远在下方(seat1 视角自动翻转)。规则同构复用引擎模块。
import { useEffect, useMemo, useState } from 'react';
import { Button, Text } from '@mantine/core';
import { Shuffle, Check, Swords } from 'lucide-react';
import {
  COLS,
  ROWS,
  idxOf,
  rcOf,
  CAMP_SET,
  HQ_SET,
  STEP_ADJ,
  RAIL_ADJ,
  RANK_NAMES,
  validateLayout,
  randomLayout,
  presetLayouts,
} from '@/games-server/engines/junqi-board.js';
import { legalMoves } from '@/games-server/engines/junqi.js';

const CELL = 64;
const PADX = 36;
const PADY = 34;
const W = PADX * 2 + CELL * (COLS - 1);
const H = PADY * 2 + CELL * (ROWS - 1);

const OWNER_COLORS = ['#d35446', '#3f7cd6']; // side0 红 / side1 蓝

export default function JunqiBoard({ table, onMove }) {
  const view = table.view;
  const mySeat = table.you.seat;
  const playing = view?.phase === 'playing';
  const setup = view?.phase === 'setup';
  const myTurn = playing && mySeat !== null && view.turn === mySeat;
  // 翻转:seat0 的家(行 0-5)在下 → 垂直翻转;seat1/观战:seat1 家在上→seat1 翻转为不翻
  const flipV = mySeat !== 1; // seat0 与观战:行 0 显示在底部

  const [layout, setLayout] = useState(null); // 布阵暂存 [{cell,rank}×25]
  const [layoutErr, setLayoutErr] = useState('');
  const [selA, setSelA] = useState(null); // 布阵互换第一选格
  const [selected, setSelected] = useState(null); // 对战选中己子

  // 进入布阵阶段时初始化本地布局
  useEffect(() => {
    if (setup && mySeat !== null && !layout) {
      setLayout(view.myLayout || randomLayout(mySeat, Math.random));
    }
    if (!setup) {
      setLayout(null);
      setSelA(null);
      setLayoutErr('');
    }
  }, [setup, mySeat, view?.myLayout, layout]);

  const layoutByCell = useMemo(() => {
    const m = new Map();
    if (layout) for (const it of layout) m.set(it.cell, it.rank);
    return m;
  }, [layout]);

  const hints = useMemo(() => {
    if (!playing || selected === null || !myTurn) return new Set();
    return new Set(legalMoves(view, mySeat, { from: selected }));
  }, [playing, selected, myTurn, view, mySeat]);

  if (!view) return null;

  const dispR = (r) => (flipV ? ROWS - 1 - r : r);
  const px = (c) => PADX + c * CELL;
  const py = (r) => PADY + dispR(r) * CELL;

  const toCell = (evt) => {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const sx = ((evt.clientX - rect.left) / rect.width) * W;
    const sy = ((evt.clientY - rect.top) / rect.height) * H;
    const c = Math.round((sx - PADX) / CELL);
    const dr = Math.round((sy - PADY) / CELL);
    if (c < 0 || c >= COLS || dr < 0 || dr >= ROWS) return null;
    if (Math.abs(sx - px(c)) > CELL * 0.46 || Math.abs(sy - (PADY + dr * CELL)) > CELL * 0.46) return null;
    const r = flipV ? ROWS - 1 - dr : dr;
    return idxOf(r, c);
  };

  const handleClick = (evt) => {
    const cell = toCell(evt);
    if (cell === null) return;
    if (setup && mySeat !== null && layout) {
      // 布阵互换(仅己方 25 格)
      if (!layoutByCell.has(cell)) return;
      if (selA === null) {
        setSelA(cell);
        return;
      }
      if (selA === cell) {
        setSelA(null);
        return;
      }
      setLayout((prev) =>
        prev.map((it) => (it.cell === selA ? { ...it, cell } : it.cell === cell ? { ...it, cell: selA } : it))
      );
      setSelA(null);
      setLayoutErr('');
      return;
    }
    if (!myTurn) return;
    const p = view.cells[cell];
    if (selected !== null && hints.has(cell)) {
      onMove({ type: 'move', from: selected, to: cell });
      setSelected(null);
      return;
    }
    if (p && p.owner === mySeat) {
      setSelected(cell === selected ? null : cell);
      return;
    }
    setSelected(null);
  };

  const submitLayout = () => {
    const reason = validateLayout(mySeat, layout);
    if (reason) {
      setLayoutErr(reason);
      return;
    }
    setLayoutErr('');
    onMove({ type: 'deploy', layout });
  };

  // ---------- 绘制 ----------
  // 边(公路细 / 铁路粗),去重 a<b
  const roadLines = [];
  const railLines = [];
  const railEdgePairs = new Set();
  RAIL_ADJ.forEach((ns, a) => ns.forEach((b) => a < b && railEdgePairs.add(`${a}-${b}`)));
  const seen = new Set();
  STEP_ADJ.forEach((ns, a) => {
    const [ar, ac] = rcOf(a);
    ns.forEach((b) => {
      if (a >= b) return;
      const k = `${a}-${b}`;
      if (seen.has(k)) return;
      seen.add(k);
      const [br, bc] = rcOf(b);
      const line = { x1: px(ac), y1: py(ar), x2: px(bc), y2: py(br) };
      if (railEdgePairs.has(k)) railLines.push(line);
      else roadLines.push(line);
    });
  });

  const cellsDeco = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const [r, c] = rcOf(i);
    const x = px(c);
    const y = py(r);
    if (CAMP_SET.has(i)) {
      cellsDeco.push(<circle key={`camp${i}`} cx={x} cy={y} r={24} fill="rgba(120,180,120,0.18)" stroke="#7aa06a" strokeWidth={1.6} />);
    } else if (HQ_SET.has(i)) {
      cellsDeco.push(
        <g key={`hq${i}`}>
          <rect x={x - 26} y={y - 19} width={52} height={38} rx={9} fill="rgba(212,175,55,0.14)" stroke="#c8a951" strokeWidth={1.6} />
          {!(view.cells[i] || (setup && layoutByCell.has(i))) && (
            <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#c8a951">
              大本营
            </text>
          )}
        </g>
      );
    }
  }
  // 山界(行 5/6 之间,列 1/3)
  const mountains = [1, 3].map((c) => {
    const yMid = (py(5) + py(6)) / 2;
    return (
      <text key={`m${c}`} x={px(c)} y={yMid + 5} textAnchor="middle" fontSize={16} fill="#8a6a3e" fontWeight={700}>
        ⛰
      </text>
    );
  });

  // 棋子
  const pieceNodes = [];
  const renderPiece = (i, owner, rank, opts = {}) => {
    const [r, c] = rcOf(i);
    const x = px(c);
    const y = py(r);
    const color = OWNER_COLORS[owner];
    const known = rank !== null && rank !== undefined;
    const isSel = opts.sel;
    pieceNodes.push(
      <g key={`p${i}`}>
        <rect
          x={x - 27}
          y={y - 17}
          width={54}
          height={34}
          rx={7}
          fill={known ? '#f4ead6' : color}
          stroke={isSel ? '#fbbf24' : known ? color : 'rgba(255,255,255,0.45)'}
          strokeWidth={isSel ? 3 : 1.8}
        />
        {known ? (
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill={color}>
            {RANK_NAMES[rank]}
          </text>
        ) : (
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fontSize={13} fill="rgba(255,255,255,0.8)">
            军
          </text>
        )}
        {opts.frozen && <circle cx={x + 20} cy={y - 11} r={4} fill="#94a3b8" />}
      </g>
    );
  };

  if (setup && layout) {
    for (const { cell, rank } of layout) renderPiece(cell, mySeat ?? 0, rank, { sel: selA === cell });
  } else if (!setup) {
    view.cells.forEach((p, i) => {
      if (p) renderPiece(i, p.owner, p.rank, { sel: selected === i, frozen: p.frozen });
    });
  }

  // 高亮
  const overlays = [];
  if (playing && view.lastMove) {
    for (const i of [view.lastMove.from, view.lastMove.to]) {
      const [r, c] = rcOf(i);
      overlays.push(<rect key={`lm${i}`} x={px(c) - 29} y={py(r) - 19} width={58} height={38} rx={8} fill="none" stroke="#fbbf24" strokeWidth={1.6} opacity={0.75} />);
    }
  }
  hints.forEach((i) => {
    const [r, c] = rcOf(i);
    overlays.push(
      view.cells[i] ? (
        <rect key={`h${i}`} x={px(c) - 30} y={py(r) - 20} width={60} height={40} rx={9} fill="none" stroke="#34d399" strokeWidth={2.4} strokeDasharray="6 4" />
      ) : (
        <circle key={`h${i}`} cx={px(c)} cy={py(r)} r={8} fill="#34d399" opacity={0.85} />
      )
    );
  });

  // 文案
  const lastBattleText = (() => {
    if (!playing || !view.lastMove) return '';
    const m = { move: '', attacker: '上一手:进攻得手', defender: '上一手:进攻方阵亡', both: '上一手:同归于尽' };
    return m[view.lastMove.result] || '';
  })();

  const presets = mySeat !== null ? presetLayouts(mySeat) : [];

  return (
    <div className="gomoku-board junqi-wrap">
      {setup && mySeat !== null && (
        <div className="junqi-deploy-bar">
          {presets.map((p) => (
            <Button key={p.id} size="xs" variant="light" onClick={() => { setLayout(p.layout); setSelA(null); setLayoutErr(''); }}>
              {p.name}
            </Button>
          ))}
          <Button size="xs" variant="light" leftSection={<Shuffle size={13} />} onClick={() => { setLayout(randomLayout(mySeat, Math.random)); setSelA(null); setLayoutErr(''); }}>
            随机布局
          </Button>
          <Button size="xs" color={view.ready[mySeat] ? 'teal' : 'indigo'} leftSection={<Check size={13} />} onClick={submitLayout}>
            {view.ready[mySeat] ? '重新提交' : '提交布阵'}
          </Button>
        </div>
      )}
      <svg className="board-svg junqi-svg" viewBox={`0 0 ${W} ${H}`} onClick={handleClick} style={{ cursor: setup || myTurn ? 'pointer' : 'default', aspectRatio: `${W} / ${H}` }}>
        <rect x={0} y={0} width={W} height={H} rx={10} fill="#caa472" />
        <rect x={8} y={8} width={W - 16} height={H - 16} rx={8} fill="#d3b07f" />
        <g stroke="#7a5b34" strokeWidth={1.1}>{roadLines.map((l, i) => <line key={`r${i}`} {...l} />)}</g>
        <g stroke="#564027" strokeWidth={3.4}>{railLines.map((l, i) => <line key={`t${i}`} {...l} />)}</g>
        <g stroke="#d3b07f" strokeWidth={1.2}>{railLines.map((l, i) => <line key={`t2${i}`} {...l} strokeDasharray="7 7" />)}</g>
        {cellsDeco}
        {mountains}
        {overlays}
        {pieceNodes}
      </svg>
      <div className="board-legend">
        {setup ? (
          <Text size="xs" c={layoutErr ? 'red.4' : 'dimmed'}>
            {mySeat === null
              ? '双方布阵中…'
              : layoutErr ||
                (view.ready[mySeat]
                  ? `已提交,等待对方布阵…(仍可调整后重新提交)`
                  : '布阵阶段:点击两格互换棋子,完成后提交')}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            {mySeat !== null
              ? `你执${mySeat === 0 ? '红' : '蓝'}${playing ? (myTurn ? ' · 轮到你了' : ` · 等待 ${table.seats[view.turn]?.name || '对方'} 行动…`) : ''}`
              : `红方:${table.seats[0]?.name || '—'} · 蓝方:${table.seats[1]?.name || '—'}(观战全暗)`}
            {lastBattleText && ` · ${lastBattleText}`}
            {playing && view.flagRevealed.some(Boolean) && ' · 有一方军旗已亮明'}
          </Text>
        )}
      </div>
      {setup && mySeat !== null && (
        <div className="board-legend">
          <Text size="xs" c="dimmed">
            <Swords size={11} style={{ verticalAlign: -1 }} /> 军旗限大本营 · 地雷限后两排 · 炸弹不可在第一排
          </Text>
        </div>
      )}
    </div>
  );
}
