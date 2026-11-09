import type { NextConfig } from 'next';

const config: NextConfig = {
  // core 係 TypeScript 原始碼，交俾 Next 編譯
  transpilePackages: ['@hknt/core'],
  // 容許經 Cloudflare 臨時網址打開 dev server（預覽用）
  allowedDevOrigins: ['*.trycloudflare.com'],
  // PWA service worker：唔好 cache（改咗即刻生效），只准載入自己網站嘅 script
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default config;
