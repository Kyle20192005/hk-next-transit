import { NextResponse, type NextRequest } from 'next/server';
import { getAllStops, getIndex } from '@/lib/data';
import { CORS } from '@/lib/cors';

const MAX_DISTANCE_M = 600;
const MAX_STOPS = 15;

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** GET /api/nearby?lat=22.28&lng=114.15：附近（600 米內）最近嘅巴士站（城巴、九巴）同經過嘅路線 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  // 只接受香港範圍
  if (!(lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5)) {
    return NextResponse.json({ error: '位置唔喺香港範圍' }, { status: 400, headers: CORS });
  }
  const [all, index] = await Promise.all([getAllStops(), getIndex()]);
  const companiesOf = new Map(index.routes.map((r) => [`${r.co ?? 'ctb'}/${r.route}`, r.companies ?? ['CTB']]));
  const stops = all
    .map((s) => ({ ...s, distance: Math.round(metres(lat, lng, s.lat, s.lng)) }))
    .filter((s) => s.distance <= MAX_DISTANCE_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_STOPS)
    .map((s) => ({
      id: s.id,
      co: s.co,
      name: s.n,
      lat: s.lat,
      lng: s.lng,
      distance: s.distance,
      routes: s.r.map(([co, route, dir, dest]) => ({ co, route, dir, dest, companies: companiesOf.get(`${co}/${route}`) ?? [] })),
    }));
  return NextResponse.json({ stops }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
