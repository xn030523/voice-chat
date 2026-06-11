'use client';

import { TextInput, Button, Text } from '@mantine/core';
import { Mic } from 'lucide-react';

export default function JoinScreen({ name, setName, onJoin, connecting, error }) {
  return (
    <form className="join" onSubmit={onJoin}>
      <div className="logo">
        <Mic size={40} />
      </div>
      <h1>语音聊天室</h1>
      <p className="subtitle">输入名字，加入语音 · 文字 · 屏幕共享</p>
      <TextInput
        size="md"
        w="100%"
        placeholder="你的名字"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        maxLength={32}
        disabled={connecting}
        autoFocus
      />
      <Button type="submit" size="md" fullWidth loading={connecting} disabled={!name.trim()}>
        {connecting ? '连接中…' : '加入'}
      </Button>
      {error && (
        <Text c="red.4" size="sm" ta="center">
          {error}
        </Text>
      )}
    </form>
  );
}
