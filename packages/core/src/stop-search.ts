import type { AnyStopEntry } from './stop-live';
import type { Co } from './ids';
import { routeCode } from './gmb';

/** 經過某個站嘅路線（地點搜尋：中途站都搵到） */
export interface StopRouteHit {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  stopId: string;
  stopName: string;
}

/** 搜尋用：全形轉半形（NFKC）、細楷、拎走空格同標點 */
export function normalizePlace(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s,，、.()（）\-]/g, '');
}

/**
 * 站名有 q 嘅站，經過嘅路線（每條線每個方向一個，用第一個撞中嘅站）。
 * 站點索引唔包終點站，起點終點由路線索引嘅 origTc／destTc 搵。最多 limit 個。
 * `keep`：只要邊啲公司（/api/stop-search 嘅 mode：巴士、專線小巴分開搵，小巴唔會逼走巴士結果）。
 */
export function searchStopRoutes(stops: readonly AnyStopEntry[], q: string, limit = 400, keep?: (co: Co) => boolean): StopRouteHit[] {
  const nq = normalizePlace(q);
  if (!nq) return [];
  const out: StopRouteHit[] = [];
  const seen = new Set<string>();
  for (const s of stops) {
    if (keep && !s.r.some(([co]) => keep(co))) continue;
    if (!normalizePlace(s.n).includes(nq)) continue;
    for (const [co, route, dir] of s.r) {
      if (keep && !keep(co)) continue;
      const key = `${co}/${route}/${dir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ co, route, dir, stopId: s.id, stopName: s.n });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 地點搜尋結果：路線，同埋（如果係經過）每個方向經邊個站 */
export interface PlaceMatch<R> {
  r: R;
  via: Partial<Record<'O' | 'I', StopRouteHit>>;
}

/**
 * 路線列表「地點」搜尋：起點／終點／號碼撞中嘅排先，之後係中途站經過嘅（`hits` 由 /api/stop-search 嚟，未返嚟就係空）。
 * 次序跟返路線索引。
 */
export function placeMatches<R extends { co?: Co; route: string; origTc?: string; destTc?: string }>(routes: readonly R[], q: string, hits: readonly StopRouteHit[]): PlaceMatch<R>[] {
  const nq = normalizePlace(q);
  if (!nq) return routes.map((r) => ({ r, via: {} }));
  const via = new Map<string, PlaceMatch<R>['via']>();
  for (const h of hits) {
    const key = `${h.co}/${h.route}`;
    const v = via.get(key) ?? {};
    v[h.dir] ??= h;
    via.set(key, v);
  }
  const direct: PlaceMatch<R>[] = [];
  const passing: PlaceMatch<R>[] = [];
  for (const r of routes) {
    const found = via.get(`${r.co ?? 'ctb'}/${r.route}`);
    const origHit = normalizePlace(r.origTc ?? '').includes(nq);
    const destHit = normalizePlace(r.destTc ?? '').includes(nq);
    // 撞中嘅站就係嗰個方向嘅起點（O 由 origTc、I 由 destTc 開出）：唔使再講「經」
    const v = found && { ...(found.O && !origHit ? { O: found.O } : {}), ...(found.I && !destHit ? { I: found.I } : {}) };
    // 號碼用顯示號碼（專線小巴 NT-2 → 2：打「nt」唔好成個新界撞中）
    if (origHit || destHit || normalizePlace(routeCode(r.co, r.route)).includes(nq)) direct.push({ r, via: v || {} });
    else if (v) passing.push({ r, via: v });
  }
  return [...direct, ...passing];
}
