import type { Company } from '@hknt/core';

/** 巴士公司：顯示名稱同代表色（bg 底色／線條色、ink 喺代表色上面嘅字同圖示色） */
export const COMPANIES: Record<Company, { name: string; bg: string; ink: string }> = {
  CTB: { name: '城巴', bg: '#FFD800', ink: '#1b1b1b' },
  KMB: { name: '九巴', bg: '#D01A1E', ink: '#ffffff' },
  LWB: { name: '龍運', bg: '#F26B21', ink: '#ffffff' },
  NLB: { name: '新大嶼山', bg: '#1B8F4C', ink: '#ffffff' },
  MTRB: { name: '港鐵巴士', bg: '#9E1B32', ink: '#ffffff' },
};

/** 公司代表色（地圖走線、時間線、巴士圖示） */
export function companyColor(company: string | undefined): string | undefined {
  return company && company in COMPANIES ? COMPANIES[company as Company].bg : undefined;
}

/** 喺公司代表色上面用嘅字／圖示色 */
export function companyInk(company: string | undefined): string {
  return company && company in COMPANIES ? COMPANIES[company as Company].ink : '#ffffff';
}
