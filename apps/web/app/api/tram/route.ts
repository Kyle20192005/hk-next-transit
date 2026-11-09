import { NextResponse, type NextRequest } from 'next/server';
import { isTramStation, parseTramEta, tramStation, tramStopSchedule, type TramEta } from '@hknt/core';
import { getCalendar, getTramTimetable } from '@/lib/data';
import { liveFetch } from '@/lib/live-fetch';
import { CORS } from '@/lib/cors';

/**
 * GET /api/tram?sta=68W：電車站下幾班車。
 * - schedule：按運輸署時間表推算（每個目的地下幾班、而家幾多分鐘一班、頭尾班），一定有（數據未有電車就空）
 * - realtime：電車公司網站「下一班電車」（唔係開放數據，可能隨時停用、或者只喺部分地方回應）；攞唔到就 null，前端用時間表
 */
const NEXT_TRAM = 'https://www.hktramways.com/nextTram/geteat.php?stop_code=';
const memo = new Map<string, { at: number; v: TramEta[] | null }>();
/** 網站冇回應（超時、連唔到）就暫停問 2 分鐘：唔好令每個站都等超時先出時間表 */
let downUntil = 0;

async function nextTram(code: string): Promise<TramEta[] | null> {
  const hit = memo.get(code);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  if (Date.now() < downUntil) return null;
  let v: TramEta[] | null = null;
  try {
    const res = await liveFetch(NEXT_TRAM + encodeURIComponent(code), { signal: AbortSignal.timeout(2000) });
    if (res.ok) v = parseTramEta(await res.text());
  } catch {
    v = null;
    downUntil = Date.now() + 120_000;
  }
  memo.set(code, { at: Date.now(), v });
  return v;
}

export async function GET(req: NextRequest) {
  const sta = req.nextUrl.searchParams.get('sta') ?? '';
  if (!isTramStation(sta)) return NextResponse.json({ error: '冇呢個電車站' }, { status: 400, headers: CORS });
  const st = tramStation(sta)!;
  const [tt, calendar, lives] = await Promise.all([getTramTimetable(), getCalendar(), Promise.all(st.codes.map(nextTram))]);
  const got = lives.filter((x): x is TramEta[] => x !== null);
  // 回應咗但係空（<root/>）都當攞唔到：分唔到係「冇車」定係網站冇提供
  const realtime = got.some((x) => x.length) ? got.flat().sort((a, b) => a.at - b.at) : null;
  const schedule = tt ? tramStopSchedule(tt, calendar, sta, new Date()) : [];
  return NextResponse.json(
    { sta, fetchedAt: new Date().toISOString(), realtime, realtimeStatus: realtime ? 'ok' : got.length ? 'empty' : 'error', schedule, fare: tt?.fare ?? null },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
