import { NextResponse, type NextRequest } from 'next/server';
import { isMtrStation } from '@hknt/core';
import { CORS } from '@/lib/cors';
import FARES from '@/lib/mtr-fares.json';

/** 每個終點站：[八達通成人, 小童, 長者, 殘疾, 學生, 樂悠咭, 單程成人, 單程小童, 單程長者]（港鐵開放數據，tools/mtr-fares.py；機場快綫只有成人、小童，其他 null） */
const TABLE = FARES as Record<string, Record<string, (number | null)[]>>;

/** GET /api/mtr/fare?from=TIS：由呢個港鐵站去其他每個站嘅車費（只喺伺服器讀，唔入前端 bundle） */
export function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') ?? '';
  if (!isMtrStation(from)) return NextResponse.json({ error: '冇呢個港鐵站' }, { status: 400, headers: CORS });
  return NextResponse.json({ from, fares: TABLE[from] ?? {} }, { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=86400' } });
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
