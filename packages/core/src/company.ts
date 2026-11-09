import type { Company } from './types';

/**
 * 巴士公司：顯示名稱同代表色（bg 底色／線條色、ink 喺代表色上面嘅字同圖示色）。
 * 網頁同 App 共用，地圖走線、時間線、巴士圖示、公司標籤都用呢度嘅顏色。
 */
export const COMPANIES: Record<Company, { name: string; bg: string; ink: string }> = {
  CTB: { name: '城巴', bg: '#FFD800', ink: '#1b1b1b' },
  KMB: { name: '九巴', bg: '#D01A1E', ink: '#ffffff' },
  LWB: { name: '龍運', bg: '#F26B21', ink: '#ffffff' },
  NLB: { name: '新大嶼山', bg: '#1B8F4C', ink: '#ffffff' },
  MTRB: { name: '港鐵巴士', bg: '#9E1B32', ink: '#ffffff' },
  // 專線小巴：同「小巴」分類色一樣；白字對比唔夠（3.45:1），用深色字（5:1），同城巴黃底深字一樣做法
  GMB: { name: '專線小巴', bg: '#1E9E5A', ink: '#0A1F12' },
};

/** 唔認得嘅公司（例如舊版介面收到新公司）用中性灰，唔好 throw */
const UNKNOWN_COMPANY = { bg: '#666666', ink: '#ffffff' } as const;

/**
 * 公司資料，唔認得都有後備（名 = 原本代號、灰底白字）。
 * 介面用呢個代替 COMPANIES[c]：新增公司時舊介面唔會因為攞到 undefined 而出錯。
 */
export function companyInfo(company: string | undefined): { name: string; bg: string; ink: string } {
  // 用 hasOwnProperty：`in` 連 toString 之類原型屬性都當有
  return company && Object.prototype.hasOwnProperty.call(COMPANIES, company)
    ? COMPANIES[company as Company]
    : { name: company ?? '', ...UNKNOWN_COMPANY };
}

/** 公司代表色（地圖走線、時間線、巴士圖示） */
export function companyColor(company: string | undefined): string | undefined {
  return company && company in COMPANIES ? COMPANIES[company as Company].bg : undefined;
}

/** 喺公司代表色上面用嘅字／圖示色 */
export function companyInk(company: string | undefined): string {
  return company && company in COMPANIES ? COMPANIES[company as Company].ink : '#ffffff';
}

/** 「城巴・九巴」 */
export function companyNames(cos: readonly string[]): string {
  return cos.map((c) => COMPANIES[c as Company]?.name ?? c).join('・');
}
