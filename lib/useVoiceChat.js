'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // 如需穿透严格 NAT，自建 coturn 后取消下面注释并填入：
  // {
  //   urls: 'turn:YOUR_TURN_HOST:3478',
  //   username: 'YOUR_USER',
  //   credential: 'YOUR_PASSWORD',
  // },
];

const MAX_RECONNECT_DELAY = 10000;

export function useVoiceChat() {
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | reconnecting | error
  const [error, setError] = useState('');
  const [selfId, setSelfId] = useState(null);
  const [members, setMembers] = useState([]); // [{ id, name }]
  const [isSharing, setIsSharing] = useState(false); // 自己是否正在共享
  const [activeSharerId, setActiveSharerId] = useState(null); // 当前共享者 id（可能是自己/他人/null）
  const [localShareStream, setLocalShareStream] = useState(null); // 自己共享的预览流
  const [remoteShare, setRemoteShare] = useState(null); // { id, stream } 他人共享的画面

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const audiosRef = useRef(new Map()); // peerId -> HTMLAudioElement
  const pendingRef = useRef(new Map()); // peerId -> ICE candidates queued before remoteDescription
  const membersRef = useRef(new Map()); // peerId -> name

  const nameRef = useRef('');
  const selfIdRef = useRef(null);
  const activeSharerIdRef = useRef(null);
  const shouldReconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const syncMembers = useCallback(() => {
    setMembers(Array.from(membersRef.current, ([id, name]) => ({ id, name })));
  }, []);

  const sendSignal = useCallback((to, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'signal', to, data }));
    }
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const closePeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
      pcsRef.current.delete(peerId);
    }
    const audio = audiosRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audiosRef.current.delete(peerId);
    }
    pendingRef.current.delete(peerId);
    setRemoteShare((prev) => (prev && prev.id === peerId ? null : prev));
  }, []);

  const flushCandidates = useCallback(async (peerId) => {
    const pc = pcsRef.current.get(peerId);
    const queued = pendingRef.current.get(peerId);
    if (!pc || !queued) return;
    for (const cand of queued) {
      try {
        await pc.addIceCandidate(cand);
      } catch {
        /* ignore */
      }
    }
    pendingRef.current.delete(peerId);
  }, []);

  const createPeer = useCallback(
    (peerId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      // perfect negotiation：id 较大者为 polite，发生冲突时让步
      pc._polite = (selfIdRef.current || '') > peerId;
      pc._makingOffer = false;
      pc._ignoreOffer = false;
      pcsRef.current.set(peerId, pc);

      const stream = localStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // 若我此刻正在共享屏幕，新建连接也要带上视频轨
      const screen = screenStreamRef.current;
      if (screen) screen.getTracks().forEach((t) => pc.addTrack(t, screen));

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerId, { candidate: e.candidate });
      };

      pc.onnegotiationneeded = async () => {
        try {
          pc._makingOffer = true;
          await pc.setLocalDescription();
          sendSignal(peerId, { description: pc.localDescription });
        } catch (err) {
          console.error('negotiation failed', err);
        } finally {
          pc._makingOffer = false;
        }
      };

      pc.ontrack = (e) => {
        const track = e.track;
        if (track.kind === 'audio') {
          let audio = audiosRef.current.get(peerId);
          if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            audiosRef.current.set(peerId, audio);
          }
          audio.srcObject = e.streams[0];
          audio.play().catch(() => {});
        } else if (track.kind === 'video') {
          const stream = e.streams[0];
          setRemoteShare({ id: peerId, stream });
          track.onended = () =>
            setRemoteShare((prev) => (prev && prev.id === peerId ? null : prev));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {
            closePeer(peerId);
          }
        } else if (pc.connectionState === 'closed') {
          closePeer(peerId);
        }
      };

      return pc;
    },
    [sendSignal, closePeer]
  );

  const handleSignal = useCallback(
    async (fromId, data) => {
      let pc = pcsRef.current.get(fromId);
      if (!pc) pc = createPeer(fromId);

      try {
        if (data.description) {
          const offerCollision =
            data.description.type === 'offer' &&
            (pc._makingOffer || pc.signalingState !== 'stable');
          pc._ignoreOffer = !pc._polite && offerCollision;
          if (pc._ignoreOffer) return;

          await pc.setRemoteDescription(data.description);
          await flushCandidates(fromId);
          if (data.description.type === 'offer') {
            await pc.setLocalDescription();
            sendSignal(fromId, { description: pc.localDescription });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch {
              /* ignore */
            }
          } else {
            const q = pendingRef.current.get(fromId) || [];
            q.push(data.candidate);
            pendingRef.current.set(fromId, q);
          }
        }
      } catch (err) {
        console.error('handleSignal failed', err);
      }
    },
    [createPeer, flushCandidates, sendSignal]
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const resetPeers = useCallback(() => {
    for (const peerId of Array.from(pcsRef.current.keys())) closePeer(peerId);
    membersRef.current.clear();
    syncMembers();
  }, [closePeer, syncMembers]);

  const connectWS = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'join', name: nameRef.current }));
      // 重连前若正在共享，恢复共享声明
      if (screenStreamRef.current) ws.send(JSON.stringify({ type: 'share-start' }));
      setStatus('connected');
    };

    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'self':
          selfIdRef.current = msg.id;
          setSelfId(msg.id);
          break;
        case 'peers':
          // 我是新加入者，由我向所有现存成员发起连接
          msg.peers.forEach((p) => {
            membersRef.current.set(p.id, p.name);
            createPeer(p.id); // addTrack 会触发 negotiationneeded 自动 offer
          });
          syncMembers();
          break;
        case 'peer-joined':
          membersRef.current.set(msg.id, msg.name);
          syncMembers();
          break;
        case 'peer-left':
          membersRef.current.delete(msg.id);
          closePeer(msg.id);
          syncMembers();
          break;
        case 'signal':
          handleSignal(msg.from, msg.data);
          break;
        case 'share-state':
          activeSharerIdRef.current = msg.sharerId;
          setActiveSharerId(msg.sharerId);
          if (!msg.sharerId || msg.sharerId === selfIdRef.current) {
            setRemoteShare(null);
          }
          break;
        case 'share-denied':
          setError('已有其他人在共享屏幕，请稍后再试。');
          // 撤销刚才本地拿到的共享流
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
          }
          setLocalShareStream(null);
          setIsSharing(false);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (!shouldReconnectRef.current) return;
      // 服务端会给重连分配新 id，旧的连接全部作废重建
      resetPeers();
      setStatus('reconnecting');
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(MAX_RECONNECT_DELAY, 1000 * 2 ** attempt);
      reconnectAttemptsRef.current = attempt + 1;
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(connectWS, delay);
    };

    ws.onerror = () => {
      // 交给 onclose 统一处理重连
    };
  }, [createPeer, handleSignal, closePeer, syncMembers, resetPeers, clearReconnectTimer]);

  const cleanup = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    for (const peerId of Array.from(pcsRef.current.keys())) closePeer(peerId);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    membersRef.current.clear();
    syncMembers();
    selfIdRef.current = null;
    activeSharerIdRef.current = null;
    setSelfId(null);
    setIsSharing(false);
    setActiveSharerId(null);
    setLocalShareStream(null);
    setRemoteShare(null);
  }, [closePeer, syncMembers, clearReconnectTimer]);

  const join = useCallback(
    async (name) => {
      setError('');
      setStatus('connecting');
      if (!localStreamRef.current) {
        try {
          localStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } catch (err) {
          setError('无法获取麦克风权限，请检查浏览器设置（需 HTTPS 或 localhost）。');
          setStatus('error');
          return;
        }
      }
      nameRef.current = name;
      shouldReconnectRef.current = true;
      reconnectAttemptsRef.current = 0;
      connectWS();
    },
    [connectWS]
  );

  const leave = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  const startShare = useCallback(async () => {
    if (activeSharerIdRef.current && activeSharerIdRef.current !== selfIdRef.current) {
      setError('已有其他人在共享屏幕。');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return; // 用户取消
    }
    setError('');
    screenStreamRef.current = stream;
    setLocalShareStream(stream);
    setIsSharing(true);
    send({ type: 'share-start' });

    const track = stream.getVideoTracks()[0];
    for (const pc of pcsRef.current.values()) {
      pc.addTrack(track, stream); // 触发 negotiationneeded 重新协商
    }
    if (track) track.onended = () => stopShare();
  }, [send]);

  const stopShare = useCallback(() => {
    const stream = screenStreamRef.current;
    if (stream) {
      const tracks = stream.getTracks();
      for (const pc of pcsRef.current.values()) {
        const senders = pc.getSenders().filter((s) => s.track && tracks.includes(s.track));
        senders.forEach((s) => {
          try {
            pc.removeTrack(s);
          } catch {
            /* ignore */
          }
        });
      }
      tracks.forEach((t) => t.stop());
    }
    screenStreamRef.current = null;
    setLocalShareStream(null);
    setIsSharing(false);
    send({ type: 'share-stop' });
  }, [send]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    status,
    error,
    selfId,
    members,
    isSharing,
    activeSharerId,
    localShareStream,
    remoteShare,
    join,
    leave,
    startShare,
    stopShare,
  };
}
