import { NextResponse } from 'next/server';
import { getCalendar } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** GET /api/calendar：GTFS 服務日曆，App 用嚟計走法今日幾時行 */
export async function GET() {
  return NextResponse.json(await getCalendar(), {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
