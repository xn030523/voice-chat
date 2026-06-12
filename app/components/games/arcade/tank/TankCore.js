'use client';

// 坦克大作战 —— 致敬经典玩法的自绘像素版(零图片资产,Canvas 程序绘制)
// 单人 / 同屏双人(P1: WASD+J  P2: 方向键+回车/0)
// 纯本机游戏:不经 games-server,崩了也只影响本面板,语音聊天照常。
import { playSfx } from '@/lib/audio';

const GRID = 26; // 26×26 半格制
export const CELL = 16;
export const FIELD = GRID * CELL; // 416
const TANK_SIZE = 28; // 占约 2×2 格
const BULLET_SIZE = 6;

// 格子类型
const EMPTY = 0, BRICK = 1, STEEL = 2, RIVER = 3, TREE = 4, BASE = 5;

// 方向
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// ---------- 关卡(26×26 字符画:.空 B砖 S钢 R河 T树) ----------
// 基地与护墙、出生点由代码统一放置(底部中央)
const L1 = [
  '..........................',
  '..........................',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..BBSSBB..BB..BB..',
  '..BB..BB..BBSSBB..BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..........BB..BB..',
  '..BB..BB..........BB..BB..',
  '..........BB..BB..........',
  '..........BB..BB..........',
  'BB..BBBB..BB..BB..BBBB..BB',
  'SS..BBBB..........BBBB..SS',
  '..........BB..BB..........',
  '..........BBBBBB..........',
  '..BB..BB..BBBBBB..BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '..BB..BB..........BB..BB..',
  '..BB..BB..........BB..BB..',
  '..BB..BB..TTTTTT..BB..BB..',
  '..........TTTTTT..........',
  '..........................',
  '..........................',
  '..........................',
];
const L2 = [
  '..........................',
  '..TT..........SS......TT..',
  '..TTBB..BB........BB..TT..',
  '....BB..BB..SS....BB......',
  '....BB......SS....BB......',
  'RRRRRRRR..........RRRRRRRR',
  'RRRRRRRR..........RRRRRRRR',
  '......BB..BBBBBB..BB......',
  '......BB..B....B..BB......',
  '..SS......B.SS.B......SS..',
  '..SS......B.SS.B......SS..',
  '......BB..B....B..BB......',
  '......BB..BBBBBB..BB......',
  '..BB......................',
  '..BB..SS..........SS..BB..',
  '......SS..........SS..BB..',
  '..........BBBBBB..........',
  '..TTTT....BB..BB....TTTT..',
  '..TTTT....BB..BB....TTTT..',
  '..........BB..BB..........',
  '..BB..BB..........BB..BB..',
  '..BB..BB..BB..BB..BB..BB..',
  '......BB..BB..BB..BB......',
  '..........................',
  '..........................',
  '..........................',
];
const L3 = [
  '..........................',
  '..SS..BB......BB......SS..',
  '......BB..TT..BB..........',
  '..BB......TT......BB..BB..',
  '..BB..SSSSTTTTSSSS..BB....',
  '..........TTTT............',
  '..BBBB....TTTT....BBBB....',
  '..B..B....RRRR....B..B....',
  '..B..B..RRRRRRRR..B..B....',
  '..BBBB..RRRRRRRR..BBBB....',
  '........RR....RR..........',
  '..TTTT..RR....RR..TTTT....',
  '..TTTT........... TTTT....'.replace(' ', '.'),
  '..TTTT....SSSS....TTTT....',
  '..........S..S............',
  '..BB..BB..S..S..BB..BB....',
  '..BB..BB..SSSS..BB..BB....',
  '......BB........BB........',
  '..BB......BBBB......BB....',
  '..BB..BB..BBBB..BB..BB....',
  '......BB........BB........',
  '..TT......BBBB......TT....',
  '..TT..BB..BBBB..BB..TT....',
  '......BB........BB........',
  '..........................',
  '..........................',
];
const LEVELS = [L1, L2, L3];

const CHAR_CELL = { '.': EMPTY, B: BRICK, S: STEEL, R: RIVER, T: TREE };

// 敌人类型
const ENEMY_TYPES = [
  { id: 'basic', color: '#b9b9c9', speed: 44, hp: 1, fire: 1600, score: 100 },
  { id: 'fast', color: '#7ec8e3', speed: 78, hp: 1, fire: 1400, score: 200 },
  { id: 'heavy', color: '#caa05a', speed: 36, hp: 3, fire: 1200, score: 400 },
];

const P_COLORS = ['#e8c84a', '#52c46a']; // P1 金 P2 绿

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class TankCore {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{players:1|2, onEvent:(e)=>void}} opts  onEvent: {kind:'win'|'lose'|'level'|'hud', ...}
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = opts.players || 1;
    this.onEvent = opts.onEvent || (() => {});
    this.keys = new Set();
    this.running = false;
    this.paused = false;
    this.levelIndex = 0;
    this.lives = [3, this.players === 2 ? 3 : 0];
    this.score = 0;
    this.raf = null;
    this.last = 0;
    this.acc = 0;
    this._keydown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._keyup = (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  start() {
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    this.loadLevel(0);
    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      if (!this.paused) this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
  }

  setPaused(p) {
    this.paused = p;
  }

  // ---------- 关卡 ----------
  loadLevel(idx) {
    this.levelIndex = idx;
    const src = LEVELS[idx % LEVELS.length];
    this.grid = [];
    for (let r = 0; r < GRID; r++) {
      const row = [];
      for (let c = 0; c < GRID; c++) row.push(CHAR_CELL[src[r]?.[c] || '.'] ?? EMPTY);
      this.grid.push(row);
    }
    // 基地(底部中央 2×2)+ 护墙
    this.baseCells = [];
    const bc = GRID / 2 - 1; // 12
    const br = GRID - 2; // 24
    for (const [r, c] of [[br, bc], [br, bc + 1], [br + 1, bc], [br + 1, bc + 1]]) {
      this.grid[r][c] = BASE;
      this.baseCells.push([r, c]);
    }
    for (const [r, c] of [
      [br - 1, bc - 1], [br - 1, bc], [br - 1, bc + 1], [br - 1, bc + 2],
      [br, bc - 1], [br, bc + 2], [br + 1, bc - 1], [br + 1, bc + 2],
    ]) {
      if (this.grid[r]?.[c] !== undefined) this.grid[r][c] = BRICK;
    }
    this.baseAlive = true;
    this.tanks = [];
    this.bullets = [];
    this.explosions = [];
    this.powerup = null;
    this.enemiesLeft = 20;
    this.enemiesKilled = 0;
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    // 玩家
    for (let p = 0; p < this.players; p++) {
      if (this.lives[p] > 0) this.spawnPlayer(p);
    }
    this.emitHud();
    this.onEvent({ kind: 'level', level: idx + 1 });
  }

  playerSpawnPos(p) {
    const bc = GRID / 2 - 1;
    return p === 0 ? { x: (bc - 5) * CELL, y: (GRID - 3) * CELL } : { x: (bc + 5) * CELL, y: (GRID - 3) * CELL };
  }

  spawnPlayer(p) {
    const pos = this.playerSpawnPos(p);
    this.tanks.push({
      kind: 'player', player: p, x: pos.x, y: pos.y, dir: 'up',
      speed: 84, hp: 1, star: 1, fireCd: 0, fireInterval: 360,
      shield: 3, // 出生无敌秒数
      color: P_COLORS[p], anim: 0,
    });
  }

  spawnEnemy() {
    if (this.enemiesLeft <= 0) return;
    const alive = this.tanks.filter((t) => t.kind === 'enemy').length;
    if (alive >= 4) return;
    const cols = [0, GRID / 2 - 1, GRID - 2];
    const c = cols[this.spawnIndex % 3];
    const box = { x: c * CELL, y: 0, w: TANK_SIZE, h: TANK_SIZE };
    if (this.tanks.some((t) => rectsOverlap(box, this.tankBox(t)))) return; // 出生点被占,等下一轮
    this.spawnIndex++;
    this.enemiesLeft--;
    const killedSoFar = this.enemiesKilled;
    const type =
      killedSoFar >= 14 ? ENEMY_TYPES[2] : ENEMY_TYPES[(this.spawnIndex + this.levelIndex) % (killedSoFar >= 6 ? 3 : 2)];
    this.tanks.push({
      kind: 'enemy', type, x: c * CELL, y: 0, dir: 'down',
      speed: type.speed, hp: type.hp, fireCd: 600 + Math.random() * type.fire, fireInterval: type.fire,
      thinkCd: 400, color: type.color, anim: 0, shield: 0, star: 1,
      bonus: [4, 11, 18].includes(20 - this.enemiesLeft), // 第4/11/18辆带道具
    });
    this.emitHud();
  }

  tankBox(t) {
    return { x: t.x + (32 - TANK_SIZE) / 2, y: t.y + (32 - TANK_SIZE) / 2, w: TANK_SIZE, h: TANK_SIZE };
  }

  // ---------- 更新 ----------
  update(dt) {
    // 敌人补充
    this.spawnTimer -= dt * 1000;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = 2200;
    }
    // 坦克
    for (const t of this.tanks) {
      t.anim += dt * 10;
      if (t.shield > 0) t.shield -= dt;
      if (t.fireCd > 0) t.fireCd -= dt * 1000;
      if (t.kind === 'player') this.updatePlayer(t, dt);
      else this.updateEnemy(t, dt);
    }
    // 子弹
    for (const b of this.bullets) {
      b.x += DIRS[b.dir][0] * b.speed * dt;
      b.y += DIRS[b.dir][1] * b.speed * dt;
    }
    this.collideBullets();
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.tanks = this.tanks.filter((t) => !t.dead);
    // 爆炸动画
    for (const e of this.explosions) e.t += dt;
    this.explosions = this.explosions.filter((e) => e.t < 0.32);
    // 道具拾取/超时
    if (this.powerup) {
      this.powerup.ttl -= dt;
      if (this.powerup.ttl <= 0) this.powerup = null;
      else {
        const pu = { x: this.powerup.x, y: this.powerup.y, w: 24, h: 24 };
        for (const t of this.tanks) {
          if (t.kind === 'player' && rectsOverlap(pu, this.tankBox(t))) {
            this.applyPowerup(t);
            this.powerup = null;
            break;
          }
        }
      }
    }
    // 胜负
    if (!this.baseAlive) return this.gameOver(false);
    if (this.players > 0 && this.lives.slice(0, this.players).every((l, i) => l <= 0 && !this.tanks.some((t) => t.kind === 'player' && t.player === i))) {
      return this.gameOver(false);
    }
    if (this.enemiesLeft <= 0 && !this.tanks.some((t) => t.kind === 'enemy')) {
      if (this.levelIndex + 1 < LEVELS.length) {
        this.loadLevel(this.levelIndex + 1);
      } else {
        this.gameOver(true);
      }
    }
  }

  controlsOf(p) {
    return p === 0
      ? { up: 'w', down: 's', left: 'a', right: 'd', fire: ['j', ' '] }
      : { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: ['Enter', '0'] };
  }

  updatePlayer(t, dt) {
    const c = this.controlsOf(t.player);
    let dir = null;
    if (this.keys.has(c.up)) dir = 'up';
    else if (this.keys.has(c.down)) dir = 'down';
    else if (this.keys.has(c.left)) dir = 'left';
    else if (this.keys.has(c.right)) dir = 'right';
    if (dir) {
      t.dir = dir;
      this.moveTank(t, dir, t.speed * dt);
    }
    if (c.fire.some((k) => this.keys.has(k)) && t.fireCd <= 0) {
      this.fire(t);
      t.fireCd = t.star >= 2 ? 240 : t.fireInterval;
    }
  }

  updateEnemy(t, dt) {
    t.thinkCd -= dt * 1000;
    const moved = this.moveTank(t, t.dir, t.speed * dt);
    if (t.thinkCd <= 0 || !moved) {
      // 重新选向:偏向下与基地方向
      const bc = (GRID / 2 - 1) * CELL;
      const opts = ['down', 'down', t.x < bc ? 'right' : 'left', 'up', 'left', 'right'];
      t.dir = opts[Math.floor(Math.random() * opts.length)];
      t.thinkCd = 500 + Math.random() * 1200;
    }
    if (t.fireCd <= 0) {
      this.fire(t);
      t.fireCd = t.fireInterval * (0.7 + Math.random() * 0.8);
    }
  }

  /** 阻挡感知移动,返回是否移动成功 */
  moveTank(t, dir, dist) {
    const [dx, dy] = DIRS[dir];
    const box = this.tankBox(t);
    const nx = box.x + dx * dist;
    const ny = box.y + dy * dist;
    const nbox = { x: nx, y: ny, w: box.w, h: box.h };
    if (nx < 0 || ny < 0 || nx + box.w > FIELD || ny + box.h > FIELD) return false;
    // 地图碰撞(砖/钢/河/基地)
    const r0 = Math.floor(ny / CELL), r1 = Math.floor((ny + box.h - 0.01) / CELL);
    const c0 = Math.floor(nx / CELL), c1 = Math.floor((nx + box.w - 0.01) / CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.grid[r]?.[c];
        if (cell === BRICK || cell === STEEL || cell === RIVER || cell === BASE) return false;
      }
    }
    // 坦克互撞
    for (const other of this.tanks) {
      if (other === t || other.dead) continue;
      if (rectsOverlap(nbox, this.tankBox(other))) return false;
    }
    t.x += dx * dist;
    t.y += dy * dist;
    return true;
  }

  fire(t) {
    // 同坦克在场子弹限 1(三星玩家 2)
    const mine = this.bullets.filter((b) => b.owner === t).length;
    if (mine >= (t.kind === 'player' && t.star >= 3 ? 2 : 1)) return;
    const box = this.tankBox(t);
    const [dx, dy] = DIRS[t.dir];
    this.bullets.push({
      owner: t, kind: t.kind, player: t.player, dir: t.dir,
      x: box.x + box.w / 2 + dx * (box.w / 2) - BULLET_SIZE / 2,
      y: box.y + box.h / 2 + dy * (box.h / 2) - BULLET_SIZE / 2,
      speed: t.kind === 'player' && t.star >= 2 ? 300 : 220,
      power: t.kind === 'player' && t.star >= 3 ? 2 : 1, // 2 可破钢
    });
    if (t.kind === 'player') playSfx('shoot');
  }

  collideBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const bb = { x: b.x, y: b.y, w: BULLET_SIZE, h: BULLET_SIZE };
      // 出界
      if (b.x < -8 || b.y < -8 || b.x > FIELD || b.y > FIELD) { b.dead = true; continue; }
      // 地图
      const r0 = Math.floor(bb.y / CELL), r1 = Math.floor((bb.y + bb.h - 0.01) / CELL);
      const c0 = Math.floor(bb.x / CELL), c1 = Math.floor((bb.x + bb.w - 0.01) / CELL);
      let hitMap = false;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = this.grid[r]?.[c];
          if (cell === BRICK) { this.grid[r][c] = EMPTY; hitMap = true; }
          else if (cell === STEEL) { if (b.power >= 2) this.grid[r][c] = EMPTY; hitMap = true; }
          else if (cell === BASE) { this.baseAlive = false; hitMap = true; this.boom(c * CELL, r * CELL, 1.6); }
        }
      }
      if (hitMap) { b.dead = true; this.boom(b.x - 8, b.y - 8, 0.7); continue; }
      // 子弹对消(玩家弹 vs 敌弹)
      for (const o of this.bullets) {
        if (o === b || o.dead || o.kind === b.kind) continue;
        if (rectsOverlap(bb, { x: o.x, y: o.y, w: BULLET_SIZE, h: BULLET_SIZE })) { b.dead = true; o.dead = true; }
      }
      if (b.dead) continue;
      // 坦克
      for (const t of this.tanks) {
        if (t.dead || t === b.owner) continue;
        if (b.kind === t.kind) continue; // 友军不伤(含敌互不伤)
        if (!rectsOverlap(bb, this.tankBox(t))) continue;
        b.dead = true;
        if (t.shield > 0) break;
        t.hp -= 1;
        if (t.hp <= 0) {
          t.dead = true;
          this.boom(t.x, t.y, 1.2);
          playSfx('boom');
          if (t.kind === 'enemy') {
            this.enemiesKilled++;
            this.score += t.type.score;
            if (t.bonus) this.dropPowerup();
            this.emitHud();
          } else {
            this.lives[t.player] -= 1;
            this.emitHud();
            if (this.lives[t.player] > 0) setTimeout(() => this.running && this.spawnPlayer(t.player), 800);
          }
        }
        break;
      }
    }
  }

  dropPowerup() {
    const kinds = ['star', 'bomb', 'shield', 'life'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    for (let i = 0; i < 30; i++) {
      const r = 2 + Math.floor(Math.random() * (GRID - 6));
      const c = 1 + Math.floor(Math.random() * (GRID - 3));
      if (this.grid[r][c] === EMPTY && this.grid[r][c + 1] === EMPTY) {
        this.powerup = { kind, x: c * CELL, y: r * CELL, ttl: 12 };
        return;
      }
    }
  }

  applyPowerup(t) {
    playSfx('turn');
    const p = this.powerup;
    if (p.kind === 'star') t.star = Math.min(3, t.star + 1);
    else if (p.kind === 'shield') t.shield = 10;
    else if (p.kind === 'life') { this.lives[t.player] += 1; this.emitHud(); }
    else if (p.kind === 'bomb') {
      for (const e of this.tanks) {
        if (e.kind === 'enemy') { e.dead = true; this.boom(e.x, e.y, 1.2); this.enemiesKilled++; this.score += 50; }
      }
      playSfx('boom');
      this.emitHud();
    }
  }

  boom(x, y, scale) {
    this.explosions.push({ x: x + 16, y: y + 16, t: 0, scale });
  }

  gameOver(win) {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.onEvent({ kind: win ? 'win' : 'lose', score: this.score });
  }

  emitHud() {
    this.onEvent({
      kind: 'hud',
      level: this.levelIndex + 1,
      enemiesLeft: this.enemiesLeft + this.tanks.filter((t) => t.kind === 'enemy' && !t.dead).length,
      lives: this.lives.slice(0, this.players),
      score: this.score,
    });
  }

  // ---------- 渲染 ----------
  render() {
    const { ctx } = this;
    ctx.fillStyle = '#0c0e16';
    ctx.fillRect(0, 0, FIELD, FIELD);
    // 地形(树最后画,覆盖坦克)
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = this.grid[r][c];
        if (cell === BRICK) this.drawBrick(c * CELL, r * CELL);
        else if (cell === STEEL) this.drawSteel(c * CELL, r * CELL);
        else if (cell === RIVER) this.drawRiver(c * CELL, r * CELL);
        else if (cell === BASE) { /* 基地集中画 */ }
      }
    }
    this.drawBase();
    // 道具
    if (this.powerup) this.drawPowerup(this.powerup);
    // 坦克
    for (const t of this.tanks) this.drawTank(t);
    // 子弹
    ctx.fillStyle = '#f5f6fa';
    for (const b of this.bullets) ctx.fillRect(b.x, b.y, BULLET_SIZE, BULLET_SIZE);
    // 树(遮挡层)
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (this.grid[r][c] === TREE) this.drawTree(c * CELL, r * CELL);
      }
    }
    // 爆炸
    for (const e of this.explosions) {
      const pr = e.t / 0.32;
      ctx.strokeStyle = `rgba(255,${200 - pr * 120},60,${1 - pr})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 6 + pr * 22 * e.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,180,60,${0.5 * (1 - pr)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, (6 + pr * 12) * e.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBrick(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#a4502e';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#7d3a20';
    ctx.fillRect(x, y + CELL / 2 - 1, CELL, 2);
    ctx.fillRect(x + CELL / 2 - 1, y, 2, CELL / 2);
    ctx.fillRect(x + 3, y + CELL / 2, 2, CELL / 2);
  }

  drawSteel(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#9aa1b5';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#d7dbe8';
    ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
  }

  drawRiver(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#1f4f8f';
    ctx.fillRect(x, y, CELL, CELL);
    const phase = Math.floor(performance.now() / 400) % 2;
    ctx.fillStyle = '#3a74c4';
    ctx.fillRect(x + (phase ? 2 : 7), y + 4, 5, 2);
    ctx.fillRect(x + (phase ? 8 : 3), y + 10, 5, 2);
  }

  drawTree(x, y) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(46,124,56,0.85)';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = 'rgba(76,168,80,0.9)';
    ctx.fillRect(x + 2, y + 2, 4, 4);
    ctx.fillRect(x + 9, y + 7, 4, 4);
    ctx.fillRect(x + 3, y + 10, 3, 3);
  }

  drawBase() {
    const { ctx } = this;
    const bc = (GRID / 2 - 1) * CELL;
    const br = (GRID - 2) * CELL;
    ctx.fillStyle = this.baseAlive ? '#d9b23c' : '#5b5f70';
    // 简化老鹰:底座+翅膀三角+头
    ctx.fillRect(bc + 4, br + 18, 24, 10);
    ctx.beginPath();
    ctx.moveTo(bc + 16, br + 2);
    ctx.lineTo(bc + 2, br + 20);
    ctx.lineTo(bc + 30, br + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.baseAlive ? '#f3d56b' : '#777b8c';
    ctx.fillRect(bc + 13, br + 6, 6, 6);
  }

  drawPowerup(p) {
    const { ctx } = this;
    const blink = Math.floor(performance.now() / 250) % 2;
    if (p.ttl < 4 && blink) return;
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(p.x, p.y, 24, 24);
    ctx.strokeStyle = '#e8c84a';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 1, p.y + 1, 22, 22);
    ctx.fillStyle = '#f5f6fa';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = { star: '★', bomb: '✸', shield: '◈', life: '♥' }[p.kind];
    ctx.fillText(icon, p.x + 12, p.y + 13);
  }

  drawTank(t) {
    const { ctx } = this;
    const box = this.tankBox(t);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const ang = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[t.dir];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const s = TANK_SIZE;
    const track = Math.floor(t.anim) % 2;
    // 履带
    ctx.fillStyle = '#2c2f40';
    ctx.fillRect(-s / 2, -s / 2, 6, s);
    ctx.fillRect(s / 2 - 6, -s / 2, 6, s);
    ctx.fillStyle = '#4a4e66';
    for (let i = 0; i < 4; i++) {
      const yy = -s / 2 + i * (s / 4) + (track ? 2 : 0);
      ctx.fillRect(-s / 2, yy, 6, 3);
      ctx.fillRect(s / 2 - 6, yy, 6, 3);
    }
    // 车身
    ctx.fillStyle = t.color;
    ctx.fillRect(-s / 2 + 7, -s / 2 + 3, s - 14, s - 6);
    // 炮塔 + 炮管
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillRect(-2, -s / 2 - 4, 4, s / 2);
    // 重甲坦克标记
    if (t.kind === 'enemy' && t.hp >= 2) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-s / 2 + 7, -s / 2 + 3, s - 14, s - 6);
    }
    ctx.restore();
    // 护盾
    if (t.shield > 0) {
      const blink = Math.floor(performance.now() / 120) % 2;
      if (blink) {
        ctx.strokeStyle = 'rgba(120,200,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
