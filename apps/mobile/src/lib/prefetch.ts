import { defaultDir, pickVariant, sortVariants, variantsForDir } from '@hknt/core';
import { api, cachedRoute, calendarOnce, freshRoute, type Co } from './api';

/**
 * 預先 fetch（docs/realtime-backend.md 階段 0.5，同網頁 lib/prefetch.ts 一樣）：
 * - warmRoute：撳落路線（onPressIn）。攞路線資料（順手寫入 App 快取），揀同路線頁一樣嘅預設走法，
 *   call 一次 /api/buses，令伺服器 cache 先熱；路線頁一開 call 同一條網址就即刻有。
 * - preloadRoute：候選得幾條時用。只攞路線資料寫入快取，唔 call 巴士公司。
 * 同一條線 15 秒內唔重複，失敗靜靜雞。
 */
const WARM_TTL_MS = 15_000;
const warmed = new Map<string, number>();
const fresh = (key: string) => {
  const t = warmed.get(key);
  if (t && Date.now() - t < WARM_TTL_MS) return false;
  warmed.set(key, Date.now());
  return true;
};

/** 快取有就用快取，冇先攞網上（預熱唔使最新，路線頁自己會再攞） */
async function routeData(co: Co, route: string) {
  return (await cachedRoute(co, route)) ?? freshRoute(co, route);
}

export function preloadRoute(co: Co, route: string) {
  if (!fresh(`pre:${co}/${route}`)) return;
  routeData(co, route).catch(() => {});
}

export function warmRoute(co: Co, route: string, opts: { dir?: string | null; stopId?: string | null } = {}) {
  if (!fresh(`warm:${co}/${route}/${opts.dir ?? ''}/${opts.stopId ?? ''}`)) return;
  void (async () => {
    const [data, cal] = await Promise.all([routeData(co, route), calendarOnce()]);
    const dir = defaultDir(data, opts.dir);
    const v = pickVariant(sortVariants(variantsForDir(data, dir), cal, new Date()), dir, { stopId: opts.stopId });
    if (v) await api.buses(co, data.route, v.id);
  })().catch(() => {});
}
