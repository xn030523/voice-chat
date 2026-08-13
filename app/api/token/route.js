import { randomUUID } from 'crypto';
import { AccessToken } from 'livekit-server-sdk';

export const dynamic = 'force-dynamic';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

export async function GET(request) {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return Response.json(
      { error: 'LiveKit 未配置（缺少 LIVEKIT_URL/KEY/SECRET）' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const room = String(searchParams.get('room') || 'main').trim().slice(0, 64) || 'main';
  const name = String(searchParams.get('name') || 'Guest').trim().slice(0, 32) || 'Guest';
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

  return Response.json(
    { token, url: LIVEKIT_URL, identity, room },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
