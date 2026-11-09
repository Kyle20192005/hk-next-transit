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
/**
 * 試唔試電車公司網站實時：2026-11-09 測試用唔到（開發環境回應空 <root/>、冇班次；Vercel 香港 2 秒超時），
 * 所以先熄咗，每個站即刻用時間表。網站將來正常返就改 true（程式碼保留）。
 */
const TRY_REALTIME = false;
const memo = new Map<string, { at: number; v: TramEta[] | null }>();
/** 網站冇回應（超時、連唔到）就暫停問 2 分鐘：唔好令每個站都等超時先出時間表 */
let downUntil = 0;
/** 最近一次攞唔到實時嘅原因（HTTP 狀態、超時等），回應入面俾人睇（診斷用） */
let lastProblem: string | null = null;

async function nextTram(code: string): Promise<TramEta[] | null> {
  const hit = memo.get(code);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  if (Date.now() < downUntil) return null;
  let v: TramEta[] | null = null;
  try {
    const res = await liveFetch(NEXT_TRAM + encodeURIComponent(code), { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const text = await res.text();
      v = parseTramEta(text);
      lastProblem = v === null ? `看唔明回應（${text.slice(0, 40)}）` : v.length ? null : '回應冇班次';
    } else lastProblem = `HTTP ${res.status}`;
  } catch (e) {
    v = null;
    lastProblem = (e as Error).name === 'TimeoutError' ? '超時' : `連唔到（${(e as Error).message}）`;
    downUntil = Date.now() + 120_000;
  }
  memo.set(code, { at: Date.now(), v });
  return v;
}

export async function GET(req: NextRequest) {
  const sta = req.nextUrl.searchParams.get('sta') ?? '';
  if (!isTramStation(sta)) return NextResponse.json({ error: '冇呢個電車站' }, { status: 400, headers: CORS });
  const st = tramStation(sta)!;
  const [tt, calendar, lives] = await Promise.all([getTramTimetable(), getCalendar(), TRY_REALTIME ? Promise.all(st.codes.map(nextTram)) : Promise.resolve([])]);
  const got = lives.filter((x): x is TramEta[] => x !== null);
  // 回應咗但係空（<root/>）都當攞唔到：分唔到係「冇車」定係網站冇提供
  const realtime = got.some((x) => x.length) ? got.flat().sort((a, b) => a.at - b.at) : null;
  const schedule = tt ? tramStopSchedule(tt, calendar, sta, new Date()) : [];
  return NextResponse.json(
    { sta, fetchedAt: new Date().toISOString(), realtime, realtimeStatus: !TRY_REALTIME ? 'off' : realtime ? 'ok' : got.length ? 'empty' : 'error', realtimeProblem: realtime || !TRY_REALTIME ? null : lastProblem, schedule, fare: tt?.fare ?? null },
    { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
