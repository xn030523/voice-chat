'use client';

import { useEffect, useRef, useState } from 'react';
import { useVoiceChat } from '@/lib/useVoiceChat';

export default function Home() {
  const {
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
  } = useVoiceChat();
  const [name, setName] = useState('');
  const videoRef = useRef(null);

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    join(trimmed);
  };

  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const reconnecting = status === 'reconnecting';
  const inRoom = connected || reconnecting;

  // 优先显示他人共享的画面，否则显示自己的预览
  const shownStream = remoteShare ? remoteShare.stream : isSharing ? localShareStream : null;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = shownStream || null;
      if (shownStream) videoRef.current.play().catch(() => {});
    }
  }, [shownStream]);

  // 在线成员 = 自己 + 其他人
  const roster = [{ id: selfId || 'self', name: name.trim() || '我', self: true }, ...members];
  const onlineCount = (inRoom ? 1 : 0) + members.length;

  const someoneElseSharing = activeSharerId && activeSharerId !== selfId;
  const sharerName = remoteShare
    ? members.find((m) => m.id === remoteShare.id)?.name || '对方'
    : '';

  return (
    <main className="page">
      <div className="card">
        {!inRoom ? (
          <form className="join" onSubmit={handleJoin}>
            <div className="logo">🎙️</div>
            <h1>语音聊天</h1>
            <p className="subtitle">输入名字，直接加入大家的语音</p>
            <input
              type="text"
              value={name}
              maxLength={32}
              placeholder="你的名字"
              onChange={(e) => setName(e.target.value)}
              disabled={connecting}
              autoFocus
            />
            <button type="submit" disabled={connecting || !name.trim()}>
              {connecting ? '连接中…' : '加入语音'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        ) : (
          <div className="room">
            <header className="room-head">
              <div>
                <h2>语音进行中</h2>
                <span className="hint">麦克风已开启，直接说话即可</span>
              </div>
              <span className="count">{onlineCount} 人在线</span>
            </header>

            {reconnecting && (
              <div className="banner">网络中断，正在重连…</div>
            )}

            {shownStream && (
              <div className="share-view">
                <video ref={videoRef} autoPlay playsInline muted={!remoteShare} />
                <span className="share-label">
                  {remoteShare ? `${sharerName} 正在共享屏幕` : '你正在共享屏幕'}
                </span>
              </div>
            )}

            <ul className="members">
              {roster.map((m) => (
                <li key={m.id} className={m.self ? 'me' : ''}>
                  <span className="avatar">{(m.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="mname">{m.name}</span>
                  {m.self ? (
                    <span className="tag">你</span>
                  ) : (
                    <span className="dot" title="已连接" />
                  )}
                </li>
              ))}
            </ul>

            {error && <p className="error">{error}</p>}

            <div className="actions">
              {isSharing ? (
                <button className="share active" onClick={stopShare}>
                  停止共享
                </button>
              ) : (
                <button
                  className="share"
                  onClick={startShare}
                  disabled={!connected || someoneElseSharing}
                >
                  {someoneElseSharing ? '他人共享中' : '共享屏幕'}
                </button>
              )}
              <button className="leave" onClick={leave}>
                离开语音
              </button>
            </div>
          </div>
        )}
      </div>
      <footer className="foot">点开网页 · 输名字 · 即说即聊</footer>
    </main>
  );
}
