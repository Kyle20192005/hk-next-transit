import { NextResponse, type NextRequest } from 'next/server';
import { isMtrStation, mtrStationEtas } from '@hknt/core';
import { liveFetch } from '@/lib/live-fetch';
import { CORS } from '@/lib/cors';

/** GET /api/mtr?sta=TST：港鐵站所有綫嘅到站時間（tracker 有同一個 endpoint，前端先問 tracker） */
export async function GET(req: NextRequest) {
  const sta = (req.nextUrl.searchParams.get('sta') ?? '').toUpperCase();
  if (!isMtrStation(sta)) return NextResponse.json({ error: '冇呢個港鐵站' }, { status: 400, headers: CORS });
  const { lines, failed } = await mtrStationEtas(sta, liveFetch);
  return NextResponse.json({ sta, fetchedAt: new Date().toISOString(), lines, failed }, { headers: { ...CORS, 'Cache-Control': failed.length ? 'no-store' : 'public, s-maxage=10' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
