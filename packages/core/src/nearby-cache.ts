import { metresBetween } from './geo';

/**
 * 「附近」結果記低（網頁 localStorage、App AsyncStorage，只喺呢部機）：重開首頁唔使每次等定位同 /api/nearby。
 * - 1 分鐘內：直接用，唔再定位
 * - 15 分鐘內：即刻顯示，背景靜靜雞再定位，有變先更新
 * - 再耐（或者範圍設定改咗）：當冇，照正常定位
 */
export const NEARBY_CACHE_KEY = 'hknt.nearby.v1';
export const NEARBY_FRESH_MS = 60_000;
export const NEARBY_KEEP_MS = 15 * 60_000;
/** 新位置同上次相差幾多米以內當冇郁過（唔使再問 /api/nearby） */
export const NEARBY_MOVED_M = 40;

export interface NearbyCache<S> {
  at: number;
  radius: number;
  lat: number;
  lng: number;
  stops: S[];
  area: { n: string; en: string | null } | null;
  /** 附近港鐵站（舊版快取冇） */
  mtr?: NearMtr[];
}

/** 附近港鐵站（`/api/nearby` 回傳，由近到遠） */
export interface NearMtr {
  sta: string;
  /** 直綫距離（米） */
  distance: number;
}

/** 'fresh' = 直接用；'stale' = 先顯示再背景更新；null = 唔用 */
export function nearbyCacheUse(c: NearbyCache<unknown> | null, now: number, radius: number): 'fresh' | 'stale' | null {
  if (!c || c.radius !== radius || !Array.isArray(c.stops)) return null;
  const age = now - c.at;
  if (age < 0 || age > NEARBY_KEEP_MS) return null;
  return age <= NEARBY_FRESH_MS ? 'fresh' : 'stale';
}

/** 讀返嚟嘅 JSON 唔啱格式就當冇 */
export function parseNearbyCache<S>(raw: string | null): NearbyCache<S> | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as NearbyCache<S>;
    return typeof c?.at === 'number' && typeof c.lat === 'number' && typeof c.lng === 'number' && Array.isArray(c.stops) ? c : null;
  } catch {
    return null;
  }
}

/** 位置有冇郁過（超過 NEARBY_MOVED_M） */
export function nearbyMoved(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return metresBetween([a.lat, a.lng], [b.lat, b.lng]) > NEARBY_MOVED_M;
}
