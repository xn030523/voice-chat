'use client';

// 像素突击 —— 横版卷轴射击(致敬合金弹头/魂斗罗玩法,自绘像素,零图片资产)
// 跑·跳·射,突破敌阵,干掉关底装甲堡垒!
import { playSfx } from '@/lib/audio';

const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 320;
const ROWS = VIEW_H / TILE; // 20
const WORLD_COLS = 150;
const WORLD_W = WORLD_COLS * TILE; // 2400
const GRAV = 1050;
const P_COLORS = ['#e8c84a', '#52c46a'];

// ---------- 关卡构造(程序生成段落) ----------
function buildWorld() {
  const ground = new Array(WORLD_COLS).fill(17); // 每列地面顶行(null=深坑)
  const set = (c0, c1, h) => { for (let c = c0; c <= c1; c++) ground[c] = h; };
  set(18, 20, null); // 坑
  set(26, 31, 15); // 高台
  set(38, 40, null);
  set(47, 52, 14);
  set(53, 56, 17);
  set(60, 62, null);
  set(70, 76, 15);
  set(84, 86, null);
  set(92, 97, 13);
  set(104, 106, null);
  set(112, 118, 16);
  set(126, 128, null);
  set(134, WORLD_COLS - 1, 16); // Boss 平台区

  const platforms = [
    { r: 12, c0: 17, c1: 21 }, { r: 13, c0: 37, c1: 41 }, { r: 11, c0: 49, c1: 51 },
    { r: 12, c0: 59, c1: 63 }, { r: 10, c0: 72, c1: 75 }, { r: 12, c0: 83, c1: 87 },
    { r: 9, c0: 93, c1: 96 }, { r: 12, c0: 103, c1: 107 }, { r: 11, c0: 113, c1: 116 },
    { r: 12, c0: 125, c1: 129 },
  ];
  const enemies = [
    { type: 'soldier', c: 14 }, { type: 'soldier', c: 24 }, { type: 'turret', c: 30 },
    { type: 'soldier', c: 35 }, { type: 'soldier', c: 44 }, { type: 'turret', c: 50 },
    { type: 'soldier', c: 57 }, { type: 'soldier', c: 66 }, { type: 'turret', c: 73 },
    { type: 'soldier', c: 80 }, { type: 'soldier', c: 89 }, { type: 'turret', c: 94 },
    { type: 'soldier', c: 100 }, { type: 'soldier', c: 110 }, { type: 'turret', c: 115 },
    { type: 'soldier', c: 121 }, { type: 'soldier', c: 131 },
  ];
  return { ground, platforms, enemies };
}

export class RunCore {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = opts.players || 1;
    this.onEvent = opts.onEvent || (() => {});
    this.keys = new Set();
    this.running = false;
    this.paused = false;
    this.lives = [3, this.players === 2 ? 3 : 0];
    this.score = 0;
    this.raf = null;
    this.last = 0;
    this.camX = 0;
    const typing = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    this._kd = (e) => {
      if (typing(e)) return; // 聊天框打字不操控游戏、不吞按键
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._ku = (e) => {
      if (typing(e)) return;
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
  }

  start() {
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    const w = buildWorld();
    this.ground = w.ground;
    this.platforms = w.platforms;
    this.actors = [];
    this.bullets = [];
    this.fx = [];
    for (let p = 0; p < this.players; p++) this.spawnPlayer(p);
    for (const e of w.enemies) this.spawnEnemy(e);
    // Boss:关底装甲堡垒
    this.boss = {
      kind: 'boss', x: (WORLD_COLS - 8) * TILE, y: 10 * TILE, w: 84, h: 96,
      hp: 60, maxHp: 60, fireCd: 1200, alive: true, flash: 0,
    };
    this.onEvent({ kind: 'level', level: 1 });
    this.emitHud();
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

  spawnPlayer(p, atX) {
    this.actors.push({
      kind: 'player', player: p, x: atX ?? 32 + p * 28, y: 12 * TILE,
      w: 18, h: 26, vx: 0, vy: 0, face: 1, aimUp: false,
      onGround: false, fireCd: 0, shield: 3, anim: 0, color: P_COLORS[p],
    });
  }

  spawnEnemy(def) {
    if (def.type === 'soldier') {
      this.actors.push({
        kind: 'enemy', etype: 'soldier', x: def.c * TILE, y: 8 * TILE, w: 18, h: 26,
        vx: 0, vy: 0, dir: -1, speed: 36, hp: 1, fireCd: 800 + Math.random() * 1500,
        onGround: false, anim: 0,
      });
    } else {
      const gy = (this.ground[def.c] ?? 17) * TILE;
      this.actors.push({
        kind: 'enemy', etype: 'turret', x: def.c * TILE, y: gy - 22, w: 24, h: 22,
        vx: 0, vy: 0, hp: 3, fireCd: 1000 + Math.random() * 800, onGround: true, anim: 0,
      });
    }
  }

  emitHud() {
    this.onEvent({
      kind: 'hud',
      lives: this.lives.slice(0, this.players),
      score: this.score,
      enemiesLeft: this.actors.filter((a) => a.kind === 'enemy').length + (this.boss?.alive ? 1 : 0),
    });
  }

  controlsOf(p) {
    return p === 0
      ? { left: 'a', right: 'd', jump: 'w', up: 'w', aim: 'i', fire: ['j', ' '] }
      : { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', up: 'ArrowUp', aim: 'ArrowUp', fire: ['Enter', '0'] };
  }

  solidAt(x, y) {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || c >= WORLD_COLS) return true;
    if (r >= ROWS) return false; // 深坑
    const g = this.ground[c];
    if (g !== null && r >= g) return true;
    return false;
  }

  platformAt(x, y) {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    return this.platforms.some((p) => r === p.r && c >= p.c0 && c <= p.c1);
  }

  physics(a, dt) {
    a.x += a.vx * dt;
    if (a.vx !== 0) {
      const edge = a.vx > 0 ? a.x + a.w : a.x;
      for (const yy of [a.y + 3, a.y + a.h - 3]) {
        if (this.solidAt(edge, yy)) {
          a.x = a.vx > 0 ? Math.floor(edge / TILE) * TILE - a.w - 0.01 : (Math.floor(edge / TILE) + 1) * TILE + 0.01;
          a.vx = 0;
          break;
        }
      }
    }
    a.vy += GRAV * dt;
    if (a.vy > 560) a.vy = 560;
    a.y += a.vy * dt;
    a.onGround = false;
    if (a.vy >= 0) {
      const foot = a.y + a.h;
      const prevFoot = foot - a.vy * dt;
      for (const xx of [a.x + 3, a.x + a.w - 3]) {
        const tileTop = Math.floor(foot / TILE) * TILE;
        if (this.solidAt(xx, foot) || (this.platformAt(xx, foot) && prevFoot <= tileTop + 1 && (a.dropTimer || 0) <= 0)) {
          a.y = tileTop - a.h;
          a.vy = 0;
          a.onGround = true;
          break;
        }
      }
    }
    if (a.dropTimer > 0) a.dropTimer -= dt;
    a.x = Math.max(0, Math.min(WORLD_W - a.w, a.x));
  }

  update(dt) {
    const alivePlayers = this.actors.filter((a) => a.kind === 'player');
    // 摄像机:跟随最前玩家
    if (alivePlayers.length) {
      const front = Math.max(...alivePlayers.map((p) => p.x));
      this.camX = Math.max(0, Math.min(WORLD_W - VIEW_W, front - VIEW_W * 0.38));
    }

    for (const a of this.actors) {
      a.anim += dt * 9;
      if (a.kind === 'player') this.updatePlayer(a, dt);
      else this.updateEnemy(a, dt);
    }
    // Boss
    if (this.boss.alive) {
      this.boss.flash = Math.max(0, this.boss.flash - dt);
      this.boss.fireCd -= dt * 1000;
      if (this.boss.fireCd <= 0 && alivePlayers.length && this.boss.x - this.camX < VIEW_W + 60) {
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        for (const sy of [20, 50, 80]) {
          const ox = this.boss.x;
          const oy = this.boss.y + sy;
          const dx = target.x + 9 - ox;
          const dy = target.y + 13 - oy;
          const len = Math.hypot(dx, dy) || 1;
          this.bullets.push({ kind: 'enemy', x: ox, y: oy, vx: (dx / len) * 170, vy: (dy / len) * 170, ttl: 3 });
        }
        this.boss.fireCd = 1400;
        playSfx('shoot');
      }
    }
    // 子弹
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;
      if (b.ttl <= 0 || this.solidAt(b.x, b.y)) b.dead = true;
    }
    // 子弹命中
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.kind === 'player') {
        for (const e of this.actors) {
          if (e.kind !== 'enemy' || e.dead) continue;
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            b.dead = true;
            e.hp -= 1;
            if (e.hp <= 0) {
              e.dead = true;
              this.score += e.etype === 'turret' ? 300 : 100;
              this.fx.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0 });
              playSfx('boom');
              this.emitHud();
            }
            break;
          }
        }
        const B = this.boss;
        if (!b.dead && B.alive && b.x > B.x && b.x < B.x + B.w && b.y > B.y && b.y < B.y + B.h) {
          b.dead = true;
          B.hp -= 1;
          B.flash = 0.08;
          if (B.hp <= 0) {
            B.alive = false;
            this.score += 2000;
            for (let i = 0; i < 6; i++) {
              this.fx.push({ x: B.x + Math.random() * B.w, y: B.y + Math.random() * B.h, t: -i * 0.1 });
            }
            playSfx('boom');
            setTimeout(() => this.gameOver(true), 1200);
          }
        }
      } else {
        for (const p of this.actors) {
          if (p.kind !== 'player' || p.dead || p.shield > 0) continue;
          if (b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) {
            b.dead = true;
            this.killPlayer(p);
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
    // 碰敌即死 / 掉坑
    for (const p of this.actors) {
      if (p.kind !== 'player' || p.dead) continue;
      if (p.y > VIEW_H + 40) { this.killPlayer(p, true); continue; }
      if (p.shield > 0) continue;
      for (const e of this.actors) {
        if (e.kind !== 'enemy' || e.dead) continue;
        if (p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
          this.killPlayer(p);
          break;
        }
      }
    }
    this.actors = this.actors.filter((a) => !a.dead);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 0.4);
    // 失败判定
    if (this.lives.slice(0, this.players).every((l, i) => l <= 0 && !this.actors.some((a) => a.kind === 'player' && a.player === i))) {
      this.gameOver(false);
    }
  }

  updatePlayer(p, dt) {
    const c = this.controlsOf(p.player);
    if (p.shield > 0) p.shield -= dt;
    if (p.fireCd > 0) p.fireCd -= dt * 1000;
    p.vx = 0;
    if (this.keys.has(c.left)) { p.vx = -160; p.face = -1; }
    else if (this.keys.has(c.right)) { p.vx = 160; p.face = 1; }
    if (this.keys.has(c.jump) && p.onGround) {
      p.vy = -420;
      playSfx('move');
    }
    if (c.fire.some((k) => this.keys.has(k)) && p.fireCd <= 0) {
      const up = this.keys.has(c.up) && p.vx === 0; // 站定+按上 = 朝上射
      this.bullets.push({
        kind: 'player',
        x: p.x + p.w / 2 + (up ? 0 : p.face * 14),
        y: p.y + (up ? -2 : 10),
        vx: up ? 0 : p.face * 380,
        vy: up ? -380 : 0,
        ttl: 1.4,
      });
      p.fireCd = 180;
      playSfx('shoot');
    }
    this.physics(p, dt);
  }

  updateEnemy(e, dt) {
    const players = this.actors.filter((a) => a.kind === 'player');
    const near = players.length
      ? players.reduce((m, p) => (Math.abs(p.x - e.x) < Math.abs(m.x - e.x) ? p : m), players[0])
      : null;
    if (e.etype === 'soldier') {
      // 视野内朝玩家走 + 开火
      if (near && Math.abs(near.x - e.x) < 300) {
        e.dir = near.x > e.x ? 1 : -1;
        e.vx = e.dir * e.speed;
      } else e.vx = 0;
      e.fireCd -= dt * 1000;
      if (near && e.fireCd <= 0 && Math.abs(near.x - e.x) < 260 && Math.abs(near.y - e.y) < 60) {
        this.bullets.push({ kind: 'enemy', x: e.x + e.w / 2 + e.dir * 12, y: e.y + 10, vx: e.dir * 230, vy: 0, ttl: 2 });
        e.fireCd = 1100 + Math.random() * 900;
      }
      this.physics(e, dt);
    } else {
      // 炮台:瞄准射击
      e.fireCd -= dt * 1000;
      if (near && e.fireCd <= 0 && Math.abs(near.x - e.x) < 320) {
        const dx = near.x + 9 - (e.x + 12);
        const dy = near.y + 13 - (e.y + 8);
        const len = Math.hypot(dx, dy) || 1;
        this.bullets.push({ kind: 'enemy', x: e.x + 12, y: e.y + 8, vx: (dx / len) * 190, vy: (dy / len) * 190, ttl: 2.5 });
        e.fireCd = 1300 + Math.random() * 700;
      }
    }
  }

  killPlayer(p, fell) {
    p.dead = true;
    if (!fell) {
      this.fx.push({ x: p.x + 9, y: p.y + 13, t: 0 });
    }
    playSfx('boom');
    this.lives[p.player] -= 1;
    this.emitHud();
    if (this.lives[p.player] > 0) {
      const respawnX = Math.max(32, this.camX + 60);
      setTimeout(() => this.running && this.spawnPlayer(p.player, respawnX), 900);
    }
  }

  gameOver(win) {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.onEvent({ kind: win ? 'win' : 'lose', score: this.score, detail: win ? '装甲堡垒已摧毁!' : undefined });
  }

  // ---------- 渲染 ----------
  render() {
    const { ctx } = this;
    const cam = this.camX;
    // 天空渐变 + 远山视差
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#1a1230');
    grad.addColorStop(0.7, '#3a2440');
    grad.addColorStop(1, '#2a1c34');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#241a3e';
    for (let i = 0; i < 8; i++) {
      const mx = ((i * 340 - cam * 0.3) % (VIEW_W + 360)) - 180;
      ctx.beginPath();
      ctx.moveTo(mx, 230);
      ctx.lineTo(mx + 150, 120 + (i % 3) * 26);
      ctx.lineTo(mx + 320, 230);
      ctx.closePath();
      ctx.fill();
    }
    // 地面
    const c0 = Math.floor(cam / TILE);
    const c1 = Math.min(WORLD_COLS - 1, c0 + VIEW_W / TILE + 1);
    for (let c = c0; c <= c1; c++) {
      const g = this.ground[c];
      if (g === null) continue;
      for (let r = g; r < ROWS; r++) {
        const x = c * TILE - cam;
        const y = r * TILE;
        ctx.fillStyle = r === g ? '#6b5337' : '#4a3a28';
        ctx.fillRect(x, y, TILE, TILE);
        if (r === g) {
          ctx.fillStyle = '#8a6c44';
          ctx.fillRect(x + 1, y, TILE - 2, 3);
        }
      }
    }
    // 平台
    for (const p of this.platforms) {
      const x0 = p.c0 * TILE - cam;
      if (x0 > VIEW_W || (p.c1 + 1) * TILE - cam < 0) continue;
      ctx.fillStyle = '#7a6248';
      ctx.fillRect(x0, p.r * TILE, (p.c1 - p.c0 + 1) * TILE, 6);
      ctx.fillStyle = '#9a8060';
      ctx.fillRect(x0, p.r * TILE, (p.c1 - p.c0 + 1) * TILE, 2);
    }
    // Boss
    if (this.boss.alive) this.drawBoss(cam);
    // 角色
    for (const a of this.actors) {
      if (a.kind === 'player') this.drawSoldier(a, cam, a.color, a.face);
      else if (a.etype === 'soldier') this.drawSoldier(a, cam, '#d1495b', a.dir);
      else this.drawTurret(a, cam);
    }
    // 子弹
    for (const b of this.bullets) {
      ctx.fillStyle = b.kind === 'player' ? '#ffe9a8' : '#ff8d7a';
      ctx.fillRect(b.x - cam - 2, b.y - 2, 5, 5);
    }
    // 特效
    for (const f of this.fx) {
      if (f.t < 0) continue;
      const pr = f.t / 0.4;
      ctx.strokeStyle = `rgba(255,${190 - pr * 110},70,${1 - pr})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x - cam, f.y, 5 + pr * 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Boss 血条
    if (this.boss.alive && this.boss.x - cam < VIEW_W) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(VIEW_W / 2 - 80, 8, 160, 10);
      ctx.fillStyle = '#d1495b';
      ctx.fillRect(VIEW_W / 2 - 78, 10, 156 * (this.boss.hp / this.boss.maxHp), 6);
    }
  }

  drawSoldier(a, cam, color, face) {
    const { ctx } = this;
    if (a.shield > 0 && Math.floor(performance.now() / 120) % 2) return;
    const x = a.x - cam;
    const y = a.y;
    // 腿(跑动)
    const sw = a.vx !== 0 ? Math.sin(a.anim * 2.2) * 4 : 0;
    ctx.strokeStyle = '#2a2d3e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 18);
    ctx.lineTo(x + 5 + sw, y + 26);
    ctx.moveTo(x + 9, y + 18);
    ctx.lineTo(x + 13 - sw, y + 26);
    ctx.stroke();
    // 身体
    ctx.fillStyle = color;
    ctx.fillRect(x + 4, y + 8, 10, 11);
    // 头+头盔
    ctx.fillStyle = '#e8c9a8';
    ctx.fillRect(x + 5, y + 3, 8, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x + 4, y + 1, 10, 4);
    // 枪
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(face > 0 ? x + 12 : x - 6, y + 11, 12, 3);
  }

  drawTurret(e, cam) {
    const { ctx } = this;
    const x = e.x - cam;
    const y = e.y;
    ctx.fillStyle = '#5b5f70';
    ctx.fillRect(x, y + 10, 24, 12);
    ctx.fillStyle = '#787d92';
    ctx.beginPath();
    ctx.arc(x + 12, y + 10, 9, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#2a2d3e';
    ctx.fillRect(x + 10, y, 4, 8);
  }

  drawBoss(cam) {
    const { ctx } = this;
    const B = this.boss;
    const x = B.x - cam;
    if (x > VIEW_W) return;
    const y = B.y;
    ctx.fillStyle = B.flash > 0 ? '#a06a78' : '#5b4358';
    ctx.fillRect(x, y, B.w, B.h);
    ctx.fillStyle = '#76586e';
    ctx.fillRect(x + 6, y + 6, B.w - 12, B.h - 12);
    // 三层炮口
    ctx.fillStyle = '#1d2030';
    for (const sy of [20, 50, 80]) ctx.fillRect(x - 8, y + sy - 4, 14, 8);
    // 核心
    const blink = Math.floor(performance.now() / 300) % 2;
    ctx.fillStyle = blink ? '#ff8d7a' : '#d1495b';
    ctx.beginPath();
    ctx.arc(x + B.w / 2, y + B.h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}
