import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_SCRIPT } from '@/lib/prefs';
import OfflineBanner from '@/components/OfflineBanner';
import PwaSetup from '@/components/PwaSetup';
import { PWA_SCRIPT } from '@/lib/pwa-script';

export const metadata: Metadata = {
  applicationName: '下一程',
  // 加至主畫面（PWA）：全螢幕開；default = 狀態列唔透明、內容由狀態列下面開始。iOS 26 唔睇 theme-color，
  // 狀態列顏色由頁面決定（冇全闊 fixed／sticky 頂部元素就用 body 底色），所以 globals.css 嘅 html/body 用品牌黃
  appleWebApp: { capable: true, title: '下一程', statusBarStyle: 'default' },
  title: { default: '下一程 NextLeg｜香港交通實時到站', template: '%s｜下一程' },
  description: '下一程：香港巴士、專線小巴實時到站時間、車輛位置、特別班次走法同車費。城巴、九巴、龍運、新大嶼山巴士、港鐵巴士、專線小巴。',
};

// viewport-fit=cover：主畫面版底部分頁列要避開 Home 條（CSS 用 env(safe-area-inset-*)）
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffc72c', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK" suppressHydrationWarning>
      <head>
        {/* 深色模式設定：載入前先寫 data-theme，唔會閃 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* PWA：安裝提示可能喺 React 載入前就出，先捉住 */}
        <script dangerouslySetInnerHTML={{ __html: PWA_SCRIPT }} />
      </head>
      <body>
        {/* iOS 26 主畫面 App：頂部要有全闊 fixed 元素，狀態列先係實色（冇就會有模糊漸變），見 globals.css .status-tint */}
        <div className="status-tint" aria-hidden="true" />
        <OfflineBanner />
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
