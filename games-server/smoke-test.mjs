// 协议冒烟测试:两个 WS 客户端用真实 LiveKit token 完整走一遍
// hello → welcome → table.create → table.join → table.start → 五子棋对弈到胜负 → restart
// 用法:node smoke-test.mjs(需 games-server 已在 :3001 运行)
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
    identity: `${name}__test${Math.random().toString(16).slice(2, 6)}`,
    name,
    ttl: '10m',
  });
  at.addGrant({ roomJoin: true, room: 'main', canPublishData: true });
  return at.toJwt();
}

function client(name) {
  const ws = new WebSocket('ws://localhost:3001/');
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const w = waiters.findIndex((f) => f.pred(m));
    if (w >= 0) waiters.splice(w, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const recv = (pred, label, timeout = 4000) =>
    new Promise((resolve, reject) => {
      const i = inbox.findIndex(pred);
      if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
      const t = setTimeout(() => reject(new Error(`等待超时: ${label}`)), timeout);
      waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
    });
  const send = (obj) => ws.send(JSON.stringify(obj));
  const open = new Promise((r) => ws.on('open', r));
  return { ws, send, recv, open, name };
}

const fail = (msg) => { console.error('✗', msg); process.exit(1); };
const ok = (msg) => console.log('✓', msg);

const A = client('小明');
const B = client('小红');
await Promise.all([A.open, B.open]);

// 1. 鉴权
A.send({ type: 'hello', token: await makeToken('小明') });
B.send({ type: 'hello', token: await makeToken('小红') });
const [wA, wB] = await Promise.all([
  A.recv((m) => m.type === 'welcome', 'A welcome'),
  B.recv((m) => m.type === 'welcome', 'B welcome'),
]);
if (!wA.resumeKey || !wA.games?.length) fail('welcome 缺字段');
ok(`鉴权:A=${wA.identity} B=${wB.identity},游戏列表=${wA.games.map((g) => g.name).join('/')}`);

// 2. 坏 token 拒绝
const C = client('坏人');
await C.open;
C.send({ type: 'hello', token: 'not-a-jwt' });
const errC = await C.recv((m) => m.type === 'error', 'C auth error');
if (errC.code !== 'AUTH_FAILED') fail(`坏 token 应 AUTH_FAILED,得到 ${errC.code}`);
ok('坏 token 被拒');

// 3. 建桌 + 加入
A.send({ type: 'table.create', game: 'gomoku' });
const stA = await A.recv((m) => m.type === 'table.state', 'A 建桌 state');
if (stA.you.seat !== 0 || stA.phase !== 'waiting') fail('建桌后应坐 0 号位 waiting');
const tableId = stA.tableId;
B.send({ type: 'table.join', tableId });
await B.recv((m) => m.type === 'table.state' && m.you.seat === 1, 'B 入座 state');
ok('B 坐 1 号位');
// 大厅广播:B 应能在 lobby 摘要中看到这张桌(不假设服务器为空)
const lobbyB = await B.recv((m) => m.type === 'lobby' && m.tables.some((t) => t.id === tableId), 'B 大厅含本桌');
ok(`大厅广播可见本桌(共 ${lobbyB.tables.length} 桌)`);

// 4. 非房主开局拒;房主开局
B.send({ type: 'table.start' });
const errStart = await B.recv((m) => m.type === 'error', 'B start 被拒');
if (errStart.code !== 'NOT_HOST') fail(`非房主应 NOT_HOST,得到 ${errStart.code}`);
A.send({ type: 'table.start' });
const [pA, pB] = await Promise.all([
  A.recv((m) => m.type === 'table.state' && m.phase === 'playing', 'A playing'),
  B.recv((m) => m.type === 'table.state' && m.phase === 'playing', 'B playing'),
]);
if (pA.turn !== pB.turn) fail('双方 turn 不一致');
ok(`开局成功,先手 seat${pA.turn}(黑)`);

// 5. 对弈:先手横向五连胜;后手错回合/占位测试
const first = pA.turn;
const second = 1 - first;
const FC = [first === 0 ? A : B, first === 0 ? B : A]; // FC[0]=先手客户端
let version = pA.version;

// 非回合方落子 → NOT_YOUR_TURN
FC[1].send({ type: 'game.move', tableId, version, move: { x: 9, y: 9 } });
const errTurn = await FC[1].recv((m) => m.type === 'error', '非回合拒');
if (errTurn.code !== 'NOT_YOUR_TURN') fail(`应 NOT_YOUR_TURN,得到 ${errTurn.code}`);
ok('非回合落子被拒');

// 过期 version → STALE_STATE
FC[0].send({ type: 'game.move', tableId, version: version - 1, move: { x: 0, y: 0 } });
const errStale = await FC[0].recv((m) => m.type === 'error', 'stale 拒');
if (errStale.code !== 'STALE_STATE') fail(`应 STALE_STATE,得到 ${errStale.code}`);
ok('过期 version 被拒');

// 轮流落子:先手 (0..4, 7) 五连;后手 (0..3, 0)
async function place(cli, x, y) {
  cli.send({ type: 'game.move', tableId, version, move: { x, y } });
  const st = await cli.recv((m) => m.type === 'table.state' && m.version > version, `落子(${x},${y})`);
  version = st.version;
  return st;
}
let last;
for (let i = 0; i < 4; i++) {
  await place(FC[0], i, 7);
  await FC[1].recv((m) => m.type === 'table.state' && m.version === version, '同步');
  await place(FC[1], i, 0);
  await FC[0].recv((m) => m.type === 'table.state' && m.version === version, '同步');
}
last = await place(FC[0], 4, 7);
if (last.phase !== 'ended' || last.result?.winner !== first) fail(`先手应胜,got phase=${last.phase} result=${JSON.stringify(last.result)}`);
if (!last.events.some((e) => e.kind === 'win')) fail('缺 win 事件');
ok(`五连获胜,winner=seat${last.result.winner}(${last.result.winnerName}),events 含 win`);

// 6. 再来一局(房主)
A.send({ type: 'table.restart' });
const re = await A.recv((m) => m.type === 'table.state' && m.phase === 'playing', '重开');
if (re.version <= version) fail('重开 version 应递增');
ok('再来一局成功(直接重开对局)');

// 7. 解散投票:B 发起,A 同意 → ended
B.send({ type: 'dissolve.request' });
const dv = await A.recv((m) => m.type === 'table.state' && m.dissolve, 'A 收到解散请求');
ok(`B 发起解散(requesterSeat=${dv.dissolve.requesterSeat})`);
A.send({ type: 'dissolve.vote', agree: true });
const dissolved = await B.recv((m) => m.type === 'table.state' && m.phase === 'ended' && m.result?.reason === 'dissolved', '解散通过');
ok('全员同意 → 对局解散');

// 8. resumeKey 重连
const A2 = client('小明2');
await A2.open;
A2.send({ type: 'hello', resumeKey: wA.resumeKey });
const wA2 = await A2.recv((m) => m.type === 'welcome', 'A2 resume welcome');
if (wA2.identity !== wA.identity) fail('resumeKey 应复位同一 identity');
const replaced = await A.recv((m) => m.type === 'error' && m.code === 'REPLACED', 'A 被顶替');
ok('resumeKey 复位身份 + 旧连接被顶替');

console.log('\n全部冒烟用例通过 ✅');
process.exit(0);
