'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrollArea, TextInput, ActionIcon, Stack } from '@mantine/core';
import { Send, MessageSquare, ImagePlus, X } from 'lucide-react';

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatPanel({ messages, onSend, onSendImage, disabled }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { file, url } 待发送图片预览
  const [lightbox, setLightbox] = useState(null); // data URL 灯箱
  const viewportRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // 灯箱 Esc 关闭
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const submit = (e) => {
    e.preventDefault();
    if (preview) {
      onSendImage(preview.file, text.trim());
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    } else {
      const t = text.trim();
      if (!t) return;
      onSend(t);
    }
    setText('');
  };

  const cancelPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  // 从 File 对象生成预览
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
    inputRef.current?.focus();
  }, []);

  // 粘贴
  const onPaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handleFile(item.getAsFile());
        return;
      }
    }
  }, [handleFile]);

  // 拖入
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const pickFile = () => fileRef.current?.click();

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div
      className="chat-panel"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="放大" />
          <span className="lightbox-close"><X size={22} /> 关闭</span>
        </div>
      )}

      <ScrollArea className="chat-scroll" viewportRef={viewportRef} type="auto">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <MessageSquare size={28} />
            <span>还没有消息，说点什么吧</span>
          </div>
        ) : (
          <Stack className="chat-msgs" gap={10} p="sm">
            {messages.map((m) => (
              <div key={m.key} className={`bubble-row${m.self ? ' self' : ''}`}>
                {!m.self && <span className="bubble-name">{m.name}</span>}
                <div className="bubble">
                  {m.text && <p>{m.text}</p>}
                  {m.image && (
                    <img
                      className="bubble-img"
                      src={m.image}
                      alt="图片"
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); setLightbox(m.image); }}
                    />
                  )}
                </div>
                <span className="bubble-time">{formatTime(m.ts)}</span>
              </div>
            ))}
          </Stack>
        )}
      </ScrollArea>

      {preview && (
        <div className="preview-bar">
          <img className="preview-thumb" src={preview.url} alt="预览" />
          <span className="preview-hint">准备发送图片</span>
          <ActionIcon
            color="gray"
            variant="subtle"
            size={28}
            onClick={cancelPreview}
            aria-label="取消图片"
          >
            <X size={16} />
          </ActionIcon>
        </div>
      )}

      <form className="chat-input" onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        <ActionIcon
          variant="subtle"
          size={36}
          onClick={pickFile}
          disabled={disabled}
          aria-label="选择图片"
        >
          <ImagePlus size={18} />
        </ActionIcon>
        <TextInput
          flex={1}
          ref={inputRef}
          placeholder={disabled ? '连接中…' : '说点什么…'}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onPaste={onPaste}
          disabled={disabled}
          maxLength={2000}
          autoComplete="off"
        />
        <ActionIcon
          type="submit"
          size={36}
          variant="filled"
          aria-label="发送"
          disabled={disabled || (!text.trim() && !preview)}
        >
          <Send size={18} />
        </ActionIcon>
      </form>
    </div>
  );
}
