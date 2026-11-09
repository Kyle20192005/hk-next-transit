import { NextResponse, type NextRequest } from 'next/server';
import { gmbOptIn, stopEtas } from '@hknt/core';
import { stopLiveDeps } from '@/lib/stop-routes';
import { CORS } from '@/lib/cors';
import { coParam, SAFE_STOP } from '@/lib/params';

/**
 * GET /api/stop-etas?co=ctb&stop=001106[&gmb=1]
 * 呢個站所有經過嘅路線嘅下一兩班車（邏輯喺 core `stopEtas`，同 tracker 共用；tracker 出事時前端退返呢度）。
 * 專線小巴站（co=gmb）要 `gmb=1`，否則 404（舊版 App 唔識新公司；core createLiveClient 會自動加）。
 */
export async function GET(req: NextRequest) {
  const co = coParam(req);
  const stop = req.nextUrl.searchParams.get('stop') ?? '';
  if (!co || !SAFE_STOP.test(stop)) return NextResponse.json({ error: 'co 或 stop 格式唔啱' }, { status: 400, headers: CORS });
  const body = await stopEtas(co, stop, stopLiveDeps, { gmb: gmbOptIn(req.nextUrl.searchParams) });
  if (!body) return NextResponse.json({ error: '搵唔到呢個站' }, { status: 404, headers: CORS });
  return NextResponse.json(body, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
