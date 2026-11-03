import { NextResponse } from 'next/server';
import { getRoute, isCo } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** GET /api/route/kmb/1A：路線資料（站點、走法、時間表、走線） */
export async function GET(_req: Request, ctx: { params: Promise<{ co: string; route: string }> }) {
  const { co, route } = await ctx.params;
  const data = isCo(co) ? await getRoute(co, route) : null;
  if (!data) return NextResponse.json({ error: `搵唔到路線 ${route}` }, { status: 404, headers: CORS });
  return NextResponse.json(data, {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
