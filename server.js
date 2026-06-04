const { createServer } = require('http');
const { parse } = require('url');
const { randomUUID } = require('crypto');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  // ws -> { id, name }
  const clients = new Map();
  // 同一时间只允许一个人共享屏幕
  let sharerId = null;

  const send = (ws, msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (except, msg) => {
    for (const ws of clients.keys()) {
      if (ws !== except) send(ws, msg);
    }
  };

  const findById = (id) => {
    for (const [ws, info] of clients) if (info.id === id) return ws;
    return null;
  };

  wss.on('connection', (ws) => {
    clients.set(ws, { id: randomUUID(), name: null });
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const me = clients.get(ws);
      if (!me) return;

      switch (msg.type) {
        case 'join': {
          me.name = String(msg.name || 'Guest').trim().slice(0, 32) || 'Guest';
          const peers = [];
          for (const [other, info] of clients) {
            if (other !== ws && info.name) peers.push({ id: info.id, name: info.name });
          }
          send(ws, { type: 'self', id: me.id });
          send(ws, { type: 'peers', peers });
          send(ws, { type: 'share-state', sharerId });
          broadcast(ws, { type: 'peer-joined', id: me.id, name: me.name });
          break;
        }
        case 'signal': {
          const target = findById(msg.to);
          if (target) send(target, { type: 'signal', from: me.id, data: msg.data });
          break;
        }
        case 'share-start': {
          if (sharerId && sharerId !== me.id) {
            send(ws, { type: 'share-denied' });
          } else {
            sharerId = me.id;
            broadcast(null, { type: 'share-state', sharerId });
          }
          break;
        }
        case 'share-stop': {
          if (sharerId === me.id) {
            sharerId = null;
            broadcast(null, { type: 'share-state', sharerId: null });
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      const me = clients.get(ws);
      clients.delete(ws);
      if (me) {
        if (sharerId === me.id) {
          sharerId = null;
          broadcast(null, { type: 'share-state', sharerId: null });
        }
        if (me.name) broadcast(null, { type: 'peer-left', id: me.id });
      }
    });
  });

  // 心跳：定期探测，回收已经掉线但未正常关闭的连接
  const heartbeat = setInterval(() => {
    for (const ws of clients.keys()) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}  (ws: /ws)`);
  });
});
