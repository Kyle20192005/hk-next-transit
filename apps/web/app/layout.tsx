import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '香港交通到站時間', template: '%s｜香港交通到站時間' },
  description: '城巴、九巴等香港公共交通實時到站時間，包括特別班次走法。',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffc72c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <header className="top">
          <Link href="/">香港交通到站時間</Link>
        </header>
        {children}
      </body>
    </html>
  );
}
