import type { Company } from '@hknt/core';

/** 巴士公司：顯示名稱同代表色（標籤底色 bg、上面嘅字 ink） */
export const COMPANIES: Record<Company, { name: string; bg: string; ink: string }> = {
  CTB: { name: '城巴', bg: '#ffd200', ink: '#1b1b1b' },
  KMB: { name: '九巴', bg: '#e1251b', ink: '#ffffff' },
  LWB: { name: '龍運', bg: '#f26b21', ink: '#ffffff' },
};

/** 地圖／時間線上巴士圖示用嘅公司顏色（城巴黃色太淺，用深啲嘅金色等白色圖示睇得清） */
export function companyColor(company: string | undefined): string | undefined {
  if (company === 'CTB') return '#d9a400';
  if (company === 'KMB') return '#e1251b';
  if (company === 'LWB') return '#f26b21';
  return undefined;
}
