import { NextResponse, type NextRequest } from 'next/server';
import { capStopFamilies, gmbOptIn, isGmbStop, nearestMtrStations, pickArea } from '@hknt/core';
import { getAllStops, getIndex, getPlaces } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** 預設 600 米；設定可以揀 300／600／1000（`?r=`，最多 1000） */
const MAX_DISTANCE_M = 600;
/** 巴士站、專線小巴站各自最多幾多個（小巴站好多，一齊計會逼走巴士站） */
const MAX_STOPS = 15;
const MAX_GMB_STOPS = 8;

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * GET /api/nearby?lat=22.28&lng=114.15[&gmb=1]：附近（600 米內）最近嘅巴士站（所有公司）同經過嘅路線、地區名 `area`，
 * 同埋 2 公里內最近嘅港鐵站 `mtr`（最多 3 個，首頁大字同大卡用）。
 * 專線小巴站要 `gmb=1` 先出（舊版 App 唔識新公司），最多 8 個，唔佔巴士站嘅 15 個。
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  const rParam = Number(req.nextUrl.searchParams.get('r'));
  const maxDist = rParam > 0 ? Math.min(1000, Math.max(100, rParam)) : MAX_DISTANCE_M;
  // 只接受香港範圍
  if (!(lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5)) {
    return NextResponse.json({ error: '位置唔喺香港範圍' }, { status: 400, headers: CORS });
  }
  const [all, index, places] = await Promise.all([getAllStops(), getIndex(), getPlaces().catch(() => [])]);
  const companiesOf = new Map(index.routes.map((r) => [`${r.co ?? 'ctb'}/${r.route}`, r.companies ?? ['CTB']]));
  const withGmb = gmbOptIn(req.nextUrl.searchParams);
  // 加埋專線小巴成萬個站：先計距離篩走遠嘅，先至砌回應
  const near = all
    .filter((s) => withGmb || !isGmbStop(s))
    .map((s) => ({ s, distance: Math.round(metres(lat, lng, s.lat, s.lng)) }))
    .filter((x) => x.distance <= maxDist)
    .sort((a, b) => a.distance - b.distance);
  const stops = capStopFamilies(near, (x) => x.s.co, { bus: MAX_STOPS, gmb: MAX_GMB_STOPS })
    .map(({ s, distance }) => ({
      id: s.id,
      co: s.co,
      name: s.n,
      lat: s.lat,
      lng: s.lng,
      distance,
      routes: s.r.map(([co, route, dir, dest]) => ({ co, route, dir, dest, companies: companiesOf.get(`${co}/${route}`) ?? [] })),
    }));
  // 地區名（首頁大字，例如「青衣」「香港仔」）；冇地區數據就 null，前端用站頭名
  const area = pickArea(places, lat, lng);
  const mtr = nearestMtrStations(lat, lng, 2000, 3);
  return NextResponse.json({ stops, area, mtr }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
