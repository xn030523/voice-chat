import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idxOf,
  ownCells,
  CAMP_SET,
  STEP_ADJ,
  isRail,
  railStraightDests,
  engineerRailDests,
  validateLayout,
  randomLayout,
  presetLayouts,
  mirrorCell,
} from './junqi-board.js';
import * as junqi from './junqi.js';

const seededRng = (seed = 7) => {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
};

const I = idxOf;

// ---------- 路网 ----------

test('棋盘:每方 25 个可布子格,行营恰 5 个被排除', () => {
  for (const side of [0, 1]) {
    const cells = ownCells(side);
    assert.equal(cells.length, 25);
    assert.ok(cells.every((i) => !CAMP_SET.has(i)));
  }
  assert.equal(CAMP_SET.size, 10);
  assert.equal(mirrorCell(I(0, 1)), I(11, 3));
  assert.equal(mirrorCell(I(5, 0)), I(6, 4));
});

test('山界:行 5↔6 仅 0/2/4 三条通道', () => {
  assert.ok(STEP_ADJ[I(5, 0)].includes(I(6, 0)));
  assert.ok(STEP_ADJ[I(5, 2)].includes(I(6, 2)));
  assert.ok(STEP_ADJ[I(5, 4)].includes(I(6, 4)));
  assert.ok(!STEP_ADJ[I(5, 1)].includes(I(6, 1)));
  assert.ok(!STEP_ADJ[I(5, 3)].includes(I(6, 3)));
});

test('行营对角线连通', () => {
  // 行营 (2,1) ↔ 对角 (1,0),(1,2),(3,0),(3,2)
  for (const [r, c] of [[1, 0], [1, 2], [3, 0], [3, 2]]) {
    assert.ok(STEP_ADJ[I(2, 1)].includes(I(r, c)));
  }
  // 非行营格之间无对角:如 (0,0) 与 (1,1)?(1,1) 非行营,无对角边
  assert.ok(!STEP_ADJ[I(0, 0)].includes(I(1, 1)));
});

test('铁路直线:任意距离、不可转弯、不可穿子、山界缺口阻断', () => {
  const cells = new Array(60).fill(null);
  // 空盘:从 (1,0) 沿列 0 直通 (10,0);沿行 1 直通 (1,4);但不能拐到 (2,1) 等
  const dests = railStraightDests(cells, I(1, 0));
  assert.ok(dests.includes(I(10, 0))); // 纵向全程
  assert.ok(dests.includes(I(1, 4))); // 横向全程
  assert.ok(!dests.includes(I(2, 1))); // 不在直线上
  // (5,1) 是行 5 铁路,但纵向无轨 → 只能横向
  const d51 = railStraightDests(cells, I(5, 1));
  assert.ok(d51.includes(I(5, 0)) && d51.includes(I(5, 4)));
  assert.ok(!d51.includes(I(6, 1))); // 山界无轨
  // 穿子阻断:在 (5,0) 放子,从 (1,0) 南下应停在 (5,0)(可作攻击终点)但不可达 (6,0)
  cells[I(5, 0)] = { owner: 1, rank: 3, frozen: false };
  const d2 = railStraightDests(cells, I(1, 0));
  assert.ok(d2.includes(I(5, 0)));
  assert.ok(!d2.includes(I(6, 0)));
});

test('工兵铁路 BFS:任意转弯绕行,途经须空', () => {
  const cells = new Array(60).fill(null);
  // 堵住列 0 的 (3,0):工兵从 (1,0) 仍可经 行1→列4(或其他轨)绕到 (10,0)
  cells[I(3, 0)] = { owner: 1, rank: 5, frozen: false };
  const dests = engineerRailDests(cells, I(1, 0));
  assert.ok(dests.includes(I(2, 0))); // 直走到阻挡前
  assert.ok(dests.includes(I(3, 0))); // 阻挡格可作攻击终点
  assert.ok(!dests.includes(I(4, 0)) || dests.includes(I(4, 0)));
  // (4,0) 应该经绕行可达:行1 → 列4 → 行5/6/10 → 列0 北上 → (4,0)?列0 从 (10,0) 北上至 (4,0) 沿途须空 → 全空 ✓
  assert.ok(dests.includes(I(4, 0)));
  assert.ok(dests.includes(I(10, 4)));
  // 非工兵同位置:从 (1,0) 直线南下只到 (2,0),不能绕
  const straight = railStraightDests(cells, I(1, 0));
  assert.ok(!straight.includes(I(4, 0)));
});

test('布局校验:五类违规 + 预设/随机全合法', () => {
  const rng = seededRng();
  for (const side of [0, 1]) {
    assert.equal(validateLayout(side, randomLayout(side, rng)), null);
    for (const p of presetLayouts(side)) {
      assert.equal(validateLayout(side, p.layout), null, `${p.name} side${side} 应合法`);
    }
  }
  const base = presetLayouts(0)[0].layout;
  // ① 数量不足
  assert.match(validateLayout(0, base.slice(1)) || '', /25/);
  // ② 军旗不在大本营:与 (0,0) 的地雷换位
  const swapFlag = base.map((x) => (x.rank === 'F' ? { ...x, cell: I(0, 0) } : x.rank === 'L' && x.cell === I(0, 0) ? { ...x, cell: I(0, 1) } : x));
  assert.match(validateLayout(0, swapFlag) || '', /军旗/);
  // ③ 地雷出后两排:把一颗雷挪到行 2 的 (2,0),原 (2,0) 的子挪去雷位
  const mineCell = base.find((x) => x.rank === 'L').cell;
  const at20 = base.find((x) => x.cell === I(2, 0));
  const badMine = base.map((x) =>
    x.rank === 'L' && x.cell === mineCell ? { ...x, cell: I(2, 0) } : x.cell === I(2, 0) ? { ...x, cell: mineCell } : x
  );
  assert.match(validateLayout(0, badMine) || '', /地雷/);
  assert.ok(at20);
  // ④ 炸弹上第一排:与 (5,0) 互换
  const bombCell = base.find((x) => x.rank === 'B').cell;
  const badBomb = base.map((x) =>
    x.rank === 'B' && x.cell === bombCell ? { ...x, cell: I(5, 0) } : x.cell === I(5, 0) ? { ...x, cell: bombCell } : x
  );
  assert.match(validateLayout(0, badBomb) || '', /炸弹/);
  // ⑤ 占用行营
  const badCamp = base.map((x, i) => (i === 0 ? { ...x, cell: I(2, 1) } : x));
  assert.match(validateLayout(0, badCamp) || '', /行营|半区/);
});

// ---------- 引擎 ----------

function freshGame(firstMover = 0) {
  const s = junqi.init(2, {}, () => (firstMover === 0 ? 0.1 : 0.9));
  return s;
}

function deployBoth(s) {
  let r = junqi.apply(s, 0, { type: 'deploy', layout: presetLayouts(0)[0].layout });
  assert.equal(r.error, undefined);
  r = junqi.apply(r.state, 1, { type: 'deploy', layout: presetLayouts(1)[0].layout });
  assert.equal(r.error, undefined);
  return r;
}

/** 自定义对战局面:pieces=[[r,c,owner,rank,frozen?]…] */
function battle(pieces, turn = 0) {
  const cells = new Array(60).fill(null);
  for (const [r, c, owner, rank, frozen] of pieces) cells[I(r, c)] = { owner, rank, frozen: !!frozen };
  return {
    phase: 'playing',
    cells,
    layouts: [null, null],
    ready: [true, true],
    firstMover: 0,
    turn,
    cmdDead: [false, false],
    flagRevealed: [false, false],
    lastMove: null,
    moveCount: 0,
    winner: null,
    endReason: null,
  };
}

test('布阵:双方提交后开战,先手正确;布阵期可覆盖重交', () => {
  const s = freshGame(1);
  let r = junqi.apply(s, 0, { type: 'deploy', layout: presetLayouts(0)[1].layout });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'setup');
  // 覆盖重交
  r = junqi.apply(r.state, 0, { type: 'deploy', layout: presetLayouts(0)[0].layout });
  assert.equal(r.error, undefined);
  r = junqi.apply(r.state, 1, { type: 'deploy', layout: presetLayouts(1)[2].layout });
  assert.equal(r.state.phase, 'playing');
  assert.equal(r.state.turn, 1);
  assert.ok(r.events.some((e) => e.kind === 'battleStart'));
  assert.equal(r.state.cells.filter(Boolean).length, 50);
});

test('裁判:高吃低 / 同衔同尽 / 事件不泄露军衔', () => {
  // 团长(5) 吃 营长(4)
  let s = battle([[5, 0, 0, 5], [6, 0, 1, 4], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3]]);
  let r = junqi.apply(s, 0, { type: 'move', from: I(5, 0), to: I(6, 0) });
  assert.equal(r.error, undefined);
  const battleEvt = r.events.find((e) => e.kind === 'battle');
  assert.equal(battleEvt.result, 'attacker');
  assert.equal(battleEvt.rank, undefined); // 不泄露军衔
  assert.equal(r.state.cells[I(6, 0)].rank, 5);
  // 同衔同尽
  s = battle([[5, 0, 0, 5], [6, 0, 1, 5], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  r = junqi.apply(s, 0, { type: 'move', from: I(5, 0), to: I(6, 0) });
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'both');
  assert.equal(r.state.cells[I(5, 0)], null);
  assert.equal(r.state.cells[I(6, 0)], null);
  // 低打高:攻方亡,守方军衔不变不暴露
  s = battle([[5, 0, 0, 3], [6, 0, 1, 8], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [5, 4, 0, 3]]);
  r = junqi.apply(s, 0, { type: 'move', from: I(5, 0), to: I(6, 0) });
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'defender');
  assert.equal(r.state.cells[I(6, 0)].rank, 8);
});

test('炸弹:与任何子同归(含司令)', () => {
  const s = battle([[5, 0, 0, 'B'], [6, 0, 1, 9], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [5, 4, 0, 3], [6, 4, 1, 3]]);
  const r = junqi.apply(s, 0, { type: 'move', from: I(5, 0), to: I(6, 0) });
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'both');
  // 司令亡 → 亮旗
  assert.equal(r.state.flagRevealed[1], true);
  assert.ok(r.events.some((e) => e.kind === 'flagReveal' && e.owner === 1));
});

test('地雷:普通子撞雷亡且雷保留;工兵挖雷;炸弹排雷同归', () => {
  // 把雷放在 side1 后两排 (10,0)(铁路格,便于直线攻击)
  let s = battle([[6, 0, 0, 5], [10, 0, 1, 'L'], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  let r = junqi.apply(s, 0, { type: 'move', from: I(6, 0), to: I(10, 0) }); // 团长沿列0铁路撞雷
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'defender');
  assert.equal(r.state.cells[I(10, 0)].rank, 'L'); // 雷持久
  assert.equal(r.state.cells[I(6, 0)], null);
  // 工兵挖雷
  s = battle([[6, 0, 0, 1], [10, 0, 1, 'L'], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  r = junqi.apply(s, 0, { type: 'move', from: I(6, 0), to: I(10, 0) });
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'attacker');
  assert.equal(r.state.cells[I(10, 0)].rank, 1);
  // 炸弹排雷
  s = battle([[6, 0, 0, 'B'], [10, 0, 1, 'L'], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  r = junqi.apply(s, 0, { type: 'move', from: I(6, 0), to: I(10, 0) });
  assert.equal(r.events.find((e) => e.kind === 'battle').result, 'both');
  assert.equal(r.state.cells[I(10, 0)], null);
});

test('夺旗胜 + 行营免攻 + 大本营冻结', () => {
  // 夺旗:工兵直达 (11,1) 军旗?(11,1) 是大本营非铁路 → 用相邻步:(10,1) 排长 → (11,1)
  let s = battle([[10, 1, 0, 2], [11, 1, 1, 'F'], [0, 1, 0, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  let r = junqi.apply(s, 0, { type: 'move', from: I(10, 1), to: I(11, 1) });
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.endReason, 'flag');
  // 行营免攻:敌子在 (9,1) 行营,不可吃
  s = battle([[8, 1, 0, 9], [9, 1, 1, 2], [0, 1, 0, 'F'], [11, 1, 1, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]]);
  r = junqi.apply(s, 0, { type: 'move', from: I(8, 1), to: I(9, 1) });
  assert.match(r.error, /行营/);
  // 大本营冻结:进营后不能再动
  s = battle([[10, 1, 0, 2, false], [11, 3, 1, 'F'], [0, 1, 0, 'F'], [6, 4, 1, 3], [5, 4, 0, 3]], 0);
  r = junqi.apply(s, 0, { type: 'move', from: I(10, 1), to: I(11, 1) }); // 进空大本营
  assert.equal(r.error, undefined);
  assert.equal(r.state.cells[I(11, 1)].frozen, true);
  // 轮转后试图再动 → 拒
  const s2 = { ...r.state, turn: 0 };
  const r2 = junqi.apply(s2, 0, { type: 'move', from: I(11, 1), to: I(10, 1) });
  assert.match(r2.error, /大本营/);
});

test('无棋可走判负', () => {
  // side1 只剩雷和旗(不可动)→ side0 走一步后 side1 无步 → side0 胜
  const s = battle([[5, 0, 0, 5], [10, 0, 1, 'L'], [11, 1, 1, 'F'], [0, 1, 0, 'F']], 0);
  const r = junqi.apply(s, 0, { type: 'move', from: I(5, 0), to: I(5, 1) });
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.endReason, 'noMoves');
});

test('view 三视角投影(隐藏信息红线)+ 亮旗可见性', () => {
  const { state } = deployBoth(freshGame());
  // seat0:己衔可见,敌衔全 null
  const v0 = junqi.view(state, 0);
  const ownVisible = v0.cells.filter((p) => p && p.owner === 0).every((p) => p.rank !== null);
  const enemyHidden = v0.cells.filter((p) => p && p.owner === 1).every((p) => p.rank === null);
  assert.ok(ownVisible && enemyHidden);
  // 观战:全暗
  const vs = junqi.view(state, null);
  assert.ok(vs.cells.filter(Boolean).every((p) => p.rank === null));
  // 亮旗后:敌旗对双方与观战可见
  const revealed = { ...state, flagRevealed: [false, true] };
  const v0r = junqi.view(revealed, 0);
  const flagCell = v0r.cells.findIndex((p) => p && p.owner === 1 && p.rank === 'F');
  assert.ok(flagCell >= 0);
  const vsr = junqi.view(revealed, null);
  assert.equal(vsr.cells[flagCell].rank, 'F');
  // 布阵期:盘面空,己方暂存布局可见
  const setup = junqi.apply(freshGame(), 0, { type: 'deploy', layout: presetLayouts(0)[0].layout }).state;
  const vSetup0 = junqi.view(setup, 0);
  assert.equal(vSetup0.myLayout.length, 25);
  assert.ok(vSetup0.cells.every((c) => c === null));
  assert.equal(junqi.view(setup, 1).myLayout, null);
});

test('legalMoves 仅依赖投影可用(工兵铁路绕行含攻击终点)', () => {
  // 仅工兵+阻挡子+双旗:列 0 被 (3,0) 堵,但列 4 畅通可绕到 (10,4)
  const s = battle([[1, 0, 0, 1], [3, 0, 1, 5], [0, 1, 0, 'F'], [11, 1, 1, 'F']], 0);
  const v = junqi.view(s, 0); // 敌衔已抹除
  const moves = junqi.legalMoves(v, 0, { from: I(1, 0) });
  assert.ok(moves.includes(I(3, 0))); // 攻击被堵格
  assert.ok(moves.includes(I(10, 4))); // BFS 绕行远端
});
