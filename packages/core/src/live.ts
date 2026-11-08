import { etasAtStopDetailed } from './eta';
import { mergeScheduleBuses, scheduleBuses, trackLine } from './tracking';
import type { Calendar, RouteData, Variant } from './types';
import { variantStops, type VariantStop } from './variant';

/**
 * 巴士位置（成條線）：Vercel `/api/buses` 同 tracker `/api/buses` 共用呢度，兩邊計法一定一樣。
 * fetcher = 問巴士公司嘅 fetch（Vercel 用 no-store；tracker 用有 cache、合併、限流嗰個）。
 */

/** hk-bus-time-between-stops 按時段實測：{ 起點站: { 下一站: 秒 } } */
export type HourlyTimes = Record<string, Record<string, number>>;

/**
 * 而家時段嘅每段行車時間：有實測就用，冇就用走法平均（variant.segSeconds）；
 * 同平均相差太遠（< 0.4 倍或 > 3 倍）當異常。hourly = 有幾多段用咗實測。
 */
export function segmentsFromHourly(v: Variant, stops: VariantStop[], times: HourlyTimes): { segSeconds: number[]; hourly: number } {
  const avg = v.segSeconds ?? stops.slice(1).map(() => 60);
  let hourly = 0;
  const segSeconds = avg.map((a, i) => {
    const t = times[stops[i]!.stopId]?.[stops[i + 1]!.stopId];
    if (t && t > 0 && t >= a * 0.4 && t <= a * 3) {
      hourly++;
      return Math.round(t);
    }
    return a;
  });
  return { segSeconds, hourly };
}

/** 要載入邊幾個實測檔（站 ID 頭兩位） */
export const hourlyPrefixes = (stops: VariantStop[]) => [...new Set(stops.map((s) => s.stopId.slice(0, 2)))];

export interface LiveBusOut {
  from: number;
  nextEta: string;
  company: string;
  gps?: { lat: number; lng: number };
  schedule?: true;
}

export interface BusesResult {
  route: string;
  variant: string;
  fetchedAt: string;
  segSeconds: number[];
  /** 有幾多段用咗而家時段嘅實測行車時間（其餘用平均） */
  hourlySegments: number;
  buses: LiveBusOut[];
  /** 攞唔到數據嘅公司（可能少咗車） */
  failed: string[];
  /** ?debug=1：每個站屬於呢個走法嘅 ETA */
  stopEtas?: { stop: string; etas: string[] }[];
}

/**
 * 計一個走法嘅巴士位置。聯營線用兩間公司合併嘅 ETA；九巴「原定」、新大嶼山冇 GPS 嘅唔用嚟追蹤；
 * 新大嶼山用政府時間表補返冇 GPS 嘅車（地圖半透明）。
 */
export async function computeBuses(
  data: RouteData,
  v: Variant,
  calendar: Calendar,
  fetcher: typeof fetch,
  hourlyTimes: HourlyTimes,
  now = new Date(),
  debug = false,
): Promise<BusesResult> {
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
  // 每個站：到站時間 -> 公司／GPS（追蹤完之後用嚟標明每架車屬邊間公司）
  const companyAt = perStop.map((etas) => new Map(etas.filter((e) => e.eta).map((e) => [Date.parse(e.eta!), e.company as string])));
  const gpsAt = perStop.map((etas) => new Map(etas.filter((e) => e.eta && e.gps).map((e) => [Date.parse(e.eta!), e.gps!])));
  // 只留屬於呢個走法嘅班次：推斷到係呢個走法，或者推斷唔到但 seq 吻合
  const stopEtas = perStop.map((etas, i) => {
    const s = stops[i]!;
    return etas
      .filter((e) => e.dir === s.dir && e.eta && !e.scheduled && !e.noGps)
      .filter((e) => e.variant?.variantId === v.id || (!e.variant?.variantId && e.seq === s.seq))
      .map((e) => Date.parse(e.eta!));
  });

  const { segSeconds: hourlySeg, hourly } = segmentsFromHourly(v, stops, hourlyTimes);
  // 新大嶼山巴士用平均行車時間：時間表推算嘅車都要用同一套，前端先推得準
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
    ...(debug ? { stopEtas: stopEtas.map((l, i) => ({ stop: stops[i]!.stopId, etas: l.map((t) => new Date(t).toISOString()) })) } : {}),
  };
}
