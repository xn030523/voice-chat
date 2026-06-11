// voice-games 独立游戏服务(与主聊天服务完全隔离 —— 本进程崩溃不影响语音/文字/共享)
// 端口 3001;Caddy: wss://tt.lsaini.com/games → localhost:3001(handle_path 已剥 /games 前缀)
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { safeParse, send, sendError, S2C, C2S, ERR } from './protocol.js';
import { verifyHello, sweepResumeKeys, authConfigured } from './auth.js';
import { Lobby } from './lobby.js';
import { GAMES } from './engines/index.js';

const PORT = Number(process.env.PORT || process.env.GAMES_PORT || 3001);
const HELLO_TIMEOUT_MS = 10 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const GC_MS = 30 * 1000;
const RATE_WINDOW_MS = 10 * 1000;
const RATE_MAX = 60;

if (!authConfigured) {
  console.error('[boot] 缺少 LiveKit 密钥(LIVEKIT_API_KEY/SECRET 或 API_KEY/SECRET),无法验签,退出');
  process.exit(1);
}

// ---------- 连接注册表 ----------
let nextConnSeq = 1;
const conns = new Set(); // 全部连接
const byIdentity = new Map(); // identity -> conn(已鉴权)

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ---------- 大厅与广播 ----------
function broadcastAll(payload) {
  for (const conn of byIdentity.values()) send(conn, payload);
}

function broadcastTable(table, events = []) {
  for (const identity of table.audienceIdentities()) {
    const conn = byIdentity.get(identity);
    if (conn) send(conn, table.buildStateFor(identity, events));
  }
}

const lobby = new Lobby(broadcastAll, (table, events) => {
  // 桌内异步变化(宽限超时/投票超时)回调
  broadcastTable(table, events);
  lobby.markDirty();
});

// ---------- 业务路由 ----------
function reclaimableFor(name) {
  const out = [];
  for (const t of lobby.tables.values()) {
    if (t.phase === 'ended') continue;
    t.seats.forEach((s, i) => {
      if (s && !s.connected && s.name === name) {
        out.push({ tableId: t.id, seat: i, game: t.gameId, gameName: t.engine.meta.name });
      }
    });
  }
  return out;
}

async function handleHello(conn, msg) {
  const res = await verifyHello(msg);
  if (res.error) {
    sendError(conn, res.error, res.error === ERR.AUTH_EXPIRED ? '登录凭证已过期,请重新进入房间后再打开游戏' : '鉴权失败');
    conn.ws.close(4401, res.error);
    return;
  }
  clearTimeout(conn.helloTimer);
  conn.identity = res.identity;
  conn.name = res.name;
  conn.authed = true;

  // 同 identity 旧连接 → 顶替
  const old = byIdentity.get(res.identity);
  if (old && old !== conn) {
    sendError(old, ERR.REPLACED, '你在其他页面打开了游戏,本连接已断开');
    try {
      old.ws.close(4409, 'REPLACED');
    } catch { /* ignore */ }
  }
  byIdentity.set(res.identity, conn);

  // 重连复位:若在座 → 取消宽限并广播
  const myTable = lobby.tableOf(res.identity);
  if (myTable) {
    const cameBack = myTable.onReconnect(res.identity);
    if (cameBack) broadcastTable(myTable, [{ kind: 'reconnected', name: res.name }]);
  }

  send(conn, {
    type: S2C.WELCOME,
    identity: res.identity,
    name: res.name,
    resumeKey: res.resumeKey,
    games: GAMES,
    tables: lobby.summaries(),
    reclaimable: myTable ? [] : reclaimableFor(res.name),
    yourTable: myTable ? myTable.id : null,
  });
  // 在座者补发全量桌面
  if (myTable) send(conn, myTable.buildStateFor(res.identity, []));
  log(`conn#${conn.id}`, res.identity, 'hello ok');
}

function requireTable(conn, tableId) {
  const t = lobby.get(tableId);
  if (!t) {
    sendError(conn, ERR.NOT_FOUND, '牌桌不存在或已解散');
    return null;
  }
  return t;
}

function route(conn, msg) {
  const { type } = msg;
  if (type === C2S.PING) {
    send(conn, { type: S2C.PONG });
    return;
  }
  if (!conn.authed) {
    sendError(conn, ERR.AUTH_FAILED, '请先完成鉴权');
    return;
  }

  switch (type) {
    case C2S.TABLE_CREATE: {
      if (lobby.tableOf(conn.identity)) {
        sendError(conn, ERR.ALREADY_SEATED, '你已在一张牌桌上,请先离开');
        return;
      }
      // 创建前自动退出观战
      const watching = lobby.spectatingTable(conn.identity);
      if (watching) {
        watching.spectators.delete(conn.identity);
        broadcastTable(watching);
      }
      const { table, error } = lobby.create(String(msg.game || ''), { identity: conn.identity, name: conn.name });
      if (error) {
        sendError(conn, error.code, error.msg);
        return;
      }
      broadcastTable(table, [{ kind: 'created' }]);
      log(`conn#${conn.id}`, conn.identity, 'table.create', table.id, table.gameId);
      return;
    }

    case C2S.TABLE_JOIN: {
      const t = requireTable(conn, msg.tableId);
      if (!t) return;
      const seated = lobby.tableOf(conn.identity);
      if (seated && seated !== t) {
        sendError(conn, ERR.ALREADY_SEATED, '你已在其他牌桌上,请先离开');
        return;
      }
      const watching = lobby.spectatingTable(conn.identity);
      const res = t.join(conn.identity, conn.name, msg.seat, !!msg.reclaim);
      if (res.error) {
        sendError(conn, res.error.code, res.error.msg);
        return;
      }
      if (watching && watching !== t) {
        watching.spectators.delete(conn.identity);
        broadcastTable(watching);
      }
      broadcastTable(t, [{ kind: 'seated', seat: res.seat, name: conn.name }]);
      lobby.markDirty();
      log(`conn#${conn.id}`, conn.identity, 'table.join', t.id, `seat${res.seat}`, msg.reclaim ? '(reclaim)' : '');
      return;
    }

    case C2S.TABLE_LEAVE: {
      const t = lobby.tableOf(conn.identity) || lobby.spectatingTable(conn.identity);
      if (!t) {
        sendError(conn, ERR.NOT_FOUND, '你不在任何牌桌上');
        return;
      }
      t.leave(conn.identity);
      send(conn, { type: S2C.TABLE_LEFT, tableId: t.id, reason: 'left' });
      broadcastTable(t, [{ kind: 'left', name: conn.name }]);
      lobby.markDirty();
      return;
    }

    case C2S.TABLE_SPECTATE: {
      const t = requireTable(conn, msg.tableId);
      if (!t) return;
      if (lobby.tableOf(conn.identity)) {
        sendError(conn, ERR.ALREADY_SEATED, '你已在座,不能观战其他牌桌');
        return;
      }
      const prev = lobby.spectatingTable(conn.identity);
      if (prev && prev !== t) {
        prev.spectators.delete(conn.identity);
        broadcastTable(prev);
      }
      t.spectators.set(conn.identity, conn.name);
      t.touch();
      broadcastTable(t, [{ kind: 'spectate', name: conn.name }]);
      lobby.markDirty();
      return;
    }

    case C2S.TABLE_UNSPECTATE: {
      const t = lobby.spectatingTable(conn.identity);
      if (t) {
        t.spectators.delete(conn.identity);
        send(conn, { type: S2C.TABLE_LEFT, tableId: t.id, reason: 'left' });
        broadcastTable(t);
        lobby.markDirty();
      }
      return;
    }

    case C2S.TABLE_START:
    case C2S.TABLE_RESTART: {
      const t = lobby.tableOf(conn.identity);
      if (!t) {
        sendError(conn, ERR.NOT_FOUND, '你不在任何牌桌上');
        return;
      }
      const res = type === C2S.TABLE_START ? t.start(conn.identity) : t.restart(conn.identity);
      if (res.error) {
        sendError(conn, res.error.code, res.error.msg);
        return;
      }
      broadcastTable(t, res.events || []);
      lobby.markDirty();
      log(`conn#${conn.id}`, conn.identity, type, t.id);
      return;
    }

    case C2S.GAME_MOVE: {
      const t = requireTable(conn, msg.tableId);
      if (!t) return;
      const res = t.move(conn.identity, msg.version, msg.move);
      if (res.error) {
        sendError(conn, res.error.code, res.error.msg, msg.reqId);
        return;
      }
      log(`conn#${conn.id}`, conn.identity, 'game.move', t.id, JSON.stringify(msg.move).slice(0, 120));
      broadcastTable(t, res.events || []);
      if (t.phase === 'ended') lobby.markDirty();
      return;
    }

    case C2S.DISSOLVE_REQUEST:
    case C2S.DISSOLVE_VOTE: {
      const t = lobby.tableOf(conn.identity);
      if (!t) {
        sendError(conn, ERR.NOT_FOUND, '你不在任何牌桌上');
        return;
      }
      const res =
        type === C2S.DISSOLVE_REQUEST ? t.requestDissolve(conn.identity) : t.voteDissolve(conn.identity, !!msg.agree);
      if (res.error) {
        sendError(conn, res.error.code, res.error.msg);
        return;
      }
      broadcastTable(t, res.events || []);
      if (res.ended) lobby.markDirty();
      return;
    }

    default:
      sendError(conn, ERR.NOT_FOUND, `未知消息类型:${type}`);
  }
}

// ---------- HTTP + WS ----------
const httpServer = createServer((req, res) => {
  // Caddy handle_path 已剥 /games 前缀;也兼容直连 /healthz
  if (req.url === '/healthz' || req.url?.endsWith('/healthz')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tables: lobby.tables.size, conns: byIdentity.size }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

httpServer.on('upgrade', (req, socket, head) => {
  // 不校验 path(Caddy 剥前缀后为 /,本地直连任意)
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const conn = {
    id: nextConnSeq++,
    ws,
    identity: null,
    name: null,
    authed: false,
    alive: true,
    helloTimer: null,
    bucket: { count: 0, windowStart: Date.now(), strikes: 0 },
  };
  conns.add(conn);

  // 10s 内未 hello → 静默清理(容忍 StrictMode 速断)
  conn.helloTimer = setTimeout(() => {
    if (!conn.authed) {
      try {
        ws.close(4401, 'HELLO_TIMEOUT');
      } catch { /* ignore */ }
    }
  }, HELLO_TIMEOUT_MS);

  ws.on('pong', () => {
    conn.alive = true;
  });

  ws.on('message', (raw) => {
    // 限流
    const now = Date.now();
    if (now - conn.bucket.windowStart > RATE_WINDOW_MS) {
      conn.bucket.windowStart = now;
      conn.bucket.count = 0;
      conn.bucket.strikes = Math.max(0, conn.bucket.strikes - 1);
    }
    if (++conn.bucket.count > RATE_MAX) {
      if (conn.bucket.count === RATE_MAX + 1) {
        sendError(conn, ERR.RATE_LIMITED, '操作过于频繁,请稍后再试');
        if (++conn.bucket.strikes >= 3) {
          try {
            ws.close(4429, 'RATE_LIMITED');
          } catch { /* ignore */ }
        }
      }
      return;
    }

    const msg = safeParse(raw);
    if (!msg) {
      sendError(conn, ERR.INTERNAL, '消息格式错误');
      return;
    }
    // 永不裂:任何处理异常只打日志 + 回错误,绝不让进程崩
    try {
      if (msg.type === C2S.HELLO) {
        handleHello(conn, msg).catch((e) => {
          log('hello error', e?.message || e);
          sendError(conn, ERR.INTERNAL, '服务内部错误');
        });
      } else {
        route(conn, msg);
      }
    } catch (e) {
      log(`conn#${conn.id}`, conn.identity, 'route error', msg.type, e?.stack || e);
      sendError(conn, ERR.INTERNAL, '服务内部错误');
    }
  });

  ws.on('close', () => {
    clearTimeout(conn.helloTimer);
    conns.delete(conn);
    if (conn.identity && byIdentity.get(conn.identity) === conn) {
      byIdentity.delete(conn.identity);
      try {
        const t = lobby.tableOf(conn.identity);
        if (t) {
          const changed = t.onDisconnect(conn.identity);
          if (changed) {
            broadcastTable(t, [{ kind: 'offline', name: conn.name }]);
            lobby.markDirty();
          }
        } else {
          const w = lobby.spectatingTable(conn.identity);
          if (w) {
            w.spectators.delete(conn.identity);
            broadcastTable(w);
            lobby.markDirty();
          }
        }
      } catch (e) {
        log('close handling error', e?.stack || e);
      }
      log(`conn#${conn.id}`, conn.identity, 'closed');
    }
  });

  ws.on('error', () => {
    /* close 事件统一处理 */
  });
});

// ---------- 心跳与 GC ----------
setInterval(() => {
  for (const conn of conns) {
    if (!conn.alive) {
      try {
        conn.ws.terminate();
      } catch { /* ignore */ }
      continue;
    }
    conn.alive = false;
    try {
      conn.ws.ping();
    } catch { /* ignore */ }
  }
}, HEARTBEAT_MS).unref();

setInterval(() => {
  try {
    const removed = lobby.sweep();
    for (const t of removed) {
      // 通知残留受众(理论上为空)
      for (const identity of t.audienceIdentities()) {
        const conn = byIdentity.get(identity);
        if (conn) send(conn, { type: S2C.TABLE_LEFT, tableId: t.id, reason: 'gc' });
      }
      log('gc table', t.id, t.gameId);
    }
    sweepResumeKeys();
  } catch (e) {
    log('gc error', e?.stack || e);
  }
}, GC_MS).unref();

// ---------- 进程级兜底 ----------
process.on('unhandledRejection', (e) => {
  log('unhandledRejection', e?.stack || e);
});
process.on('uncaughtException', (e) => {
  // 状态已不可信:记日志退出,由 systemd Restart=always 拉起(无持久化,丢局可接受)
  log('uncaughtException', e?.stack || e);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  log(`voice-games ready on :${PORT}  (healthz: /healthz, games: ${GAMES.map((g) => g.id).join(',')})`);
});
