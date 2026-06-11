// 协议常量与收发工具(C↔S JSON 消息)

export const MAX_FRAME = 32 * 1024; // 单帧 32KB(军棋布阵约 1KB,余量充足)

// C→S 消息类型
export const C2S = {
  HELLO: 'hello',
  PING: 'ping',
  TABLE_CREATE: 'table.create',
  TABLE_JOIN: 'table.join',
  TABLE_LEAVE: 'table.leave',
  TABLE_SPECTATE: 'table.spectate',
  TABLE_UNSPECTATE: 'table.unspectate',
  TABLE_START: 'table.start',
  TABLE_RESTART: 'table.restart',
  GAME_MOVE: 'game.move',
  DISSOLVE_REQUEST: 'dissolve.request',
  DISSOLVE_VOTE: 'dissolve.vote',
};

// S→C 消息类型
export const S2C = {
  WELCOME: 'welcome',
  PONG: 'pong',
  LOBBY: 'lobby',
  TABLE_STATE: 'table.state',
  TABLE_LEFT: 'table.left',
  ERROR: 'error',
};

export const ERR = {
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  REPLACED: 'REPLACED',
  NOT_FOUND: 'NOT_FOUND',
  SEAT_TAKEN: 'SEAT_TAKEN',
  ALREADY_SEATED: 'ALREADY_SEATED',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ILLEGAL_MOVE: 'ILLEGAL_MOVE',
  STALE_STATE: 'STALE_STATE',
  BAD_PHASE: 'BAD_PHASE',
  NOT_HOST: 'NOT_HOST',
  TABLE_FULL: 'TABLE_FULL',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
};

export function safeParse(raw) {
  try {
    if (typeof raw !== 'string') raw = raw.toString('utf8');
    if (raw.length > MAX_FRAME) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

export function send(conn, obj) {
  const ws = conn?.ws || conn;
  if (!ws || ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* 发送失败由心跳清理 */
  }
}

export function sendError(conn, code, msg, reqId) {
  send(conn, { type: S2C.ERROR, code, msg: msg || code, ...(reqId ? { reqId } : {}) });
}
