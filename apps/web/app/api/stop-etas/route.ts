import { NextResponse, type NextRequest } from 'next/server';
import { fetchCtbEta } from '@hknt/core';
import { getCtbStops } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** 每個「站 + 路線」嘅城巴 ETA cache 幾多秒 */
const CACHE_S = 15;

/**
 * GET /api/stop-etas?stop=001106
 * 呢個站所有經過嘅路線嘅下一兩班車（城巴冇「一個站所有路線」嘅 API，要逐條路線 call，所以由後端做同 cache）。
 */
export async function GET(req: NextRequest) {
  const stop = req.nextUrl.searchParams.get('stop') ?? '';
  if (!/^\d{6}$/.test(stop)) return NextResponse.json({ error: 'stop 格式唔啱' }, { status: 400, headers: CORS });
  const entry = (await getCtbStops()).find((s) => s.id === stop);
  if (!entry) return NextResponse.json({ error: '搵唔到呢個站' }, { status: 404, headers: CORS });

  const cachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, next: { revalidate: CACHE_S } });
  const routes = [...new Set(entry.r.map(([route]) => route))];
  const byRoute = new Map(
    await Promise.all(routes.map(async (r) => [r, await fetchCtbEta(stop, r, cachedFetch).catch(() => [])] as const)),
  );
  const now = Date.now();
  const result = entry.r.map(([route, dir, dest]) => ({
    route,
    dir,
    dest,
    etas: (byRoute.get(route) ?? [])
      .filter((e) => e.dir === dir && e.eta && Date.parse(e.eta) >= now - 60_000)
      .slice(0, 3)
      .map((e) => ({ eta: e.eta, remark: e.remarkTc })),
  }));
  return NextResponse.json(
    { stop, name: entry.n, fetchedAt: new Date(now).toISOString(), routes: result },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
