import { etasAtStopDetailed, mergeScheduleBuses, scheduleBuses, trackLine, variantStops, type Calendar, type RouteData, type Variant } from '@hknt/core';
import { segmentsNow } from './segments';

/** 同網頁 /api/buses 一樣嘅回應格式（前端改網址就用得） */
export interface BusesSnapshot {
  route: string;
  variant: string;
  fetchedAt: string;
  segSeconds: number[];
  hourlySegments: number;
  buses: { from: number; nextEta: string; company: string; gps?: { lat: number; lng: number }; schedule?: true }[];
  /** 攞唔到數據嘅公司（有就代表可能少咗車） */
  failed: string[];
}

/**
 * 計一個走法嘅巴士位置（邏輯同 apps/web/app/api/buses/route.ts 一樣；之後兩邊都改用呢度）。
 * fetcher = tracker 嘅 upstream fetch（cache + 合併 + 限流）。
 */
export async function computeBuses(data: RouteData, v: Variant, calendar: Calendar, fetcher: typeof fetch, now = new Date()): Promise<BusesSnapshot> {
  const stops = variantStops(v);
  const failed = new Set<string>();
  const perStop = await Promise.all(
    stops.map((s) =>
      etasAtStopDetailed(data, s.stopId, calendar, fetcher)
        .then((r) => {
          r.failed.forEach((c) => failed.add(c));
          return r.etas;
        })
        .catch(() => []),
    ),
  );
  const companyAt = perStop.map((etas) => new Map(etas.filter((e) => e.eta).map((e) => [Date.parse(e.eta!), e.company as string])));
  const gpsAt = perStop.map((etas) => new Map(etas.filter((e) => e.eta && e.gps).map((e) => [Date.parse(e.eta!), e.gps!])));
  const stopEtas = perStop.map((etas, i) => {
    const s = stops[i]!;
    return etas
      .filter((e) => e.dir === s.dir && e.eta && !e.scheduled && !e.noGps)
      .filter((e) => e.variant?.variantId === v.id || (!e.variant?.variantId && e.seq === s.seq))
      .map((e) => Date.parse(e.eta!));
  });

  const { segSeconds: hourlySeg, hourly } = await segmentsNow(v, stops, calendar, now);
  const baseSeg = data.company === 'NLB' && v.segSeconds ? v.segSeconds : hourlySeg;
  const tracked = trackLine(stopEtas, baseSeg, now.getTime());
  const { segSeconds } = tracked;
  const buses = data.company === 'NLB' ? mergeScheduleBuses(tracked.buses, scheduleBuses(v, calendar, baseSeg, now), segSeconds, now.getTime()) : tracked.buses;

  return {
    route: data.route,
    variant: v.id,
    fetchedAt: now.toISOString(),
    segSeconds,
    hourlySegments: baseSeg === hourlySeg ? hourly : 0,
    buses: buses.map((b) => {
      const gps = gpsAt[b.from + 1]?.get(b.nextEta);
      return {
        from: b.from,
        nextEta: new Date(b.nextEta).toISOString(),
        company: companyAt[b.from + 1]?.get(b.nextEta) ?? data.company,
        ...(gps ? { gps } : {}),
        ...(b.schedule ? { schedule: true as const } : {}),
      };
    }),
    failed: [...failed],
  };
}
