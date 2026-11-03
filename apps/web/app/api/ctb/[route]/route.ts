import { NextResponse } from 'next/server';
import { getCtbRoute } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** GET /api/ctb/38：路線資料（站點、走法、時間表、走線），App 用 */
export async function GET(_req: Request, ctx: { params: Promise<{ route: string }> }) {
  const { route } = await ctx.params;
  const data = await getCtbRoute(route);
  if (!data) return NextResponse.json({ error: `搵唔到城巴 ${route}` }, { status: 404, headers: CORS });
  return NextResponse.json(data, {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
