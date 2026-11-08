import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_SCRIPT } from '@/lib/prefs';
import OfflineBanner from '@/components/OfflineBanner';

export const metadata: Metadata = {
  applicationName: '下一程',
  appleWebApp: { title: '下一程' },
  title: { default: '下一程 NextLeg｜香港交通實時到站', template: '%s｜下一程' },
  description: '下一程：香港巴士實時到站時間、巴士位置、特別班次走法同車費。城巴、九巴、龍運、新大嶼山巴士、港鐵巴士。',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffc72c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK" suppressHydrationWarning>
      <head>
        {/* 深色模式設定：載入前先寫 data-theme，唔會閃 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
