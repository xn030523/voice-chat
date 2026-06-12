'use client';

// 雪球兄弟 —— 平台跳跃+扔雪球(致敬经典玩法,自绘像素,零图片资产)
// 敌人被雪球打满 3 发变成大雪球 → 推动滚雪球弹墙碾压全场!
import { playSfx } from '@/lib/audio';

const GRID = 26;
const CELL = 16;
export const FIELD_W = GRID * CELL; // 416
export const FIELD_H = GRID * CELL;

const SOLID = 1, PLAT = 2;
const GRAV = 980;
const P_COLORS = ['#e8c84a', '#52c46a'];

// 关卡:#实心 =单向平台 .空(26×26;底两行地面,左右边墙)
function makeLevel(platRows) {
  const rows = [];
  for (let r = 0; r < GRID; r++) {
    let row = '';
    for (let c = 0; c < GRID; c++) {
      if (r >= GRID - 2) row += '#';
      else if (c === 0 || c === GRID - 1) row += '#';
      else row += '.';
    }
    rows.push(row.split(''));
  }
  for (const [r, c0, c1] of platRows) {
    for (let c = c0; c <= c1; c++) rows[r][c] = '=';
  }
  return rows.map((r) => r.join(''));
}

const LEVELS = [
  {
    plats: [[20, 2, 10], [20, 15, 23], [15, 1, 7], [15, 11, 14], [15, 18, 24], [10, 4, 11], [10, 14, 21], [5, 1, 9], [5, 16, 24]],
    enemies: [[3, 4, 3], [3, 20, 3], [8, 8, 8], [8, 17, 8], [13, 12, 13], [18, 5, 18], [18, 20, 18]],
  },
  {
    plats: [[21, 1, 6], [21, 19, 24], [17, 8, 17], [13, 1, 5], [13, 20, 24], [13, 10, 15], [9, 3, 10], [9, 15, 22], [5, 11, 14], [5, 1, 6], [5, 19, 24]],
    enemies: [[3, 12, 3], [7, 5, 7], [7, 20, 7], [11, 12, 11], [15, 3, 15], [15, 22, 15], [19, 10, 19], [19, 15, 19]],
  },
  {
    plats: [[21, 4, 9], [21, 16, 21], [18, 11, 14], [15, 2, 8], [15, 17, 23], [12, 10, 15], [9, 1, 6], [9, 19, 24], [6, 8, 17], [3, 1, 5], [3, 20, 24]],
    enemies: [[1, 3, 1], [1, 22, 1], [4, 12, 4], [7, 3, 7], [7, 22, 7], [10, 12, 10], [13, 5, 13], [13, 20, 13], [19, 12, 19]],
  },
];

function cellAt(grid, x, y) {
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return SOLID;
  const ch = grid[r][c];
  return ch === '#' ? SOLID : ch === '=' ? PLAT : 0;
}

export class SnowCore {
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
    this._kd = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._ku = (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  start() {
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
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
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }

  setPaused(p) {
    this.paused = p;
  }

  loadLevel(idx) {
    this.levelIndex = idx;
    const L = LEVELS[idx % LEVELS.length];
    this.grid = makeLevel(L.plats);
    this.actors = [];
    this.balls = []; // 雪球弹
    this.fx = [];
    for (let p = 0; p < this.players; p++) {
      if (this.lives[p] > 0) this.spawnPlayer(p);
    }
    for (const [r, c] of L.enemies.map((e) => [e[0], e[1]])) {
      this.actors.push(this.makeEnemy(c * CELL, r * CELL));
    }
    this.emitHud();
    this.onEvent({ kind: 'level', level: idx + 1 });
  }

  spawnPlayer(p) {
    this.actors.push({
      kind: 'player', player: p,
      x: p === 0 ? 3 * CELL : (GRID - 5) * CELL, y: (GRID - 4) * CELL,
      w: 22, h: 26, vx: 0, vy: 0, face: p === 0 ? 1 : -1,
      onGround: false, dropTimer: 0, fireCd: 0, shield: 3, anim: 0,
      color: P_COLORS[p],
    });
  }

  makeEnemy(x, y) {
    return {
      kind: 'enemy', x, y, w: 24, h: 24, vx: 0, vy: 0,
      dir: Math.random() < 0.5 ? -1 : 1, speed: 52 + Math.random() * 18,
      snow: 0, state: 'walk', // walk | frozen | rolling
      thaw: 0, rollVx: 0, rollTime: 0, anim: 0, onGround: false, jumpCd: 1500 + Math.random() * 2500,
    };
  }

  emitHud() {
    this.onEvent({
      kind: 'hud',
      level: this.levelIndex + 1,
      enemiesLeft: this.actors.filter((a) => a.kind === 'enemy').length,
      lives: this.lives.slice(0, this.players),
      score: this.score,
    });
  }

  controlsOf(p) {
    return p === 0
      ? { left: 'a', right: 'd', jump: 'w', down: 's', fire: ['j', ' '] }
      : { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown', fire: ['Enter', '0'] };
  }

  // ---------- 物理 ----------
  /** 横向移动+碰墙;纵向重力+平台/地面;返回 actor 更新 */
  physics(a, dt, opts = {}) {
    // 横向
    a.x += a.vx * dt;
    if (a.vx !== 0) {
      const xEdge = a.vx > 0 ? a.x + a.w : a.x;
      for (const yy of [a.y + 2, a.y + a.h / 2, a.y + a.h - 2]) {
        if (cellAt(this.grid, xEdge, yy) === SOLID) {
          a.x = a.vx > 0 ? Math.floor(xEdge / CELL) * CELL - a.w - 0.01 : (Math.floor(xEdge / CELL) + 1) * CELL + 0.01;
          if (opts.bounce) { a.vx = -a.vx; a.dir = -(a.dir || 1); playSfx('move'); }
          else a.vx = 0;
          break;
        }
      }
    }
    // 纵向
    a.vy += GRAV * dt;
    if (a.vy > 520) a.vy = 520;
    a.y += a.vy * dt;
    a.onGround = false;
    if (a.vy >= 0) {
      const footY = a.y + a.h;
      for (const xx of [a.x + 3, a.x + a.w - 3]) {
        const cell = cellAt(this.grid, xx, footY);
        const prevFoot = footY - a.vy * dt;
        const cellTop = Math.floor(footY / CELL) * CELL;
        if (cell === SOLID || (cell === PLAT && prevFoot <= cellTop + 1 && a.dropTimer <= 0)) {
          a.y = cellTop - a.h;
          a.vy = 0;
          a.onGround = true;
          break;
        }
      }
    } else {
      // 顶头(只对实心)
      for (const xx of [a.x + 3, a.x + a.w - 3]) {
        if (cellAt(this.grid, xx, a.y) === SOLID) {
          a.y = (Math.floor(a.y / CELL) + 1) * CELL + 0.01;
          a.vy = 0;
          break;
        }
      }
    }
    if (a.dropTimer > 0) a.dropTimer -= dt;
    // 边界兜底
    a.x = Math.max(CELL, Math.min(FIELD_W - CELL - a.w, a.x));
    if (a.y > FIELD_H) a.y = 0; // 理论不会(地面封死)
  }

  // ---------- 更新 ----------
  update(dt) {
    for (const a of this.actors) {
      a.anim += dt * 8;
      if (a.kind === 'player') this.updatePlayer(a, dt);
      else this.updateEnemy(a, dt);
    }
    // 雪球弹
    for (const b of this.balls) {
      b.x += b.vx * dt;
      b.vy += 240 * dt; // 轻微下坠
      b.y += b.vy * dt;
      b.ttl -= dt;
      if (b.ttl <= 0 || cellAt(this.grid, b.x + 4, b.y + 4) === SOLID) b.dead = true;
    }
    // 雪球弹命中敌人
    for (const b of this.balls) {
      if (b.dead) continue;
      for (const e of this.actors) {
        if (e.kind !== 'enemy' || e.state === 'rolling') continue;
        if (b.x < e.x + e.w && b.x + 8 > e.x && b.y < e.y + e.h && b.y + 8 > e.y) {
          b.dead = true;
          if (e.state !== 'frozen') {
            e.snow = Math.min(3, e.snow + 1);
            playSfx('move');
            if (e.snow >= 3) {
              e.state = 'frozen';
              e.thaw = 10;
              e.vx = 0;
              playSfx('capture');
            }
          } else {
            e.thaw = 10; // 补雪保鲜
          }
          break;
        }
      }
    }
    this.balls = this.balls.filter((b) => !b.dead);
    // 角色互碰
    const players = this.actors.filter((a) => a.kind === 'player');
    for (const p of players) {
      if (p.shield > 0) continue;
      for (const e of this.actors) {
        if (e.kind !== 'enemy' || e.dead) continue;
        if (p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
          if (e.state === 'frozen') {
            // 推雪球!
            e.state = 'rolling';
            e.rollVx = (p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1) * 320;
            e.rollTime = 6;
            playSfx('shoot');
          } else if (e.state === 'walk') {
            this.killPlayer(p);
            break;
          }
          // rolling 球碰玩家无害(自己推的)
        }
      }
    }
    // 滚动雪球碾敌
    for (const ball of this.actors) {
      if (ball.kind !== 'enemy' || ball.state !== 'rolling') continue;
      for (const e of this.actors) {
        if (e === ball || e.kind !== 'enemy' || e.dead || e.state === 'rolling') continue;
        if (ball.x < e.x + e.w && ball.x + ball.w > e.x && ball.y < e.y + e.h && ball.y + ball.h > e.y) {
          e.dead = true;
          this.score += 200;
          this.fx.push({ x: e.x + 12, y: e.y + 12, t: 0 });
          playSfx('boom');
        }
      }
    }
    const beforeEnemies = this.actors.filter((a) => a.kind === 'enemy').length;
    this.actors = this.actors.filter((a) => !a.dead);
    const afterEnemies = this.actors.filter((a) => a.kind === 'enemy').length;
    if (afterEnemies !== beforeEnemies) this.emitHud();
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 0.35);
    // 胜负
    if (
      this.lives.slice(0, this.players).every((l, i) => l <= 0 && !this.actors.some((a) => a.kind === 'player' && a.player === i))
    ) {
      return this.gameOver(false);
    }
    if (afterEnemies === 0) {
      if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
      else this.gameOver(true);
    }
  }

  updatePlayer(p, dt) {
    const c = this.controlsOf(p.player);
    if (p.shield > 0) p.shield -= dt;
    if (p.fireCd > 0) p.fireCd -= dt * 1000;
    p.vx = 0;
    if (this.keys.has(c.left)) { p.vx = -150; p.face = -1; }
    else if (this.keys.has(c.right)) { p.vx = 150; p.face = 1; }
    if (this.keys.has(c.jump) && p.onGround) {
      if (this.keys.has(c.down)) p.dropTimer = 0.28; // 下跳穿平台
      else { p.vy = -430; playSfx('move'); }
    }
    if (c.fire.some((k) => this.keys.has(k)) && p.fireCd <= 0) {
      this.balls.push({ x: p.x + p.w / 2 + p.face * 14 - 4, y: p.y + 6, vx: p.face * 250, vy: -30, ttl: 0.55 });
      p.fireCd = 260;
      playSfx('shoot');
    }
    this.physics(p, dt);
  }

  updateEnemy(e, dt) {
    if (e.state === 'walk') {
      e.jumpCd -= dt * 1000;
      e.vx = e.dir * e.speed * (e.snow > 0 ? 1 - e.snow * 0.25 : 1);
      // 平台边缘转向(脚前方无地则转)
      if (e.onGround) {
        const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
        const below = cellAt(this.grid, aheadX, e.y + e.h + 4);
        if (below === 0) {
          if (Math.random() < 0.35 && e.jumpCd <= 0) {
            e.dropTimer = 0.25; // 跳下
            e.jumpCd = 2500;
          } else e.dir = -e.dir;
        }
        if (e.jumpCd <= 0 && Math.random() < 0.004) {
          e.vy = -380;
          e.jumpCd = 2200;
        }
      }
      // 雪融化
      if (e.snow > 0) {
        e.thaw -= dt;
        if (e.thaw <= 0) { e.snow = Math.max(0, e.snow - 1); e.thaw = 3; }
      }
      this.physics(e, dt, { turnOnWall: true });
      if (e.vx === 0 && e.onGround) e.dir = -e.dir; // 碰墙转向
    } else if (e.state === 'frozen') {
      e.vx = 0;
      e.thaw -= dt;
      this.physics(e, dt);
      if (e.thaw <= 0) { e.state = 'walk'; e.snow = 2; }
    } else if (e.state === 'rolling') {
      e.vx = e.rollVx;
      e.rollTime -= dt;
      this.physics(e, dt, { bounce: true });
      e.rollVx = e.vx === 0 ? -e.rollVx : e.vx; // 弹墙反向(physics bounce 已处理,双保险)
      if (e.rollTime <= 0) {
        e.dead = true;
        this.score += 100;
        this.fx.push({ x: e.x + 12, y: e.y + 12, t: 0 });
        this.emitHud();
      }
    }
  }

  killPlayer(p) {
    p.dead = true;
    this.fx.push({ x: p.x + 12, y: p.y + 12, t: 0 });
    playSfx('boom');
    this.lives[p.player] -= 1;
    this.emitHud();
    if (this.lives[p.player] > 0) {
      setTimeout(() => this.running && this.spawnPlayer(p.player), 900);
    }
  }

  gameOver(win) {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.onEvent({ kind: win ? 'win' : 'lose', score: this.score });
  }

  // ---------- 渲染 ----------
  render() {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    grad.addColorStop(0, '#101430');
    grad.addColorStop(1, '#1a2348');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    // 地形
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const ch = this.grid[r][c];
        if (ch === '#') {
          ctx.fillStyle = '#3d5a96';
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          ctx.fillStyle = '#5375bd';
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, 3);
        } else if (ch === '=') {
          ctx.fillStyle = '#7fa8e8';
          ctx.fillRect(c * CELL, r * CELL, CELL, 6);
          ctx.fillStyle = '#b8d2f8';
          ctx.fillRect(c * CELL, r * CELL, CELL, 2);
        }
      }
    }
    // 雪球弹
    ctx.fillStyle = '#f4f8ff';
    for (const b of this.balls) {
      ctx.beginPath();
      ctx.arc(b.x + 4, b.y + 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 角色
    for (const a of this.actors) {
      if (a.kind === 'player') this.drawPlayer(a);
      else this.drawEnemy(a);
    }
    // 特效
    for (const f of this.fx) {
      const pr = f.t / 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${1 - pr})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4 + pr * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPlayer(p) {
    const { ctx } = this;
    if (p.shield > 0 && Math.floor(performance.now() / 120) % 2) return; // 无敌闪烁
    const x = p.x, y = p.y;
    // 身体
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.arc(x + 11, y + 16, 10, 0, Math.PI * 2);
    ctx.fill();
    // 帽子(玩家色)
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + 11, y + 8, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + 2, y + 7, 18, 3);
    // 脸
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(x + (p.face > 0 ? 12 : 6), y + 11, 2.6, 2.6);
    ctx.fillRect(x + (p.face > 0 ? 16 : 2), y + 11, 2.6, 2.6);
    // 脚(走路摆动)
    const sw = p.vx !== 0 ? Math.sin(p.anim * 2.4) * 3 : 0;
    ctx.fillStyle = p.color;
    ctx.fillRect(x + 4 + sw, y + 24, 6, 3);
    ctx.fillRect(x + 12 - sw, y + 24, 6, 3);
  }

  drawEnemy(e) {
    const { ctx } = this;
    const x = e.x, y = e.y;
    if (e.state === 'frozen' || e.state === 'rolling') {
      // 大雪球
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath();
      ctx.arc(x + 12, y + 12, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c2d4f2';
      ctx.lineWidth = 1.5;
      const spin = e.state === 'rolling' ? performance.now() / 90 : 0;
      ctx.beginPath();
      ctx.arc(x + 12, y + 12, 8, spin, spin + Math.PI * 1.2);
      ctx.stroke();
      if (e.state === 'frozen') {
        ctx.fillStyle = '#9aa6c2';
        ctx.fillRect(x + 7, y + 10, 3, 3);
        ctx.fillRect(x + 14, y + 10, 3, 3);
      }
      return;
    }
    // 毛怪:红色圆球 + 雪覆盖程度
    ctx.fillStyle = e.snow >= 2 ? '#d8889a' : '#d1495b';
    ctx.beginPath();
    ctx.arc(x + 12, y + 13, 11, 0, Math.PI * 2);
    ctx.fill();
    // 毛刺
    ctx.strokeStyle = e.snow >= 2 ? '#e0a4b2' : '#a8344a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.4 + Math.sin(e.anim) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x + 12 + Math.cos(a) * 10, y + 13 + Math.sin(a) * 10);
      ctx.lineTo(x + 12 + Math.cos(a) * 15, y + 13 + Math.sin(a) * 15);
      ctx.stroke();
    }
    // 雪覆盖
    if (e.snow > 0) {
      ctx.fillStyle = `rgba(240,246,255,${e.snow * 0.28})`;
      ctx.beginPath();
      ctx.arc(x + 12, y + 13, 11.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (e.dir > 0 ? 12 : 5), y + 9, 4, 4);
    ctx.fillRect(x + (e.dir > 0 ? 17 : 10), y + 9, 4, 4);
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(x + (e.dir > 0 ? 14 : 6), y + 10, 2, 2);
    ctx.fillRect(x + (e.dir > 0 ? 19 : 11), y + 10, 2, 2);
  }
}
