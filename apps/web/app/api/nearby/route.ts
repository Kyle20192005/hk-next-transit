import { NextResponse, type NextRequest } from 'next/server';
import { getCtbStops } from '@/lib/data';
import { CORS } from '@/lib/cors';

const MAX_DISTANCE_M = 600;
const MAX_STOPS = 12;

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** GET /api/nearby?lat=22.28&lng=114.15：附近（600 米內）最近嘅城巴站同經過嘅路線 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  // 只接受香港範圍
  if (!(lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5)) {
    return NextResponse.json({ error: '位置唔喺香港範圍' }, { status: 400, headers: CORS });
  }
  const stops = (await getCtbStops())
    .map((s) => ({ ...s, distance: Math.round(metres(lat, lng, s.lat, s.lng)) }))
    .filter((s) => s.distance <= MAX_DISTANCE_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_STOPS)
    .map((s) => ({ id: s.id, name: s.n, lat: s.lat, lng: s.lng, distance: s.distance, routes: s.r.map(([route, dir, dest]) => ({ route, dir, dest })) }));
  return NextResponse.json({ stops }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
