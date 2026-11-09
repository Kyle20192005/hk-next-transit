import { useColorScheme } from 'react-native';

/**
 * 設計變數：同網頁版 apps/web/app/globals.css 一致（改一邊要改埋另一邊）。
 * 黃色（brand）只做底色（標題列、主要按鈕），上面用 onBrand 深色字；白底上要突出嘅字用 accent。
 */
const light = {
  bg: '#f2f3f5',
  /** 港鐵路綫圖嘅海（同網頁 --water） */
  water: '#d9edf9',
  card: '#ffffff',
  surface2: '#f6f7f9',
  text: '#111318',
  muted: '#646b78',
  line: '#e5e7eb',
  brand: '#ffc72c',
  onBrand: '#1a1a1a',
  onBrandSoft: 'rgba(0,0,0,0.08)',
  brandSoft: '#fff4d1',
  accent: '#8a5300',
  routeLine: '#c26a00',
  special: '#b3261e',
  specialSoft: '#fdecea',
  ok: '#157a37',
  okSoft: '#e3f4e8',
  idle: '#a1271f',
};
const dark: typeof light = {
  bg: '#0b0d11',
  water: '#10283a',
  card: '#161920',
  surface2: '#1d2128',
  text: '#edeef1',
  muted: '#9ba2ae',
  line: '#272c35',
  brand: '#f5bf1d',
  onBrand: '#1a1a1a',
  onBrandSoft: 'rgba(0,0,0,0.1)',
  brandSoft: '#332a0b',
  accent: '#ffd666',
  routeLine: '#ffad33',
  special: '#f2b8b5',
  specialSoft: '#3a1f1d',
  ok: '#7fd49b',
  okSoft: '#173322',
  idle: '#f2b8b5',
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { l: 18, m: 14, s: 10, bar: 24 };

/** 卡片陰影（iOS 用 shadow*，Android 用 elevation） */
export const shadow = {
  shadowColor: '#111318',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
export const shadowLg = {
  shadowColor: '#111318',
  shadowOpacity: 0.2,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 12,
} as const;

/** 數字等寬（到站時間、車費對齊） */
export const tabular = { fontVariant: ['tabular-nums' as const] };
