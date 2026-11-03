import { NextResponse, type NextRequest } from 'next/server';
import { etasAtStop } from '@hknt/core';
import { getCalendar, getRoute } from '@/lib/data';
import { CORS } from '@/lib/cors';
import { liveFetch } from '@/lib/live-fetch';
import { coParam, SAFE_ROUTE, SAFE_STOP } from '@/lib/params';

/**
 * GET /api/eta?co=ctb&route=101&stop=001152
 * 某條路線喺某個站嘅到站時間：聯營線合併城巴同九巴，每班車標明公司同推斷走法；九巴「原定班次」有 scheduled。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const co = coParam(req);
  const route = q.get('route') ?? '';
  const stop = q.get('stop') ?? '';
  if (!co) return err(400, 'co 要係 ctb 或 kmb');
  if (!SAFE_ROUTE.test(route) || !SAFE_STOP.test(stop)) return err(400, 'route 或 stop 格式唔啱');

  const [data, calendar] = await Promise.all([getRoute(co, route), getCalendar()]);
  if (!data) return err(404, `搵唔到路線 ${route}`);

  const etas = await etasAtStop(data, stop, calendar, liveFetch);
  return NextResponse.json(
    { route: data.route, stop, fetchedAt: new Date().toISOString(), etas },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=10' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}
