// 军棋(陆战棋)棋盘路网:5 列 × 12 行 = 60 格,idx = r*5+c
// side0 半区 = 行 0..5(行 0 为其底排/大本营行),side1 = 行 6..11(镜像)
// 山界:行 5 与行 6 之间仅 3 条通道(列 0/2/4),均为铁路边
// 行营:免攻击,带对角线连通;大本营:进入即冻结
// 纯函数同构,零依赖(前端布阵预校验/走法高亮同样 import 本文件)

export const COLS = 5;
export const ROWS = 12;
export const CELLS = 60;

export const idxOf = (r, c) => r * COLS + c;
export const rcOf = (i) => [Math.floor(i / COLS), i % COLS];
export const sideOfRow = (r) => (r <= 5 ? 0 : 1);

// 大本营(每方 2)
export const HQS = [
  [idxOf(0, 1), idxOf(0, 3)],
  [idxOf(11, 1), idxOf(11, 3)],
];
export const HQ_SET = new Set(HQS.flat());

// 行营(每方 5)
const CAMP_RC = [
  [2, 1], [2, 3], [3, 2], [4, 1], [4, 3], // side0
  [9, 1], [9, 3], [8, 2], [7, 1], [7, 3], // side1
];
export const CAMP_SET = new Set(CAMP_RC.map(([r, c]) => idxOf(r, c)));

// ---------- 铁路 ----------
// 横向铁路行:1/5/6/10;纵向铁路:列 0 与列 4 的行 1..10 段;列 2 仅 (5,2)-(6,2)
const RAIL_CELL_SET = new Set();
for (const r of [1, 5, 6, 10]) for (let c = 0; c < COLS; c++) RAIL_CELL_SET.add(idxOf(r, c));
for (const c of [0, 4]) for (let r = 1; r <= 10; r++) RAIL_CELL_SET.add(idxOf(r, c));
// (5,2),(6,2) 已含于行 5/6
export const isRail = (i) => RAIL_CELL_SET.has(i);

// 铁路边(无向邻接)
function buildRailAdj() {
  const adj = Array.from({ length: CELLS }, () => []);
  const link = (a, b) => {
    adj[a].push(b);
    adj[b].push(a);
  };
  for (const r of [1, 5, 6, 10]) {
    for (let c = 0; c + 1 < COLS; c++) link(idxOf(r, c), idxOf(r, c + 1));
  }
  for (const c of [0, 4]) {
    for (let r = 1; r + 1 <= 10; r++) link(idxOf(r, c), idxOf(r + 1, c));
  }
  link(idxOf(5, 2), idxOf(6, 2)); // 中央山口
  return adj;
}
export const RAIL_ADJ = buildRailAdj();
const railEdgeSet = new Set();
RAIL_ADJ.forEach((ns, a) => ns.forEach((b) => railEdgeSet.add(a * 100 + b)));
export const isRailEdge = (a, b) => railEdgeSet.has(a * 100 + b);

// ---------- 单步邻接(公路 + 铁路相邻一步 + 行营对角) ----------
function buildStepAdj() {
  const adj = Array.from({ length: CELLS }, () => new Set());
  const link = (a, b) => {
    adj[a].add(b);
    adj[b].add(a);
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idxOf(r, c);
      // 横向:同行相邻恒连
      if (c + 1 < COLS) link(i, idxOf(r, c + 1));
      // 纵向:同半区内相邻行恒连;跨山界(5↔6)仅列 0/2/4
      if (r + 1 < ROWS) {
        if (r === 5) {
          if (c === 0 || c === 2 || c === 4) link(i, idxOf(6, c));
        } else {
          link(i, idxOf(r + 1, c));
        }
      }
    }
  }
  // 行营对角线
  for (const [r, c] of CAMP_RC) {
    const i = idxOf(r, c);
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) link(i, idxOf(rr, cc));
    }
  }
  return adj.map((s) => [...s]);
}
export const STEP_ADJ = buildStepAdj();

// ---------- 铁路行棋 ----------
/**
 * 非工兵:沿铁路直线任意距离(方向锁定,不转弯),途经格必须为空。
 * cells[i] = null | piece。返回可达 idx 列表(终点为空格或任意占用格——占用合法性由引擎判)。
 */
export function railStraightDests(cells, from) {
  if (!isRail(from)) return [];
  const [fr, fc] = rcOf(from);
  const out = [];
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    let r = fr;
    let c = fc;
    let cur = from;
    for (;;) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
      const ni = idxOf(nr, nc);
      if (!isRailEdge(cur, ni)) break; // 断轨(含山界缺口)
      out.push(ni);
      if (cells[ni]) break; // 撞子:该格可作攻击终点,但不能穿过
      r = nr;
      c = nc;
      cur = ni;
    }
  }
  return out;
}

/** 工兵:铁路图 BFS,任意转弯,途经格必须为空;占用格仅可作终点 */
export function engineerRailDests(cells, from) {
  if (!isRail(from)) return [];
  const seen = new Set([from]);
  const out = [];
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const ni of RAIL_ADJ[cur]) {
      if (seen.has(ni)) continue;
      seen.add(ni);
      out.push(ni);
      if (!cells[ni]) queue.push(ni); // 空格才能继续延伸
    }
  }
  return out;
}

// ---------- 棋子定义 ----------
// rank:1 工兵 2 排长 3 连长 4 营长 5 团长 6 旅长 7 师长 8 军长 9 司令;'B' 炸弹 'L' 地雷 'F' 军旗
export const PIECE_SET = [
  { rank: 9, name: '司令', count: 1 },
  { rank: 8, name: '军长', count: 1 },
  { rank: 7, name: '师长', count: 2 },
  { rank: 6, name: '旅长', count: 2 },
  { rank: 5, name: '团长', count: 2 },
  { rank: 4, name: '营长', count: 2 },
  { rank: 3, name: '连长', count: 3 },
  { rank: 2, name: '排长', count: 3 },
  { rank: 1, name: '工兵', count: 3 },
  { rank: 'L', name: '地雷', count: 3 },
  { rank: 'B', name: '炸弹', count: 2 },
  { rank: 'F', name: '军旗', count: 1 },
];
export const RANK_NAMES = Object.fromEntries(PIECE_SET.map((p) => [p.rank, p.name]));

/** side 的 25 个可布子格(本方半区非行营),行主序 */
export function ownCells(side) {
  const out = [];
  const rows = side === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
  for (const r of rows) {
    for (let c = 0; c < COLS; c++) {
      const i = idxOf(r, c);
      if (!CAMP_SET.has(i)) out.push(i);
    }
  }
  return out;
}

/** 镜像:side0 格 → side1 对应格 */
export function mirrorCell(i) {
  const [r, c] = rcOf(i);
  return idxOf(ROWS - 1 - r, COLS - 1 - c);
}

const backRows = (side) => (side === 0 ? [0, 1] : [10, 11]);
const frontRow = (side) => (side === 0 ? 5 : 6);

/**
 * 布局校验:layout = [{cell, rank}×25]
 * 返回 null(合法)或中文原因。同构导出 —— 客户端提交前预校验同一函数。
 */
export function validateLayout(side, layout) {
  if (!Array.isArray(layout) || layout.length !== 25) return '必须布置全部 25 枚棋子';
  const own = new Set(ownCells(side));
  const seen = new Set();
  const counts = new Map();
  for (const item of layout) {
    if (!item || typeof item.cell !== 'number') return '布局格式错误';
    const { cell, rank } = item;
    if (!own.has(cell)) return '棋子必须放在己方半区的非行营格';
    if (seen.has(cell)) return '同一格不能放两枚棋子';
    seen.add(cell);
    counts.set(rank, (counts.get(rank) || 0) + 1);
    const [r] = rcOf(cell);
    if (rank === 'F' && !HQS[side].includes(cell)) return '军旗必须放在大本营';
    if (rank === 'L' && !backRows(side).includes(r)) return '地雷只能放在后两排';
    if (rank === 'B' && r === frontRow(side)) return '炸弹不能放在第一排';
  }
  for (const p of PIECE_SET) {
    if ((counts.get(p.rank) || 0) !== p.count) return `${p.name}数量应为 ${p.count}`;
  }
  return null;
}

/** 生成满足约束的随机布局(rng ∈ [0,1) 函数) */
export function randomLayout(side, rng) {
  const cells = ownCells(side);
  const back = new Set(cells.filter((i) => backRows(side).includes(rcOf(i)[0])));
  const front = new Set(cells.filter((i) => rcOf(i)[0] === frontRow(side)));
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const layout = [];
  const used = new Set();
  // 军旗 → 随机大本营
  const flagCell = HQS[side][rng() < 0.5 ? 0 : 1];
  layout.push({ cell: flagCell, rank: 'F' });
  used.add(flagCell);
  // 地雷 → 后两排随机
  const backFree = shuffle([...back].filter((i) => !used.has(i)));
  for (let k = 0; k < 3; k++) {
    layout.push({ cell: backFree[k], rank: 'L' });
    used.add(backFree[k]);
  }
  // 炸弹 → 非第一排随机
  const bombFree = shuffle(cells.filter((i) => !used.has(i) && !front.has(i)));
  for (let k = 0; k < 2; k++) {
    layout.push({ cell: bombFree[k], rank: 'B' });
    used.add(bombFree[k]);
  }
  // 其余棋子随机填满
  const ranks = [];
  for (const p of PIECE_SET) {
    if (p.rank === 'F' || p.rank === 'L' || p.rank === 'B') continue;
    for (let k = 0; k < p.count; k++) ranks.push(p.rank);
  }
  shuffle(ranks);
  const rest = shuffle(cells.filter((i) => !used.has(i)));
  ranks.forEach((rank, k) => layout.push({ cell: rest[k], rank }));
  return layout;
}

// 预设布局(side0 视角;side1 用 mirrorCell 镜像)。键为 idx,值为 rank。
const PRESET_DEFS = [
  {
    id: 'defense',
    name: '稳守反击',
    map: {
      0: 'L', 1: 'F', 2: 'L', 3: 8, 4: 7,
      5: 9, 6: 'L', 7: 6, 8: 7, 9: 6,
      10: 5, 12: 'B', 14: 5,
      15: 4, 16: 'B', 18: 4, 19: 3,
      20: 3, 22: 2, 24: 3,
      25: 1, 26: 2, 27: 1, 28: 2, 29: 1,
    },
  },
  {
    id: 'raid',
    name: '工兵游击',
    map: {
      0: 'L', 1: 'F', 2: 'L', 3: 7, 4: 8,
      5: 'L', 6: 9, 7: 7, 8: 6, 9: 5,
      10: 1, 12: 6, 14: 1,
      15: 'B', 16: 4, 18: 5, 19: 'B',
      20: 1, 22: 4, 24: 2,
      25: 3, 26: 2, 27: 3, 28: 2, 29: 3,
    },
  },
  {
    id: 'press',
    name: '炸弹前压',
    map: {
      0: 7, 1: 'F', 2: 'L', 3: 'L', 4: 9,
      5: 8, 6: 'L', 7: 5, 8: 6, 9: 7,
      10: 6, 12: 5, 14: 4,
      15: 4, 16: 3, 18: 2, 19: 3,
      20: 'B', 22: 'B', 24: 2,
      25: 1, 26: 2, 27: 1, 28: 3, 29: 1,
    },
  },
];

export function presetLayouts(side) {
  return PRESET_DEFS.map((p) => ({
    id: p.id,
    name: p.name,
    layout: Object.entries(p.map).map(([cell, rank]) => ({
      cell: side === 0 ? Number(cell) : mirrorCell(Number(cell)),
      rank,
    })),
  }));
}
