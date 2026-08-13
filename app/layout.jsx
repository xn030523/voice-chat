import '@mantine/core/styles.css';
import './globals.css';
import { ColorSchemeScript, MantineProvider, createTheme } from '@mantine/core';

export const metadata = {
  title: '🦌专用会议',
  description: '打开即用的多人在线语音 · 文字 · 屏幕共享',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const theme = createTheme({
  primaryColor: 'terracotta',
  primaryShade: 6,
  defaultColorScheme: 'light',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  fontFamilyHeadings:
    "'Noto Serif SC', 'Songti SC', 'STSong', Georgia, 'Times New Roman', serif",
  defaultRadius: 'sm',
  colors: {
    terracotta: [
      '#fbf1ec',
      '#f2d9cb',
      '#e8b89a',
      '#de9668',
      '#d17640',
      '#b85c38',
      '#a04e2e',
      '#834027',
      '#6b3520',
      '#4d2618',
    ],
  },
});

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
