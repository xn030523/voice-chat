// 鉴权:验证客户端递交的 LiveKit JWT(同一身份贯通语音与游戏),并维护 resumeKey 注册表
// 解决两个问题:① token TTL=6h,长局/重连后 JWT 过期;② 凭 resumeKey 复位身份无需重新验签
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { TokenVerifier } from 'livekit-server-sdk';

const RESUME_TTL_MS = 2 * 60 * 60 * 1000; // resumeKey 2h 未活跃清理

// 开发态兜底:仓库根 .env 手写解析(零依赖;生产由 systemd EnvironmentFile 注入)
function loadDevEnv() {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const text = readFileSync(join(root, '.env'), 'utf8');
    const out = {};
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function resolveKeys() {
  // 47.77 上 /opt/livekit/keys.env 变量名是 API_KEY/API_SECRET(无 LIVEKIT_ 前缀),双名兼容
  let key = process.env.LIVEKIT_API_KEY || process.env.API_KEY;
  let secret = process.env.LIVEKIT_API_SECRET || process.env.API_SECRET;
  if (!key || !secret) {
    const env = loadDevEnv();
    key = key || env.LIVEKIT_API_KEY || env.API_KEY;
    secret = secret || env.LIVEKIT_API_SECRET || env.API_SECRET;
  }
  return { key, secret };
}

const { key: API_KEY, secret: API_SECRET } = resolveKeys();
export const authConfigured = !!(API_KEY && API_SECRET);
const verifier = authConfigured ? new TokenVerifier(API_KEY, API_SECRET) : null;

// resumeKey → { identity, name, lastSeen }
const resumeRegistry = new Map();

export function issueResumeKey(identity, name) {
  const key = randomBytes(16).toString('hex');
  resumeRegistry.set(key, { identity, name, lastSeen: Date.now() });
  return key;
}

export function touchResumeKey(key) {
  const rec = resumeRegistry.get(key);
  if (rec) rec.lastSeen = Date.now();
}

export function sweepResumeKeys(now = Date.now()) {
  for (const [k, rec] of resumeRegistry) {
    if (now - rec.lastSeen > RESUME_TTL_MS) resumeRegistry.delete(k);
  }
}

/**
 * 验证 hello 消息 → { identity, name, resumeKey } 或 { error: 'AUTH_FAILED'|'AUTH_EXPIRED' }
 * 优先 resumeKey(token 过期也放行);否则验 LiveKit JWT。
 */
export async function verifyHello(msg) {
  // 1) resumeKey 命中存活会话 → 直接复位
  if (msg.resumeKey && typeof msg.resumeKey === 'string') {
    const rec = resumeRegistry.get(msg.resumeKey);
    if (rec) {
      rec.lastSeen = Date.now();
      return { identity: rec.identity, name: rec.name, resumeKey: msg.resumeKey };
    }
    // resumeKey 失效但带了 token → 继续走 token 验签
  }

  // 2) LiveKit JWT 验签
  const token = msg.token;
  if (!token || typeof token !== 'string' || !verifier) {
    return { error: 'AUTH_FAILED' };
  }
  let claims;
  try {
    claims = await verifier.verify(token);
  } catch (e) {
    const expired = /expired|exp/i.test(String(e?.message || e));
    return { error: expired ? 'AUTH_EXPIRED' : 'AUTH_FAILED' };
  }
  const identity = claims?.sub;
  if (!identity) return { error: 'AUTH_FAILED' };
  const name = claims?.name || String(identity).split('__')[0] || identity;
  // room ≠ main 仅记日志不拒绝(前向兼容多房间)
  const room = claims?.video?.room;
  if (room && room !== 'main') {
    console.log(`[auth] identity=${identity} room=${room} (非 main,放行)`);
  }
  return { identity, name, resumeKey: issueResumeKey(identity, name) };
}
