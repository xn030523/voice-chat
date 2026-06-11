'use client';

import { useState } from 'react';
import { Tabs } from '@mantine/core';
import { useVoiceChat } from '@/lib/useVoiceChat';
import { useGames } from '@/lib/useGames';
import JoinScreen from './components/JoinScreen';
import RoomHeader from './components/RoomHeader';
import MemberList from './components/MemberList';
import ShareStage from './components/ShareStage';
import ChatPanel from './components/ChatPanel';
import GamesPanel from './components/games/GamesPanel';

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
  } = useVoiceChat();
  const [name, setName] = useState('');

  // 游戏子系统(独立 WS,懒连接:首次打开面板才建立;关面板保持连接不掉座)
  const [gamesOpen, setGamesOpen] = useState(false);
  const [gamesArmed, setGamesArmed] = useState(false);

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

  const games = useGames({ enabled: gamesArmed && inRoom, authToken });
  const toggleGames = () => {
    setGamesArmed(true);
    setGamesOpen((v) => !v);
  };
  const showGames = gamesOpen && inRoom;

  // 优先显示他人共享的画面，否则显示自己的预览
  const shownStream = remoteShare ? remoteShare.stream : isSharing ? localShareStream : null;
  const someoneElseSharing = activeSharerId && activeSharerId !== selfId;
  const sharerName = remoteShare
    ? members.find((m) => m.id === remoteShare.id)?.name || '对方'
    : '';

  const roster = [
    { id: selfId || 'self', name: name.trim() || '我', self: true, state: 'connected' },
    ...members,
  ];
  const onlineCount = (inRoom ? 1 : 0) + members.length;
  const connectedCount = members.filter((m) => m.state === 'connected').length;

  if (!inRoom) {
    return (
      <main className="page">
        <div className="card">
          <JoinScreen
            name={name}
            setName={setName}
            onJoin={handleJoin}
            connecting={connecting}
            error={error}
          />
        </div>
        <footer className="foot">点开网页 · 输名字 · 即说即聊</footer>
      </main>
    );
  }

  return (
    <main className="room-page">
      <div className="room-shell">
        <RoomHeader
          onlineCount={onlineCount}
          connected={connected}
          isSharing={isSharing}
          someoneElseSharing={someoneElseSharing}
          reconnecting={reconnecting}
          muted={muted}
          onToggleMute={toggleMute}
          onShare={startShare}
          onStopShare={stopShare}
          onLeave={leave}
          gamesOpen={gamesOpen}
          onToggleGames={toggleGames}
          gamesAlert={games.myTurn && !gamesOpen}
        />

        {reconnecting && <div className="banner">网络中断，正在重连…</div>}

        <div className="room-body">
          <aside className="room-aside">
            <MemberList
              roster={roster}
              activeSharerId={activeSharerId}
              connectedCount={connectedCount}
              peerTotal={members.length}
            />
          </aside>

          <section className={`room-main${shownStream || showGames ? ' with-share' : ''}`}>
            {shownStream && showGames ? (
              <div className="stage-tabs">
                <Tabs defaultValue="games" variant="pills" radius="md" keepMounted>
                  <Tabs.List>
                    <Tabs.Tab value="share">共享画面</Tabs.Tab>
                    <Tabs.Tab value="games">游戏</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="share">
                    <ShareStage stream={shownStream} isRemote={!!remoteShare} sharerName={sharerName} />
                  </Tabs.Panel>
                  <Tabs.Panel value="games">
                    <GamesPanel games={games} />
                  </Tabs.Panel>
                </Tabs>
              </div>
            ) : showGames ? (
              <GamesPanel games={games} />
            ) : (
              <ShareStage stream={shownStream} isRemote={!!remoteShare} sharerName={sharerName} />
            )}
            <ChatPanel messages={messages} onSend={sendChat} onSendImage={sendImage} disabled={!connected} />
          </section>
        </div>

        {error && <p className="error room-error">{error}</p>}
      </div>
    </main>
  );
}
