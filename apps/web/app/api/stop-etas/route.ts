import { NextResponse, type NextRequest } from 'next/server';
import { etasAtStop, fetchCtbEta, fetchKmbStopEta, type Eta } from '@hknt/core';
import { getAllStops, getIndex, getRoute } from '@/lib/data';
import { CORS } from '@/lib/cors';
import { liveFetch } from '@/lib/live-fetch';
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
  let etasFor: (route: string, dir: string) => Eta[];

  if (co === 'nlb' || co === 'mtrb') {
    // 新大嶼山巴士、港鐵巴士：逐條路線用路線檔查（走法明確，唔使時間表）
    const lists = await Promise.all(
      [...new Set(entry.r.map(([, route]) => route))].map(async (route) => {
        const data = await getRoute(co, route);
        return [route, data ? await etasAtStop(data, stop, {}, liveFetch).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  } else if (co === 'kmb') {
    const all = await fetchKmbStopEta(stop, liveFetch).catch(() => []);
    etasFor = (route, dir) => all.filter((e) => e.route === route && e.dir === dir);
  } else {
    const index = await getIndex();
    const joint = new Set(index.routes.filter((r) => (r.co ?? 'ctb') === 'ctb' && (r.companies?.length ?? 1) > 1).map((r) => r.route));
    const lists = await Promise.all(
      [...new Set(entry.r.map(([, route]) => route))].map(async (route) => {
        if (!joint.has(route)) return [route, await fetchCtbEta(stop, route, liveFetch).catch(() => [])] as const;
        const data = await getRoute('ctb', route);
        // 附近列表唔使推斷走法，所以唔使時間表（calendar 傳空）
        return [route, data ? await etasAtStop(data, stop, {}, liveFetch).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  }

  const routes = entry.r.map(([rco, route, dir, dest]) => ({
    co: rco,
    route,
    dir,
    dest,
    etas: etasFor(route, dir)
      .filter((e) => e.eta && Date.parse(e.eta) >= now - 60_000)
      .sort((a, b) => Date.parse(a.eta!) - Date.parse(b.eta!))
      .slice(0, 3)
      .map((e) => ({ eta: e.eta, company: e.company, scheduled: e.scheduled ?? false, remark: e.remarkTc })),
  }));
  return NextResponse.json(
    { stop, co, name: entry.n, fetchedAt: new Date(now).toISOString(), routes },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
