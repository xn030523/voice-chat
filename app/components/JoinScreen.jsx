'use client';

import { TextInput, Button, Text } from '@mantine/core';

export default function JoinScreen({ name, setName, onJoin, connecting, error }) {
  return (
    <form className="join" onSubmit={onJoin}>
      <div className="join-head">
        <div className="logo">
          <span aria-hidden>🦌</span>
        </div>
        <h1>🦌专用会议</h1>
        <p className="subtitle">三两好友 · 即说即聊</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="join-name">
          你的名字
        </label>
        <TextInput
          id="join-name"
          size="md"
          w="100%"
          placeholder="输入名字"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={32}
          disabled={connecting}
          autoFocus
        />
      </div>

      <Button type="submit" size="md" fullWidth loading={connecting} disabled={!name.trim()}>
        {connecting ? '连接中…' : '加入房间'}
      </Button>

      {error && (
        <Text c="red" size="sm" ta="center">
          {error}
        </Text>
      )}
    </form>
  );
}
