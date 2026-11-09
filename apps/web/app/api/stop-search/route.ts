import { NextResponse, type NextRequest } from 'next/server';
import { routeMode, searchStopRoutes, type Co } from '@hknt/core';
import { getAllStops } from '@/lib/data';
import { CORS } from '@/lib/cors';

/**
 * GET /api/stop-search?q=北角[&mode=bus|minibus]：站名有 q 嘅站經過嘅路線（路線列表「地點」搜尋，中途站都搵到）。
 * 站點索引幾 MB，唔適合俾前端下載，所以喺伺服器搵（lib/data.ts 記憶體 cache）。數據每日更新一次，所以 CDN cache 一個鐘。
 * `mode=minibus` 淨係專線小巴；其他（包括冇 mode，即係舊版 App）淨係巴士：舊版唔識專線小巴，分開搵小巴又唔會逼走巴士結果。
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 30);
  const mode = req.nextUrl.searchParams.get('mode') === 'minibus' ? 'minibus' : 'bus';
  const keep = (co: Co) => routeMode(co) === mode;
  const routes = q.trim() ? searchStopRoutes(await getAllStops(), q, 400, keep) : [];
  return NextResponse.json({ q, mode, routes }, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
