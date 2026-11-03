import { NextResponse, type NextRequest } from 'next/server';
import { etasAtStop, trackLine, variantStops } from '@hknt/core';
import { getCalendar, getRoute } from '@/lib/data';
import { coParam, SAFE_ROUTE } from '@/lib/params';
import { segmentsNow } from '@/lib/journey';
import { CORS } from '@/lib/cors';
import { liveFetch } from '@/lib/live-fetch';

/**
 * GET /api/buses?co=ctb&route=38&v=1540-1
 * 用成條線每個站嘅 ETA 追蹤呢個走法嘅巴士位置，同埋而家時段嘅每段行車時間。
 * 聯營線用兩間公司合併嘅 ETA；九巴「原定班次」唔係實時，唔用嚟追蹤。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const route = q.get('route') ?? '';
  const variantId = q.get('v') ?? '';
  const co = coParam(req);
  if (!co) return err(400, 'co 要係 ctb 或 kmb');
  if (!SAFE_ROUTE.test(route) || !/^[A-Za-z0-9-]{1,20}$/.test(variantId)) return err(400, 'route 或 v 格式唔啱');

  const [data, calendar] = await Promise.all([getRoute(co, route), getCalendar()]);
  if (!data) return err(404, `搵唔到路線 ${route}`);
  const v = data.variants.find((x) => x.id === variantId);
  if (!v) return err(404, `搵唔到走法 ${variantId}`);

  const now = new Date();
  const stops = variantStops(v);

  let perStop;
  try {
    perStop = await Promise.all(stops.map((s) => etasAtStop(data, s.stopId, calendar, liveFetch).catch(() => [])));
  } catch (e) {
    return err(502, `營辦商 API 出錯：${(e as Error).message}`);
  }
  // 只留屬於呢個走法嘅班次：推斷到係呢個走法，或者推斷唔到但 seq 吻合
  const stopEtas = perStop.map((etas, i) => {
    const s = stops[i]!;
    return etas
      .filter((e) => e.dir === s.dir && e.eta && !e.scheduled)
      .filter((e) => e.variant?.variantId === v.id || (!e.variant?.variantId && e.seq === s.seq))
      .map((e) => Date.parse(e.eta!));
  });

  // 行車時間：先用而家時段嘅實測，再用 ETA 本身嘅時間差修正（令位置同到站時間一致）
  const { segSeconds: hourlySeg, hourly } = await segmentsNow(v, stops, calendar, now);
  const { buses, segSeconds } = trackLine(stopEtas, hourlySeg, now.getTime());

  return NextResponse.json(
    {
      route: data.route,
      variant: v.id,
      fetchedAt: now.toISOString(),
      segSeconds,
      /** 有幾多段用咗而家時段嘅實測行車時間（其餘用平均） */
      hourlySegments: hourly,
      buses: buses.map((b) => ({ from: b.from, nextEta: new Date(b.nextEta).toISOString() })),
      // ?debug=1：每個站屬於呢個走法嘅 ETA，方便檢查追蹤結果
      ...(q.get('debug') === '1' ? { stopEtas: stopEtas.map((l, i) => ({ stop: stops[i]!.stopId, etas: l.map((t) => new Date(t).toISOString()) })) } : {}),
    },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=10' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}
