import { NextResponse, type NextRequest } from 'next/server';
import { hereRoutes, inHongKong } from '@hknt/core';
import { stopLiveDeps } from '@/lib/stop-routes';
import { CORS } from '@/lib/cors';

/**
 * GET /api/here?lat=22.28&lng=114.15[&r=40]
 * 「喺度搭得」：呢個位置可以搭嘅所有路線同下一兩班車（邏輯喺 core `hereRoutes`，同 tracker 共用；tracker 出事時前端退返呢度）。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (!inHongKong(lat, lng)) return NextResponse.json({ error: '位置唔喺香港範圍' }, { status: 400, headers: CORS });
  const body = await hereRoutes(lat, lng, Number(q.get('r')) || null, stopLiveDeps);
  return NextResponse.json(body, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
