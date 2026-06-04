import './globals.css';

export const metadata = {
  title: '语音聊天',
  description: '打开即用的多人在线语音聊天',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
