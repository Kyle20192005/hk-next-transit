import { NextResponse, type NextRequest } from 'next/server';
import { getAllStops } from '@/lib/data';
import { routesAtStop } from '@/lib/stop-routes';
import { CORS } from '@/lib/cors';
import { coParam, SAFE_STOP } from '@/lib/params';

/**
 * GET /api/stop-etas?co=ctb&stop=001106
 * 呢個站所有經過嘅路線嘅下一兩班車。
 * - 九巴站：九巴有「一個站所有路線」嘅 API，一次 call 攞晒
 * - 城巴站：要逐條路線 call；聯營線合併埋九巴嘅車
 */
export async function GET(req: NextRequest) {
  const co = coParam(req);
  const stop = req.nextUrl.searchParams.get('stop') ?? '';
  if (!co || !SAFE_STOP.test(stop)) return NextResponse.json({ error: 'co 或 stop 格式唔啱' }, { status: 400, headers: CORS });
  const entry = (await getAllStops()).find((s) => s.id === stop && s.co === co);
  if (!entry) return NextResponse.json({ error: '搵唔到呢個站' }, { status: 404, headers: CORS });

  const now = Date.now();
  const routes = await routesAtStop(entry, now);
  return NextResponse.json(
    { stop, co, name: entry.n, fetchedAt: new Date(now).toISOString(), routes },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
