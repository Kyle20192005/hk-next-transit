import { NextResponse, type NextRequest } from 'next/server';
import { fetchCtbEta, inferAll } from '@hknt/core';
import { getCalendar, getCtbRoute } from '@/lib/data';
import { CORS } from '@/lib/cors';

/**
 * GET /api/eta?company=ctb&route=38&stop=002186
 * 回傳統一格式、已推斷走法嘅到站時間。
 * CDN cache 10 秒：多人查同一個站只會 call 政府 API 一次。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const company = (q.get('company') ?? 'ctb').toLowerCase();
  const route = q.get('route') ?? '';
  const stop = q.get('stop') ?? '';
  if (company !== 'ctb') return err(400, '暫時只支援城巴（company=ctb）');
  if (!/^[A-Za-z0-9]{1,6}$/.test(route) || !/^\d{6}$/.test(stop)) return err(400, 'route 或 stop 格式唔啱');

  const [data, calendar] = await Promise.all([getCtbRoute(route), getCalendar()]);
  if (!data) return err(404, `搵唔到城巴 ${route}`);

  let etas;
  try {
    etas = await fetchCtbEta(stop, data.route);
  } catch (e) {
    return err(502, `城巴 API 出錯：${(e as Error).message}`);
  }
  return NextResponse.json(
    { route: data.route, stop, fetchedAt: new Date().toISOString(), etas: inferAll(data, etas, calendar) },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=10' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}
