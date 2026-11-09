import type { MetadataRoute } from 'next';

/**
 * PWA manifest（/manifest.webmanifest）：加至主畫面之後全螢幕開、黃色主題（同 App 載入畫面一樣）。
 * 圖示：public/icons（icon-* 圓角、maskable-* 滿版黃底，圖案縮到 80% 喺安全範圍入面）。
 * 捷徑（長撳圖示）：收藏、附近車站（Home 讀 ?tab= ／ ?view=）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '下一程 NextLeg',
    short_name: '下一程',
    description: '香港巴士、港鐵、輕鐵實時到站時間、巴士位置、走法同車費。',
    lang: 'zh-HK',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffc72c',
    theme_color: '#ffc72c',
    categories: ['travel', 'navigation', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '收藏', url: '/?tab=favs', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: '附近車站', url: '/?view=nearby', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
