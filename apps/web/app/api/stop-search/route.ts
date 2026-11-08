import { NextResponse, type NextRequest } from 'next/server';
import { searchStopRoutes } from '@hknt/core';
import { getAllStops } from '@/lib/data';
import { CORS } from '@/lib/cors';

/**
 * GET /api/stop-search?q=北角：站名有 q 嘅站經過嘅路線（路線列表「地點」搜尋，中途站都搵到）。
 * 站點索引幾 MB，唔適合俾前端下載，所以喺伺服器搵（lib/data.ts 記憶體 cache）。數據每日更新一次，所以 CDN cache 一個鐘。
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 30);
  const routes = q.trim() ? searchStopRoutes(await getAllStops(), q) : [];
  return NextResponse.json({ q, routes }, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
