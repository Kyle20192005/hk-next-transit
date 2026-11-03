import type { NextConfig } from 'next';

const config: NextConfig = {
  // core 係 TypeScript 原始碼，交俾 Next 編譯
  transpilePackages: ['@hknt/core'],
};

export default config;
