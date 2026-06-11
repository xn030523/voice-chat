'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  ConnectionQuality,
} from 'livekit-client';

const ROOM_NAME = 'main';

// 屏幕共享画质：清晰优先（看代码/文档）
const SCREEN_MAX_BITRATE = 8_000_000; // 8 Mbps
const SCREEN_MAX_FRAMERATE = 30;
const SCREEN_CONTENT_HINT = 'text';

function qualityToState(q) {
  if (q === ConnectionQuality.Excellent || q === ConnectionQuality.Good) return 'connected';
  if (q === ConnectionQuality.Poor) return 'disconnected';
  if (q === ConnectionQuality.Lost) return 'failed';
  return 'connecting';
}

export function useVoiceChat() {
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | reconnecting | error
  const [error, setError] = useState('');
  const [selfId, setSelfId] = useState(null);
  const [members, setMembers] = useState([]); // [{ id, name, muted, state }]
  const [isSharing, setIsSharing] = useState(false);
  const [activeSharerId, setActiveSharerId] = useState(null);
  const [localShareStream, setLocalShareStream] = useState(null);
  const [remoteShare, setRemoteShare] = useState(null); // { id, stream }
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [authToken, setAuthToken] = useState(null); // 暴露 LiveKit JWT 供游戏子系统鉴权(对聊天无任何影响)

  const roomRef = useRef(null);
  const membersRef = useRef(new Map()); // identity -> { name, muted, quality }
  const audioElsRef = useRef(new Map()); // trackSid -> HTMLAudioElement
  const nameRef = useRef('');
  const selfIdRef = useRef(null);
  const audioUnlockRef = useRef(false);
  const msgSeqRef = useRef(0);

  const syncMembers = useCallback(() => {
    setMembers(
      Array.from(membersRef.current, ([id, info]) => ({
        id,
        name: info.name,
        muted: !!info.muted,
        state: qualityToState(info.quality),
      }))
    );
  }, []);

  const addMessage = useCallback((m) => {
    setMessages((prev) => [
      ...prev,
      { key: `${m.id}-${m.ts}-${msgSeqRef.current++}`, image: null, text: '', ...m },
    ]);
  }, []);

  const upsertMember = useCallback(
    (p, quality) => {
      if (!p || p.identity === selfIdRef.current) return;
      const prev = membersRef.current.get(p.identity) || {};
      membersRef.current.set(p.identity, {
        name: p.name || (p.identity || '').split('__')[0] || p.identity,
        muted: !p.isMicrophoneEnabled,
        quality: quality !== undefined ? quality : prev.quality ?? p.connectionQuality,
      });
      syncMembers();
    },
    [syncMembers]
  );

  // 自动播放被拦截时，等下一次用户手势再恢复
  const registerAudioUnlock = useCallback((room) => {
    if (audioUnlockRef.current || typeof document === 'undefined') return;
    audioUnlockRef.current = true;
    const resume = () => {
      room.startAudio().catch(() => {});
      document.removeEventListener('click', resume);
      document.removeEventListener('touchstart', resume);
      audioUnlockRef.current = false;
    };
    document.addEventListener('click', resume);
    document.addEventListener('touchstart', resume);
  }, []);

  const attachHandlers = useCallback(
    (room) => {
      room
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connected) setStatus('connected');
          else if (state === ConnectionState.Reconnecting) setStatus('reconnecting');
          else if (state === ConnectionState.Connecting) setStatus('connecting');
        })
        .on(RoomEvent.Disconnected, () => {
          setStatus('idle');
        })
        .on(RoomEvent.ParticipantConnected, (p) => upsertMember(p))
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          membersRef.current.delete(p.identity);
          syncMembers();
          setRemoteShare((prev) => (prev && prev.id === p.identity ? null : prev));
          setActiveSharerId((prev) => (prev === p.identity ? null : prev));
        })
        .on(RoomEvent.ConnectionQualityChanged, (quality, p) => upsertMember(p, quality))
        .on(RoomEvent.TrackMuted, (_pub, p) => upsertMember(p))
        .on(RoomEvent.TrackUnmuted, (_pub, p) => upsertMember(p))
        .on(RoomEvent.TrackPublished, (_pub, p) => upsertMember(p))
        .on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = 'none';
            if (typeof document !== 'undefined') document.body.appendChild(el);
            audioElsRef.current.set(track.sid, el);
          } else if (track.source === Track.Source.ScreenShare) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            setRemoteShare({ id: p.identity, stream });
            setActiveSharerId(p.identity);
          }
          upsertMember(p);
        })
        .on(RoomEvent.TrackUnsubscribed, (track, _pub, p) => {
          track.detach().forEach((el) => el.remove());
          audioElsRef.current.delete(track.sid);
          if (track.source === Track.Source.ScreenShare) {
            setRemoteShare((prev) => (prev && prev.id === p.identity ? null : prev));
            setActiveSharerId((prev) => (prev === p.identity ? null : prev));
          }
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!room.canPlaybackAudio) registerAudioUnlock(room);
        });

      // 文字消息
      try {
        room.registerTextStreamHandler('chat', async (reader, info) => {
          const text = await reader.readAll();
          const p = room.getParticipantByIdentity(info.identity);
          addMessage({
            id: info.identity,
            name: p?.name || (info.identity || '').split('__')[0] || '对方',
            text,
            ts: Date.now(),
            self: false,
          });
        });
      } catch {
        /* 已注册 */
      }

      // 图片消息（字节流，自动分片）
      try {
        room.registerByteStreamHandler('image', async (reader, info) => {
          const chunks = [];
          for await (const chunk of reader) chunks.push(chunk);
          const mime = reader.info?.mimeType || 'image/jpeg';
          const blob = new Blob(chunks, { type: mime });
          const url = URL.createObjectURL(blob);
          const p = room.getParticipantByIdentity(info.identity);
          addMessage({
            id: info.identity,
            name: p?.name || (info.identity || '').split('__')[0] || '对方',
            image: url,
            ts: Date.now(),
            self: false,
          });
        });
      } catch {
        /* 已注册 */
      }
    },
    [upsertMember, syncMembers, registerAudioUnlock, addMessage]
  );

  const cleanup = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    }
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    membersRef.current.clear();
    selfIdRef.current = null;
    setSelfId(null);
    setMembers([]);
    setIsSharing(false);
    setActiveSharerId(null);
    setLocalShareStream(null);
    setRemoteShare(null);
    setMessages([]);
    setMuted(false);
    setAuthToken(null);
  }, []);

  const join = useCallback(
    async (name) => {
      setError('');
      setStatus('connecting');
      nameRef.current = name;
      let url;
      let token;
      try {
        const res = await fetch(
          `/token?room=${encodeURIComponent(ROOM_NAME)}&name=${encodeURIComponent(name)}`
        );
        if (!res.ok) throw new Error('token');
        const data = await res.json();
        url = data.url;
        token = data.token;
        if (!url || !token) throw new Error('token');
      } catch {
        setError('获取入会令牌失败，请稍后重试。');
        setStatus('error');
        return;
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      attachHandlers(room);

      try {
        await room.connect(url, token);
      } catch (err) {
        setError('连接语音服务器失败，请检查网络后重试。');
        setStatus('error');
        cleanup();
        return;
      }

      selfIdRef.current = room.localParticipant.identity;
      setSelfId(room.localParticipant.identity);
      setAuthToken(token);

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        setError('无法获取麦克风权限，请检查浏览器设置。');
      }
      setMuted(!room.localParticipant.isMicrophoneEnabled);

      // 解锁音频自动播放（join 本身是用户手势）
      room.startAudio().catch(() => registerAudioUnlock(room));

      // 载入已在房间内的成员
      room.remoteParticipants.forEach((p) => upsertMember(p));
      setStatus('connected');
    },
    [attachHandlers, cleanup, registerAudioUnlock, upsertMember]
  );

  const leave = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  const startShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: false,
          contentHint: SCREEN_CONTENT_HINT,
          resolution: { width: 1920, height: 1080, frameRate: SCREEN_MAX_FRAMERATE },
        },
        {
          degradationPreference: 'maintain-resolution',
          screenShareEncoding: {
            maxBitrate: SCREEN_MAX_BITRATE,
            maxFramerate: SCREEN_MAX_FRAMERATE,
          },
        }
      );
    } catch {
      return; // 用户取消
    }
    setError('');
    const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const track = pub?.videoTrack;
    if (track) {
      const stream = new MediaStream([track.mediaStreamTrack]);
      setLocalShareStream(stream);
      setIsSharing(true);
      setActiveSharerId(room.localParticipant.identity);
      track.mediaStreamTrack.onended = () => stopShare();
    }
  }, []);

  const stopShare = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch {
        /* ignore */
      }
    }
    setLocalShareStream(null);
    setIsSharing(false);
    setActiveSharerId((prev) => (prev === selfIdRef.current ? null : prev));
  }, []);

  const sendChat = useCallback(
    async (text) => {
      const t = String(text || '').trim();
      const room = roomRef.current;
      if (!t || !room) return;
      try {
        await room.localParticipant.sendText(t, { topic: 'chat' });
      } catch {
        return;
      }
      addMessage({ id: selfIdRef.current, name: nameRef.current, text: t, ts: Date.now(), self: true });
    },
    [addMessage]
  );

  // 压缩图片（最大 1920px，JPEG 0.7）后通过字节流发送
  const sendImage = useCallback(
    (file) => {
      const room = roomRef.current;
      if (!file || !file.type?.startsWith('image/') || !room) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1920;
          let w = img.width;
          let h = img.height;
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            async (blob) => {
              if (!blob) return;
              const f = new File([blob], 'image.jpg', { type: 'image/jpeg' });
              try {
                await room.localParticipant.sendFile(f, { topic: 'image' });
              } catch {
                return;
              }
              addMessage({
                id: selfIdRef.current,
                name: nameRef.current,
                image: URL.createObjectURL(blob),
                ts: Date.now(),
                self: true,
              });
            },
            'image/jpeg',
            0.7
          );
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    },
    [addMessage]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      const room = roomRef.current;
      if (room) room.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
      return next;
    });
  }, []);

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
    messages,
    muted,
    authToken,
    join,
    leave,
    startShare,
    stopShare,
    sendChat,
    sendImage,
    toggleMute,
  };
}
