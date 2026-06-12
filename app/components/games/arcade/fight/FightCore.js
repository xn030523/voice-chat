'use client';

// 功夫龟对决 —— 1v1 像素格斗(致敬经典对打玩法,自绘像素,零图片资产)
// 拳快脚重,按住后退自动格挡;KO 或时间到血多者胜。
import { playSfx } from '@/lib/audio';

export const VIEW_W = 480;
export const VIEW_H = 280;
const FLOOR = 232;
const GRAV = 1500;

const MOVES = {
  punch: { windup: 0.08, active: 0.1, recover: 0.16, range: 34, damage: 7, push: 60, stun: 0.22, reachY: 12 },
  kick: { windup: 0.16, active: 0.12, recover: 0.26, range: 46, damage: 13, push: 130, stun: 0.34, reachY: 22 },
};

const TURTLE_COLORS = [
  { mask: '#e04545', body: '#3da95c' },
  { mask: '#3f7cd6', body: '#46b182' },
];

export class FightCore {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = opts.players || 1;
    this.onEvent = opts.onEvent || (() => {});
    this.keys = new Set();
    this.running = false;
    this.paused = false;
    this.raf = null;
    this.last = 0;
    this.timer = 90;
    this.over = false;
    this._kd = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    this._ku = (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  start() {
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    this.fighters = [this.makeFighter(0, 120), this.makeFighter(1, VIEW_W - 150)];
    this.fx = [];
    this.aiState = { cd: 0, intent: 'approach' };
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

  makeFighter(i, x) {
    return {
      idx: i, x, y: FLOOR, w: 30, h: 56, vx: 0, vy: 0,
      hp: 100, face: i === 0 ? 1 : -1, onGround: true,
      state: 'idle', // idle|walk|jump|attack|hit|block|ko
      move: null, phase: null, pt: 0, // 攻击:move/phase(windup|active|recover)/计时
      stun: 0, blocking: false, anim: 0, flash: 0, hitDone: false,
      colors: TURTLE_COLORS[i],
    };
  }

  emitHud() {
    this.onEvent({ kind: 'hud', timer: Math.ceil(this.timer) });
  }

  controlsOf(i) {
    return i === 0
      ? { left: 'a', right: 'd', jump: 'w', punch: 'j', kick: 'k' }
      : { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', punch: 'Enter', kick: '0' };
  }

  update(dt) {
    if (this.over) return;
    this.timer -= dt;
    if (Math.ceil(this.timer + dt) !== Math.ceil(this.timer)) this.emitHud();
    const [A, B] = this.fighters;
    // 面向对手
    A.face = A.x < B.x ? 1 : -1;
    B.face = -A.face;

    this.controlFighter(A, dt, this.readKeys(0));
    if (this.players === 2) this.controlFighter(B, dt, this.readKeys(1));
    else this.controlFighter(B, dt, this.aiInputs(B, A, dt));

    for (const f of this.fighters) this.physicsAndAttack(f, dt);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 0.3);

    // 胜负
    if (A.hp <= 0 || B.hp <= 0 || this.timer <= 0) {
      this.over = true;
      const aWin = B.hp < A.hp || B.hp <= 0;
      const draw = A.hp === B.hp && this.timer <= 0;
      const loser = aWin ? B : A;
      loser.state = 'ko';
      setTimeout(() => {
        this.running = false;
        cancelAnimationFrame(this.raf);
        if (this.players === 2) {
          this.onEvent({ kind: 'win', detail: draw ? '平局!' : `${aWin ? 'P1 红带龟' : 'P2 蓝带龟'} 获胜!` });
        } else {
          this.onEvent({ kind: aWin ? 'win' : 'lose', detail: draw ? '平局!' : aWin ? '你 KO 了对手!' : '被对手 KO…' });
        }
      }, 1100);
    }
  }

  readKeys(i) {
    const c = this.controlsOf(i);
    return {
      left: this.keys.has(c.left),
      right: this.keys.has(c.right),
      jump: this.keys.has(c.jump),
      punch: this.keys.has(c.punch),
      kick: this.keys.has(c.kick),
    };
  }

  aiInputs(me, foe, dt) {
    const s = this.aiState;
    s.cd -= dt;
    const dist = Math.abs(foe.x - me.x);
    const inp = { left: false, right: false, jump: false, punch: false, kick: false };
    if (s.cd <= 0) {
      const r = Math.random();
      if (dist > 70) s.intent = r < 0.75 ? 'approach' : r < 0.9 ? 'wait' : 'jump';
      else s.intent = r < 0.38 ? 'punch' : r < 0.6 ? 'kick' : r < 0.78 ? 'retreat' : 'approach';
      s.cd = 0.25 + Math.random() * 0.4;
    }
    const toward = foe.x > me.x ? 'right' : 'left';
    const away = foe.x > me.x ? 'left' : 'right';
    if (s.intent === 'approach') inp[toward] = true;
    else if (s.intent === 'retreat') inp[away] = true;
    else if (s.intent === 'jump') { inp.jump = true; inp[toward] = true; }
    else if (s.intent === 'punch' && dist < 60) inp.punch = true;
    else if (s.intent === 'kick' && dist < 75) inp.kick = true;
    // 对手出招时概率格挡
    if (foe.state === 'attack' && Math.random() < 0.5) { inp[away] = true; inp.punch = false; inp.kick = false; }
    return inp;
  }

  controlFighter(f, dt, inp) {
    if (f.state === 'ko') return;
    if (f.stun > 0) {
      f.stun -= dt;
      f.vx *= 0.86;
      return;
    }
    if (f.state === 'attack') return; // 出招中不可控
    f.vx = 0;
    f.blocking = false;
    const fwd = f.face > 0 ? 'right' : 'left';
    const back = f.face > 0 ? 'left' : 'right';
    if (inp[fwd]) f.vx = 150 * f.face;
    else if (inp[back]) {
      f.vx = -110 * f.face;
      if (f.onGround) f.blocking = true; // 后退=格挡
    }
    if (inp.jump && f.onGround) {
      f.vy = -520;
      f.onGround = false;
      playSfx('move');
    }
    if (inp.punch) this.startAttack(f, 'punch');
    else if (inp.kick) this.startAttack(f, 'kick');
    f.state = f.onGround ? (f.vx !== 0 ? 'walk' : f.blocking ? 'block' : 'idle') : 'jump';
  }

  startAttack(f, name) {
    f.state = 'attack';
    f.move = name;
    f.phase = 'windup';
    f.pt = 0;
    f.hitDone = false;
    f.vx = 0;
  }

  physicsAndAttack(f, dt) {
    // 攻击阶段机
    if (f.state === 'attack' && f.move) {
      const m = MOVES[f.move];
      f.pt += dt;
      if (f.phase === 'windup' && f.pt >= m.windup) { f.phase = 'active'; f.pt = 0; playSfx('shoot'); }
      else if (f.phase === 'active') {
        if (!f.hitDone) this.tryHit(f, m);
        if (f.pt >= m.active) { f.phase = 'recover'; f.pt = 0; }
      } else if (f.phase === 'recover' && f.pt >= m.recover) {
        f.state = 'idle';
        f.move = null;
      }
    }
    // 物理
    f.anim += dt * 8;
    f.flash = Math.max(0, f.flash - dt);
    f.x += f.vx * dt;
    f.x = Math.max(10, Math.min(VIEW_W - 10 - f.w, f.x));
    if (!f.onGround) {
      f.vy += GRAV * dt;
      f.y += f.vy * dt;
      if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; f.onGround = true; }
    }
    // 双方身体轻推开(防重叠)
    const other = this.fighters[1 - f.idx];
    if (other && Math.abs(f.x - other.x) < 24 && Math.abs(f.y - other.y) < 40) {
      const push = f.x < other.x ? -28 : 28;
      f.x += push * dt;
    }
  }

  tryHit(f, m) {
    const foe = this.fighters[1 - f.idx];
    if (!foe || foe.state === 'ko') return;
    const hx = f.face > 0 ? f.x + f.w : f.x - m.range;
    const hitbox = { x: hx, y: f.y - f.h + m.reachY, w: m.range, h: 26 };
    const foeBox = { x: foe.x, y: foe.y - foe.h, w: foe.w, h: foe.h };
    if (
      hitbox.x < foeBox.x + foeBox.w && hitbox.x + hitbox.w > foeBox.x &&
      hitbox.y < foeBox.y + foeBox.h && hitbox.y + hitbox.h > foeBox.y
    ) {
      f.hitDone = true;
      const blocked = foe.blocking && foe.face !== f.face; // 面对面且格挡
      const dmg = blocked ? Math.ceil(m.damage * 0.2) : m.damage;
      foe.hp = Math.max(0, foe.hp - dmg);
      foe.stun = blocked ? 0.1 : m.stun;
      foe.vx = f.face * (blocked ? m.push * 0.5 : m.push) * 3;
      foe.flash = 0.12;
      foe.state = blocked ? 'block' : 'hit';
      this.fx.push({ x: hitbox.x + (f.face > 0 ? 8 : m.range - 8), y: hitbox.y + 12, t: 0, blocked });
      playSfx(blocked ? 'move' : 'capture');
    }
  }

  // ---------- 渲染 ----------
  render() {
    const { ctx } = this;
    // 背景:道场
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#241830');
    grad.addColorStop(1, '#372544');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 圆月 + 远景
    ctx.fillStyle = 'rgba(238,222,170,0.85)';
    ctx.beginPath();
    ctx.arc(390, 64, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1228';
    for (const [bx, bw, bh] of [[20, 50, 90], [90, 36, 60], [330, 44, 74], [430, 40, 96]]) {
      ctx.fillRect(bx, FLOOR - bh + 24, bw, bh);
    }
    // 地面
    ctx.fillStyle = '#4a3a52';
    ctx.fillRect(0, FLOOR + 24, VIEW_W, VIEW_H - FLOOR);
    ctx.fillStyle = '#5d4a66';
    ctx.fillRect(0, FLOOR + 24, VIEW_W, 4);
    // 血条
    this.drawHpBar(14, true, this.fighters[0]);
    this.drawHpBar(VIEW_W - 14 - 180, false, this.fighters[1]);
    // 角色
    for (const f of this.fighters) this.drawTurtle(f);
    // 打击特效
    for (const e of this.fx) {
      const pr = e.t / 0.3;
      ctx.strokeStyle = e.blocked ? `rgba(140,180,255,${1 - pr})` : `rgba(255,210,80,${1 - pr})`;
      ctx.lineWidth = 3;
      const r = 4 + pr * 14;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + pr * 1.2;
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }

  drawHpBar(x, leftAlign, f) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, 12, 180, 14);
    const w = 176 * (f.hp / 100);
    ctx.fillStyle = f.hp > 40 ? '#52c46a' : f.hp > 15 ? '#e6b832' : '#e04545';
    ctx.fillRect(leftAlign ? x + 2 : x + 2 + (176 - w), 14, w, 10);
    ctx.fillStyle = f.colors.mask;
    ctx.fillRect(leftAlign ? x : x + 180 - 4, 12, 4, 14);
  }

  drawTurtle(f) {
    const { ctx } = this;
    const x = f.x + f.w / 2;
    const baseY = f.y;
    const t = f.anim;
    const ko = f.state === 'ko';
    ctx.save();
    ctx.translate(x, baseY);
    if (ko) ctx.rotate(f.face * -1.35);
    const bob = f.state === 'walk' ? Math.sin(t * 2.4) * 2 : 0;
    // 腿
    ctx.strokeStyle = '#2c7a44';
    ctx.lineWidth = 5;
    const legSw = f.state === 'walk' ? Math.sin(t * 2.4) * 6 : 0;
    let kickLeg = 0;
    if (f.state === 'attack' && f.move === 'kick' && f.phase !== 'windup') kickLeg = f.face * 26;
    ctx.beginPath();
    ctx.moveTo(-6, -22 + bob);
    ctx.lineTo(-8 + legSw + (kickLeg < 0 ? kickLeg : 0), 0);
    ctx.moveTo(6, -22 + bob);
    ctx.lineTo(8 - legSw + (kickLeg > 0 ? kickLeg : 0), kickLeg ? -16 : 0);
    ctx.stroke();
    // 龟壳(背后)
    ctx.fillStyle = '#8a6238';
    ctx.beginPath();
    ctx.ellipse(-f.face * 8, -34 + bob, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e4c2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-f.face * 8, -34 + bob, 8, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 身体
    ctx.fillStyle = f.flash > 0 ? '#ffffff' : f.colors.body;
    ctx.beginPath();
    ctx.ellipse(0, -32 + bob, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // 手臂(拳)
    ctx.strokeStyle = f.flash > 0 ? '#fff' : '#2c7a44';
    ctx.lineWidth = 5;
    let punchArm = 0;
    if (f.state === 'attack' && f.move === 'punch' && f.phase !== 'windup') punchArm = f.face * 26;
    const guard = f.blocking ? f.face * 10 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -36 + bob);
    ctx.lineTo(f.face * 12 + punchArm + guard, -34 + bob - (punchArm ? 4 : f.blocking ? 10 : 0));
    ctx.moveTo(0, -34 + bob);
    ctx.lineTo(-f.face * 8 + guard, -26 + bob);
    ctx.stroke();
    // 头
    ctx.fillStyle = f.flash > 0 ? '#fff' : f.colors.body;
    ctx.beginPath();
    ctx.arc(f.face * 5, -52 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    // 眼罩(队色)+ 飘带
    ctx.fillStyle = f.colors.mask;
    ctx.fillRect(f.face * 5 - 9, -56 + bob, 18, 5);
    ctx.beginPath();
    ctx.moveTo(-f.face * 4, -53 + bob);
    ctx.lineTo(-f.face * 16, -50 + bob + Math.sin(t * 3) * 3);
    ctx.lineTo(-f.face * 14, -46 + bob + Math.sin(t * 3 + 1) * 3);
    ctx.closePath();
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.fillRect(f.face * 5 + (f.face > 0 ? 1 : -4), -55 + bob, 3, 3);
    ctx.restore();
  }
}
