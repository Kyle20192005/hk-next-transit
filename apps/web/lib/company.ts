import type { Company } from '@hknt/core';

/** 巴士公司：顯示名稱同代表色（標籤底色 bg、上面嘅字 ink） */
export const COMPANIES: Record<Company, { name: string; bg: string; ink: string }> = {
  CTB: { name: '城巴', bg: '#ffd200', ink: '#1b1b1b' },
  KMB: { name: '九巴', bg: '#e1251b', ink: '#ffffff' },
  LWB: { name: '龍運', bg: '#f26b21', ink: '#ffffff' },
};
