'use client';

// 游戏子系统客户端 hook —— 与 useVoiceChat 完全独立的 WS 连接
// 关键性质:
//  - 懒连接:enabled=true(用户首次打开游戏面板)才建立连接,平时零开销
//  - 游戏服务不可用只影响本面板,语音/聊天(LiveKit)毫无关联
//  - StrictMode 双调防护:generation 计数守卫
//  - resumeKey 存 sessionStorage:页面刷新后无缝复位身份与座位
import { useCallback, useEffect, useRef, useState } from 'react';

const RESUME_KEY_STORAGE = 'voice-games:resumeKey';
const PING_INTERVAL_MS = 25 * 1000; // 防 Caddy 空闲超时
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15 * 1000;

function resolveWsUrl() {
  if (process.env.NEXT_PUBLIC_GAMES_WS_URL) return process.env.NEXT_PUBLIC_GAMES_WS_URL;
  if (typeof location === 'undefined') return null;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return local ? 'ws://localhost:3001' : 'wss://tt.lsaini.com/games';
}

function readResumeKey() {
  try {
    return sessionStorage.getItem(RESUME_KEY_STORAGE) || null;
  } catch {
    return null;
  }
}

function writeResumeKey(key) {
  try {
    if (key) sessionStorage.setItem(RESUME_KEY_STORAGE, key);
    else sessionStorage.removeItem(RESUME_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function useGames({ enabled, authToken }) {
  const [status, setStatus] = useState('idle'); // idle|connecting|connected|unavailable|replaced|authExpired
  const [games, setGames] = useState([]); // 引擎元数据
  const [tables, setTables] = useState([]); // 大厅摘要
  const [activeTable, setActiveTable] = useState(null); // 最新 table.state(唯一对局真相,整体替换)
  const [reclaimable, setReclaimable] = useState([]);
  const [lastError, setLastError] = useState(null); // {code,msg,ts}
  const [identity, setIdentity] = useState(null);

  const wsRef = useRef(null);
  const genRef = useRef(0);
  const sendRef = useRef(() => false);

  useEffect(() => {
    if (!enabled || !authToken) {
      setStatus('idle');
      return undefined;
    }
    const gen = ++genRef.current;
    const alive = () => genRef.current === gen;
    let ws = null;
    let retryTimer = null;
    let pingTimer = null;
    let attempts = 0;
    let stopped = false;

    const cleanupSocket = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
        wsRef.current = null;
      }
    };

    const scheduleRetry = () => {
      if (!alive() || stopped) return;
      setStatus('unavailable');
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS);
      attempts += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const handleMessage = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'welcome':
          attempts = 0;
          setStatus('connected');
          setIdentity(msg.identity);
          setGames(msg.games || []);
          setTables(msg.tables || []);
          setReclaimable(msg.reclaimable || []);
          writeResumeKey(msg.resumeKey);
          if (!msg.yourTable) setActiveTable(null);
          break;
        case 'lobby':
          setTables(msg.tables || []);
          break;
        case 'table.state':
          setActiveTable(msg);
          break;
        case 'table.left':
          setActiveTable((prev) => (prev && prev.tableId === msg.tableId ? null : prev));
          break;
        case 'pong':
          break;
        case 'error':
          if (msg.code === 'REPLACED') {
            stopped = true;
            setStatus('replaced');
            cleanupSocket();
            return;
          }
          if (msg.code === 'AUTH_EXPIRED' || msg.code === 'AUTH_FAILED') {
            // resumeKey 失效:清掉换 token 重连一次;token 也过期 → authExpired
            writeResumeKey(null);
            setStatus('authExpired');
            return;
          }
          setLastError({ code: msg.code, msg: msg.msg, ts: Date.now() });
          break;
        default:
          break;
      }
    };

    const connect = () => {
      if (!alive() || stopped) return;
      const url = resolveWsUrl();
      if (!url) return;
      // 首次连接显示 connecting;重试期间保持 unavailable(避免状态闪烁,用户看到稳定的「不可用,重试中」)
      setStatus((s) => (s === 'connected' || s === 'unavailable' ? s : 'connecting'));
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive()) return;
        const resumeKey = readResumeKey();
        ws.send(JSON.stringify({ type: 'hello', token: authToken, ...(resumeKey ? { resumeKey } : {}) }));
        pingTimer = setInterval(() => {
          try {
            ws?.send(JSON.stringify({ type: 'ping' }));
          } catch {
            /* ignore */
          }
        }, PING_INTERVAL_MS);
      };
      ws.onmessage = (ev) => {
        if (alive()) handleMessage(ev.data);
      };
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        wsRef.current = null;
        scheduleRetry();
      };
      ws.onerror = () => {
        /* onclose 统一处理 */
      };
    };

    connect();

    return () => {
      stopped = true;
      genRef.current++;
      if (retryTimer) clearTimeout(retryTimer);
      cleanupSocket();
    };
  }, [enabled, authToken]);

  const sendMsg = useCallback((obj) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      setLastError({ code: 'OFFLINE', msg: '连接已断开,正在重连,请稍后再试', ts: Date.now() });
      return false;
    }
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      setLastError({ code: 'OFFLINE', msg: '发送失败,请重试', ts: Date.now() });
      return false;
    }
  }, []);
  sendRef.current = sendMsg;

  const createTable = useCallback((game) => sendMsg({ type: 'table.create', game }), [sendMsg]);
  const joinTable = useCallback(
    (tableId, seat, reclaim) => sendMsg({ type: 'table.join', tableId, seat, reclaim: !!reclaim }),
    [sendMsg]
  );
  const spectateTable = useCallback((tableId) => sendMsg({ type: 'table.spectate', tableId }), [sendMsg]);
  const leaveTable = useCallback(() => sendMsg({ type: 'table.leave' }), [sendMsg]);
  const startGame = useCallback(() => sendMsg({ type: 'table.start' }), [sendMsg]);
  const restartGame = useCallback(() => sendMsg({ type: 'table.restart' }), [sendMsg]);
  const sendMove = useCallback(
    (move) => {
      const t = activeTable;
      if (!t) return false;
      return sendMsg({ type: 'game.move', tableId: t.tableId, version: t.version, move });
    },
    [sendMsg, activeTable]
  );
  const requestDissolve = useCallback(() => sendMsg({ type: 'dissolve.request' }), [sendMsg]);
  const voteDissolve = useCallback((agree) => sendMsg({ type: 'dissolve.vote', agree }), [sendMsg]);
  const clearError = useCallback(() => setLastError(null), []);

  const mySeat = activeTable?.you?.seat ?? null;
  const myTurn = !!(
    activeTable &&
    activeTable.phase === 'playing' &&
    mySeat !== null &&
    activeTable.turn === mySeat
  );

  return {
    status,
    identity,
    games,
    tables,
    activeTable,
    reclaimable,
    lastError,
    mySeat,
    myTurn,
    createTable,
    joinTable,
    spectateTable,
    leaveTable,
    startGame,
    restartGame,
    sendMove,
    requestDissolve,
    voteDissolve,
    clearError,
  };
}
