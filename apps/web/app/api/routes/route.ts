import { NextResponse, type NextRequest } from 'next/server';
import { gmbOptIn, routeMode } from '@hknt/core';
import { getIndex } from '@/lib/data';
import { CORS } from '@/lib/cors';

/**
 * GET /api/routes[?gmb=1]：所有路線（城巴、九巴、龍運、新大嶼山、港鐵巴士；聯營線只出一次）。
 * 專線小巴要 `gmb=1` 先出：舊版 App 唔識新公司（CompanyTag 會 throw），新版網頁同 App 一律加。
 */
export async function GET(req: NextRequest) {
  const index = await getIndex();
  // getIndex 係共用 cache：唔好改佢，整個新 object
  const body = gmbOptIn(req.nextUrl.searchParams) ? index : { ...index, routes: index.routes.filter((r) => routeMode(r.co) !== 'minibus') };
  return NextResponse.json(body, {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
