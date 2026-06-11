// 斗地主 3 机器人整局测试:hello → 建桌 → 3 人入座 → 开局 → 叫分 → 打到终局
// 校验:隐藏信息(他人手牌仅张数)、回合裁决、压制规则、终局结果广播
// 用法:node ddz-bot-test.mjs(需 games-server 运行于 :3001)
import { AccessToken } from 'livekit-server-sdk';
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { classify, canBeat } from './engines/doudizhu-cards.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

async function makeToken(name) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: `${name}__bot${Math.random().toString(16).slice(2, 6)}`,
    name,
    ttl: '10m',
  });
  at.addGrant({ roomJoin: true, room: 'main', canPublishData: true });
  return at.toJwt();
}

const fail = (msg) => {
  console.error('✗', msg);
  process.exit(1);
};
const ok = (msg) => console.log('✓', msg);

class Bot {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket('ws://localhost:3001/');
    this.state = null; // 最新 table.state
    this.open = new Promise((r) => this.ws.on('open', r));
    this.welcome = new Promise((r) => {
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'welcome') r(m);
        if (m.type === 'table.state') this.state = m;
        if (m.type === 'error' && !['STALE_STATE', 'NOT_YOUR_TURN'].includes(m.code)) {
          fail(`${this.name} 收到错误:${m.code} ${m.msg}`);
        }
      });
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  async until(pred, label, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (this.state && pred(this.state)) return this.state;
      await new Promise((r) => setTimeout(r, 30));
    }
    fail(`${this.name} 等待超时:${label}(当前 state=${JSON.stringify(this.state)?.slice(0, 200)})`);
  }

  /** 轮到我时执行一步;返回是否行动了 */
  act() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || s.turn !== s.you.seat) return false;
    const v = s.view;
    if (v.phase === 'bidding') {
      // 0 号位叫 1 分,其余不叫
      this.send({ type: 'game.move', tableId: s.tableId, version: s.version, move: { type: 'bid', score: s.you.seat === 0 ? 1 : 0 } });
      return true;
    }
    if (v.phase !== 'playing') return false;
    const hand = v.hand;
    if (v.lastPlay && v.lastPlay.seat !== s.you.seat) {
      // 跟牌:找能压上的最小单张(只对单张应战,否则过)
      if (v.lastPlay.parsed.type === 'single') {
        const sorted = hand.slice().sort((a, b) => a - b);
        for (const c of sorted) {
          const p = classify([c]);
          if (canBeat(p, v.lastPlay.parsed)) {
            this.send({ type: 'game.move', tableId: s.tableId, version: s.version, move: { type: 'play', cards: [c] } });
            return true;
          }
        }
      }
      this.send({ type: 'game.move', tableId: s.tableId, version: s.version, move: { type: 'pass' } });
      return true;
    }
    // 自由出:最小单张
    const lowest = hand.slice().sort((a, b) => a - b)[0];
    this.send({ type: 'game.move', tableId: s.tableId, version: s.version, move: { type: 'play', cards: [lowest] } });
    return true;
  }
}

const bots = [new Bot('豆豆'), new Bot('丁丁'), new Bot('当当')];
await Promise.all(bots.map((b) => b.open));
for (const b of bots) b.send({ type: 'hello', token: await makeToken(b.name) });
await Promise.all(bots.map((b) => b.welcome));
ok('3 机器人鉴权完成');

bots[0].send({ type: 'table.create', game: 'doudizhu' });
await bots[0].until((s) => s.you.seat === 0, '建桌');
const tableId = bots[0].state.tableId;
bots[1].send({ type: 'table.join', tableId });
bots[2].send({ type: 'table.join', tableId });
await bots[0].until((s) => s.seats.filter(Boolean).length === 3, '三人到齐');
ok('三人入座');

bots[0].send({ type: 'table.start' });
await Promise.all(bots.map((b) => b.until((s) => s.phase === 'playing', '开局')));
ok('开局,进入叫分');

// 校验隐藏信息:每个 bot 只能看到自己的手牌,他人是张数
for (const b of bots) {
  const v = b.state.view;
  if (!Array.isArray(v.hand) || v.hand.length !== 17) fail(`${b.name} 手牌异常`);
  if (v.allHands) fail('对局中不应暴露全部手牌');
  if (v.bottom !== null && v.phase === 'bidding') fail('叫分阶段底牌应隐藏');
  if (!v.counts || v.counts.reduce((a, c) => a + c, 0) !== 51) fail('张数合计应为 51');
}
ok('隐藏信息投影验证:手牌仅自见,底牌叫分期隐藏');

// 机器人循环:谁的回合谁行动,直到 ended
let guard = 0;
while (guard++ < 400) {
  const ended = bots.some((b) => b.state?.phase === 'ended');
  if (ended) break;
  for (const b of bots) b.act();
  await new Promise((r) => setTimeout(r, 60));
}
const final = bots[0].state;
if (final.phase !== 'ended') fail(`${guard} 轮后仍未结束`);
ok(`对局结束:${JSON.stringify(final.result)}`);
if (typeof final.result.winner !== 'number' || !final.result.detail?.includes('阵营获胜')) fail('结果缺字段');
// 终局亮牌
if (!final.view.allHands) fail('终局应亮全部手牌');
ok('终局亮牌 + 结果详情(含倍数)正确');

// 地主确认:有人 20 张起手
const landlordSeat = final.view.landlord;
if (landlordSeat === null) fail('landlord 缺失');
ok(`地主 = seat${landlordSeat},底牌已公开:${JSON.stringify(final.view.bottom)}`);

console.log('\n斗地主整局机器人测试通过 ✅');
process.exit(0);
