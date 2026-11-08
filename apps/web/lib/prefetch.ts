'use client';
import { defaultDir, pickVariant, sortVariants, variantsForDir, type Calendar, type RouteData } from '@hknt/core';
import { busesClient } from './buses';

/**
 * 預先 fetch（docs/realtime-backend.md 階段 0.5）：趁用戶揀緊／撳落去未放手，提早準備數據。
 * - warmRoute：撳落路線時用。攞路線資料，揀同路線頁一樣嘅預設走法，call 一次 /api/buses，
 *   等伺服器 cache（10 秒）先熱；路線頁一開 call 同一條網址就即刻有。
 * - preloadRoute：候選得幾條時用。只攞路線資料（伺服器數據 cache 熱咗，路線頁 render 快啲），唔 call 巴士公司。
 * 同一條線 15 秒內唔重複，失敗靜靜雞（只係慢返啲）。
 */
const WARM_TTL_MS = 15_000;
const warmed = new Map<string, number>();
const routeCache = new Map<string, Promise<RouteData>>();
let calendarP: Promise<Calendar> | null = null;

const fresh = (key: string) => {
  const t = warmed.get(key);
  if (t && Date.now() - t < WARM_TTL_MS) return false;
  warmed.set(key, Date.now());
  return true;
};

function routeData(co: string, route: string): Promise<RouteData> {
  const key = `${co}/${route}`;
  let p = routeCache.get(key);
  if (!p) {
    p = fetch(`/api/route/${co}/${encodeURIComponent(route)}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<RouteData>;
    });
    p.catch(() => routeCache.delete(key));
    routeCache.set(key, p);
  }
  return p;
}

function calendar(): Promise<Calendar> {
  calendarP ??= fetch('/api/calendar')
    .then((r) => r.json() as Promise<Calendar>)
    .catch((e) => {
      calendarP = null;
      throw e;
    });
  return calendarP;
}

/** 只預載路線資料（唔 call 巴士公司） */
export function preloadRoute(co: string, route: string) {
  if (!fresh(`pre:${co}/${route}`)) return;
  routeData(co, route).catch(() => {});
}

/** 撳落路線：預熱嗰條線（預設走法）嘅巴士位置 */
export function warmRoute(co: string, route: string, opts: { dir?: string | null; stopId?: string | null } = {}) {
  if (!fresh(`warm:${co}/${route}/${opts.dir ?? ''}/${opts.stopId ?? ''}`)) return;
  void (async () => {
    const [data, cal] = await Promise.all([routeData(co, route), calendar()]);
    const dir = defaultDir(data, opts.dir);
    const v = pickVariant(sortVariants(variantsForDir(data, dir), cal, new Date()), dir, { stopId: opts.stopId });
    if (!v) return;
    // 網址要同 StopList 一模一樣，伺服器 cache 先會命中
    await busesClient.buses(co, data.route, v.id);
  })().catch(() => {});
}
