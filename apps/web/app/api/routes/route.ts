import { NextResponse } from 'next/server';
import { getIndex } from '@/lib/data';
import { CORS } from '@/lib/cors';

/** GET /api/routes：所有路線（城巴、九巴、龍運；聯營線只出一次） */
export async function GET() {
  return NextResponse.json(await getIndex(), {
    headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
