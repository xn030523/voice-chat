// 回归测试:主动离桌不再被重连拉回(修复「象棋无法离开」「僵尸进行中牌桌」)
// 场景:A/B 开象棋对局 → A 离桌 → A 重连(模拟手机切后台)→ 不应自动回桌 →
//       A 经 reclaim 手动回桌 → A 再离桌 + B 离桌 → 桌应立即判解散
// 用法:node leave-regression-test.mjs(需 games-server 运行于 :3001)
import { AccessToken } from 'livekit-server-sdk';
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

async function makeToken(name) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: `${name}__rg${Math.random().toString(16).slice(2, 6)}`,
    name,
    ttl: '10m',
  });
  at.addGrant({ roomJoin: true, room: 'main', canPublishData: true });
  return at.toJwt();
}

const fail = (m) => { console.error('✗', m); process.exit(1); };
const ok = (m) => console.log('✓', m);

function client(name) {
  const ws = new WebSocket('ws://localhost:3001/');
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  return {
    ws,
    name,
    send: (o) => ws.send(JSON.stringify(o)),
    open: new Promise((r) => ws.on('open', r)),
    recv: (pred, label, timeout = 5000) =>
      new Promise((resolve, reject) => {
        const i = inbox.findIndex(pred);
        if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
        const entry = { pred, resolve: null };
        const t = setTimeout(() => {
          const idx = waiters.indexOf(entry);
          if (idx >= 0) waiters.splice(idx, 1); // 超时移除监听器,防吞后续消息
          reject(new Error(`超时:${label}`));
        }, timeout);
        entry.resolve = (m) => {
          clearTimeout(t);
          resolve(m);
        };
        waiters.push(entry);
      }),
  };
}

// 1) A/B 入座开局
const A = client('阿离');
const B = client('阿守');
await Promise.all([A.open, B.open]);
A.send({ type: 'hello', token: await makeToken('阿离') });
B.send({ type: 'hello', token: await makeToken('阿守') });
const [wA] = await Promise.all([
  A.recv((m) => m.type === 'welcome', 'A welcome'),
  B.recv((m) => m.type === 'welcome', 'B welcome'),
]);
A.send({ type: 'table.create', game: 'xiangqi' });
const st = await A.recv((m) => m.type === 'table.state', '建桌');
const tableId = st.tableId;
B.send({ type: 'table.join', tableId });
await A.recv((m) => m.type === 'table.state' && m.seats.filter(Boolean).length === 2, 'B 入座');
A.send({ type: 'table.start' });
await A.recv((m) => m.type === 'table.state' && m.phase === 'playing', '开局');
ok('象棋开局(playing)');

// 2) A 主动离桌
A.send({ type: 'table.leave' });
await A.recv((m) => m.type === 'table.left', 'A 离桌确认');
ok('A 主动离桌,收到 table.left');

// 3) A 断线重连(resumeKey)→ 核心断言:不被拉回牌桌
A.ws.close();
await new Promise((r) => setTimeout(r, 300));
const A2 = client('阿离2');
await A2.open;
A2.send({ type: 'hello', resumeKey: wA.resumeKey });
const w2 = await A2.recv((m) => m.type === 'welcome', 'A 重连 welcome');
if (w2.yourTable) fail(`重连后仍被拉回牌桌(yourTable=${w2.yourTable})—— bug 未修复`);
ok('重连后 yourTable=null(不再被拽回牌桌)');
const rec = (w2.reclaimable || []).find((r) => r.tableId === tableId);
if (!rec) fail('reclaimable 应包含该桌(提供手动回座入口)');
ok(`reclaimable 提供手动回座入口(${rec.gameName} seat${rec.seat})`);

// 等一拍:确认也没有 table.state 被推过来
let pushed = false;
try {
  await A2.recv((m) => m.type === 'table.state' && m.tableId === tableId, 'state 推送', 1500);
  pushed = true;
} catch { /* 预期超时 */ }
if (pushed) fail('离开后仍收到该桌广播');
ok('离开后不再收到该桌广播');

// 4) 手动回座(resume)
A2.send({ type: 'table.join', tableId, seat: rec.seat, reclaim: true });
const back = await A2.recv((m) => m.type === 'table.state' && m.tableId === tableId, '回座 state');
if (back.you.seat === null) fail('回座失败');
ok(`手动回座成功(seat${back.you.seat},对局继续)`);

// 5) A 再离开 + B 也离开 → 全员弃局 → 立即判解散(不再僵尸「进行中」)
A2.send({ type: 'table.leave' });
await A2.recv((m) => m.type === 'table.left', 'A 再离');
B.send({ type: 'table.leave' });
await B.recv((m) => m.type === 'table.left', 'B 离');
// 用观战视角验证桌已 ended
const C = client('观');
await C.open;
C.send({ type: 'hello', token: await makeToken('观') });
const wc = await C.recv((m) => m.type === 'welcome', 'C welcome');
const summary = (wc.tables || []).find((t) => t.id === tableId);
if (!summary) {
  ok('桌已被回收(可接受)');
} else if (summary.phase !== 'ended') {
  fail(`全员离开后桌仍为 ${summary.phase}(应为 ended)`);
} else {
  ok('全员离开 → 桌立即判解散(ended),不再挂「进行中」');
}

console.log('\n离桌回归测试全部通过 ✅');
process.exit(0);
