import type { NextConfig } from 'next';

const config: NextConfig = {
  // core 係 TypeScript 原始碼，交俾 Next 編譯
  transpilePackages: ['@hknt/core'],
  // 容許經 Cloudflare 臨時網址打開 dev server（預覽用）
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default config;
