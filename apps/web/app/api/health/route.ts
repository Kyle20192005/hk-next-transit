import { NextResponse } from 'next/server';
import { dataHealth } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** GET /api/health：檢查數據讀唔讀到（唔會顯示 token） */
export async function GET() {
  return NextResponse.json(await dataHealth(), { headers: { 'Cache-Control': 'no-store' } });
}
