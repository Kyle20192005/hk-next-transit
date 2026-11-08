import { NextResponse, type NextRequest } from 'next/server';
import { computeBuses, variantStops } from '@hknt/core';
import { getCalendar, getRoute } from '@/lib/data';
import { coParam, SAFE_ROUTE } from '@/lib/params';
import { hourlyTimesFor } from '@/lib/journey';
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
  if (!co) return err(400, 'co 要係 ctb、kmb、nlb 或 mtrb');
  if (!SAFE_ROUTE.test(route) || !/^[A-Za-z0-9-]{1,20}$/.test(variantId)) return err(400, 'route 或 v 格式唔啱');

  const [data, calendar] = await Promise.all([getRoute(co, route), getCalendar()]);
  if (!data) return err(404, `搵唔到路線 ${route}`);
  const v = data.variants.find((x) => x.id === variantId);
  if (!v) return err(404, `搵唔到走法 ${variantId}`);

  const now = new Date();
  // 計法同 tracker 共用 core computeBuses（apps/tracker 出事時前端退返呢度）
  const hourly = await hourlyTimesFor(variantStops(v), calendar, now);
  let body;
  try {
    body = await computeBuses(data, v, calendar, liveFetch, hourly, now, q.get('debug') === '1');
  } catch (e) {
    return err(502, `營辦商 API 出錯：${(e as Error).message}`);
  }

  return NextResponse.json(
    body,
    // 有公司攞唔到（failed）：唔好 cache 呢個唔完整嘅結果
    { headers: { ...CORS, 'Cache-Control': body.failed.length ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=10' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}
