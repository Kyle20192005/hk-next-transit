import { NextResponse, type NextRequest } from 'next/server';
import { getAllStops, getIndex } from '@/lib/data';
import { routesAtStop } from '@/lib/stop-routes';
import { CORS } from '@/lib/cors';

/** 幾多米內當係「同一個位置」：城巴、九巴同一個站頭通常係兩個站 ID，有時隔幾步 */
const DEFAULT_R = 40;
const MAX_R = 80;
/** 最多合併幾多個站（避免繁忙路口 call 太多） */
const MAX_STOPS = 6;

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * GET /api/here?lat=22.28&lng=114.15[&r=40]
 * 「喺度搭得」：呢個位置（r 米內所有公司嘅站）可以搭嘅所有路線同下一兩班車。
 * 同一條線（公司＋號碼＋方向）喺幾個站都有，只留最近嗰個站。按下一班排先後，冇班次排最後。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const r = Math.min(MAX_R, Math.max(10, Number(q.get('r')) || DEFAULT_R));
  if (!(lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5)) {
    return NextResponse.json({ error: '位置唔喺香港範圍' }, { status: 400, headers: CORS });
  }
  const [all, index] = await Promise.all([getAllStops(), getIndex()]);
  const companiesOf = new Map(index.routes.map((x) => [`${x.co ?? 'ctb'}/${x.route}`, x.companies ?? ['CTB']]));
  const stops = all
    .map((s) => ({ s, d: Math.round(metres(lat, lng, s.lat, s.lng)) }))
    .filter((x) => x.d <= r)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_STOPS);

  const now = Date.now();
  const perStop = await Promise.all(stops.map(({ s }) => routesAtStop(s, now).catch(() => [])));

  // 合併：同一條線同一個方向只留最近嘅站（stops 已經由近到遠）
  const seen = new Map<string, ReturnType<typeof toRow>>();
  function toRow(i: number, x: Awaited<ReturnType<typeof routesAtStop>>[number]) {
    const { s, d } = stops[i]!;
    return { ...x, companies: companiesOf.get(`${x.co}/${x.route}`) ?? [], stopId: s.id, stopCo: s.co, stopName: s.n, distance: d };
  }
  perStop.forEach((list, i) => {
    for (const x of list) {
      const key = `${x.co}/${x.route}/${x.dir}`;
      if (!seen.has(key)) seen.set(key, toRow(i, x));
    }
  });
  const next = (x: { etas: { eta: string }[] }) => (x.etas[0] ? Date.parse(x.etas[0].eta) : Infinity);
  const routes = [...seen.values()].sort((a, b) => next(a) - next(b) || a.route.localeCompare(b.route, 'en', { numeric: true }));

  return NextResponse.json(
    {
      fetchedAt: new Date(now).toISOString(),
      radius: r,
      stops: stops.map(({ s, d }) => ({ id: s.id, co: s.co, name: s.n, distance: d })),
      routes,
    },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
