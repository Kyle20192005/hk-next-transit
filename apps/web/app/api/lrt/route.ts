import { NextResponse, type NextRequest } from 'next/server';
import { isLrtStop, lrtStationEtas } from '@hknt/core';
import { liveFetch } from '@/lib/live-fetch';
import { CORS } from '@/lib/cors';

/** GET /api/lrt?sta=600：輕鐵站每個月台嘅到站時間（tracker 有同一個 endpoint，前端先問 tracker） */
export async function GET(req: NextRequest) {
  const sta = req.nextUrl.searchParams.get('sta') ?? '';
  if (!isLrtStop(sta)) return NextResponse.json({ error: '冇呢個輕鐵站' }, { status: 400, headers: CORS });
  const { platforms, failed } = await lrtStationEtas(sta, liveFetch);
  return NextResponse.json({ sta, fetchedAt: new Date().toISOString(), platforms, failed }, { headers: { ...CORS, 'Cache-Control': failed ? 'no-store' : 'public, s-maxage=10' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
