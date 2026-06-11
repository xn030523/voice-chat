// 飞行棋几何与规则常量:52 格主环 + 每色 5 格终点跑道 + 中心终点
// 进度模型:p ∈ [0,49] 在环上(环格 = (ENTRY(seat)+p)%52),p ∈ [50,54] 跑道,p=55 到达
// 颜色:环格 k 的颜色 = k%4;ENTRY(i)=13i → 13i%4=i,起飞格恒己色
// 纯函数同构,零依赖

export const RING = 52;
export const HOME_LEN = 5; // 跑道 5 格
export const DONE_P = 55;
export const TRACK_MAX_P = 49;
export const JUMP_STEP = 4;
export const FLY_FROM_P = 16; // 飞行线起点(progress,己色格)
export const FLY_TO_P = 28; // 飞行线终点(+12)

export const COLOR_NAMES = ['红', '黄', '蓝', '绿'];
export const COLOR_HEX = ['#e05548', '#e6b832', '#3f7cd6', '#3da95c'];

export const entryOf = (seat) => 13 * seat;
export const ringCellOf = (seat, p) => (entryOf(seat) + p) % RING;
export const colorOfRingCell = (k) => k % 4;

/** 掷骰后某架飞机的落点进度(含终点回弹),不含跳/飞 */
export function bouncedP(p, dice) {
  let np = p + dice;
  if (np > DONE_P) np = 2 * DONE_P - np; // 110 - np 回弹
  return np;
}

// ---------- UI 几何(15×15 网格) ----------
// 主环 52 格的 (col,row);idx 与进度对齐:seat0 入口 = idx 0
function buildRingXY() {
  const L = [];
  for (let c = 0; c <= 5; c++) L.push([c, 6]); // 0-5 左臂上沿 →
  for (let r = 5; r >= 0; r--) L.push([6, r]); // 6-11 上臂左列 ↑
  L.push([7, 0]); // 12 顶中
  for (let r = 0; r <= 5; r++) L.push([8, r]); // 13-18 上臂右列 ↓
  for (let c = 9; c <= 14; c++) L.push([c, 6]); // 19-24 右臂上沿 →
  L.push([14, 7]); // 25 右中
  for (let c = 14; c >= 9; c--) L.push([c, 8]); // 26-31 右臂下沿 ←
  for (let r = 9; r <= 14; r++) L.push([8, r]); // 32-37 下臂右列 ↓
  L.push([7, 14]); // 38 底中
  for (let r = 14; r >= 9; r--) L.push([6, r]); // 39-44 下臂左列 ↑
  for (let c = 5; c >= 0; c--) L.push([c, 8]); // 45-50 左臂下沿 ←
  L.push([0, 7]); // 51 左中
  return L;
}
export const RING_XY = buildRingXY();

// 每色跑道 5 格(进度 50→54,向中心推进),中心 (7,7) = 到达
export const HOME_XY = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
export const CENTER_XY = [7, 7];

// 机库 4 槽位(按象限)
export const HANGAR_XY = [
  [[1, 1], [4, 1], [1, 4], [4, 4]],
  [[10, 1], [13, 1], [10, 4], [13, 4]],
  [[10, 10], [13, 10], [10, 13], [13, 13]],
  [[1, 10], [4, 10], [1, 13], [4, 13]],
];

/** 飞机的显示坐标 */
export function planeXY(seat, plane) {
  if (plane.zone === 'hangar') return HANGAR_XY[seat][plane.slot ?? 0];
  if (plane.zone === 'done') return CENTER_XY;
  if (plane.p <= TRACK_MAX_P) return RING_XY[ringCellOf(seat, plane.p)];
  return HOME_XY[seat][plane.p - 50];
}
