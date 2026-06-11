const { createServer } = require('http');
const { parse } = require('url');
const { randomUUID } = require('crypto');
const next = require('next');
const { AccessToken } = require('livekit-server-sdk');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

// 签发 LiveKit 入会令牌
async function handleToken(req, res, query) {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return sendJson(res, 500, { error: 'LiveKit 未配置（缺少 LIVEKIT_URL/KEY/SECRET）' });
  }
  const room = String(query.room || 'main').trim().slice(0, 64) || 'main';
  const name = String(query.name || 'Guest').trim().slice(0, 32) || 'Guest';
  const identity = `${name}__${randomUUID().slice(0, 8)}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: '6h',
  });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();
  return sendJson(res, 200, { token, url: LIVEKIT_URL, identity, room });
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsed = parse(req.url, true);
    if (parsed.pathname === '/token') {
      try {
        await handleToken(req, res, parsed.query);
      } catch (err) {
        console.error('[token] 签发失败', err);
        sendJson(res, 500, { error: '令牌签发失败' });
      }
      return;
    }
    if (parsed.pathname === '/healthz') {
      return sendJson(res, 200, { ok: true });
    }
    handle(req, res, parsed);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}  (livekit token: /token)`);
  });
});
