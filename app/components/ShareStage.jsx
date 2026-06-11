'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, X, MonitorUp } from 'lucide-react';

export default function ShareStage({ stream, isRemote, sharerName }) {
  const videoRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
      if (stream) videoRef.current.play().catch(() => {});
    }
    if (!stream) setExpanded(false);
  }, [stream]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (!stream) return null;

  return (
    <div
      className={`share-view${expanded ? ' expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? '点击关闭' : '点击放大'}
    >
      <video ref={videoRef} autoPlay playsInline muted={!isRemote} />
      <span className="share-label">
        <MonitorUp size={13} />
        {isRemote ? `${sharerName} 正在共享屏幕` : '你正在共享屏幕'}
      </span>
      <span className="share-zoom">
        {expanded ? (
          <>
            <X size={13} /> 关闭
          </>
        ) : (
          <>
            <Maximize2 size={13} /> 放大
          </>
        )}
      </span>
    </div>
  );
}
