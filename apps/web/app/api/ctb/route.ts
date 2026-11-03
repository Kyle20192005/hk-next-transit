import { NextResponse } from 'next/server';
import { getCtbIndex } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** GET /api/ctb：城巴路線列表，App 用 */
export async function GET() {
  return NextResponse.json(await getCtbIndex(), {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
