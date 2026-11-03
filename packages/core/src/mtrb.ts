import type { Eta } from './types';

export const MTRB_URL = 'https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule';

interface MtrbBusRaw {
  busId: string;
  /** 秒；108000 之類嘅大數 = 冇數據 */
  arrivalTimeInSecond: string;
  departureTimeInSecond: string;
  /** "1" = 按時間表（未開出），"0" = 實時 */
  isScheduled: string;
  /** 方向：同路線 CSV 嘅 LINE_UP（O）／LINE_DOWN（I）一樣 */
  lineRef: string;
  busLocation: { latitude: number; longitude: number };
  busRemark: string | null;
}

interface MtrbRaw {
  busStop: { busStopId: string; isSuspended: string; bus: MtrbBusRaw[] }[];
}

/** 呢個數以上當冇數據（API 用 108000 表示「冇」） */
const NO_DATA = 100000;

/** 港鐵巴士嘅 ETA 一次 call 攞晒成條線；同一個請求入面重複用，3 秒內唔再問 */
const memo = new Map<string, { at: number; data: Promise<MtrbRaw> }>();
const MEMO_MS = 3000;

async function fetchLine(route: string, fetcher: typeof fetch): Promise<MtrbRaw> {
  const hit = memo.get(route);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.data;
  const data = (async () => {
    const res = await fetcher(MTRB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'zh', routeName: route }),
    });
    if (!res.ok) throw new Error(`港鐵巴士 ETA ${res.status}`);
    return (await res.json()) as MtrbRaw;
  })();
  memo.set(route, { at: Date.now(), data });
  data.catch(() => memo.delete(route));
  return data;
}

/**
 * 港鐵巴士某站嘅到站時間（全部方向；每班車帶 lineRef 喺 remarkEn，用嚟對走法）。
 * 到站用 arrivalTimeInSecond，冇就用 departureTimeInSecond（總站開出）。
 */
export async function fetchMtrbEta(route: string, stopId: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<(Eta & { lineRef: string })[]> {
  const data = await fetchLine(route, fetcher);
  const stop = data.busStop?.find((s) => s.busStopId === stopId);
  if (!stop || stop.isSuspended === '1') return [];
  return stop.bus.flatMap((b) => {
    const arr = Number(b.arrivalTimeInSecond);
    const dep = Number(b.departureTimeInSecond);
    const sec = arr < NO_DATA && arr > 0 ? arr : dep < NO_DATA ? dep : NaN;
    if (!Number.isFinite(sec)) return [];
    const gps = b.busLocation && b.busLocation.latitude ? { lat: b.busLocation.latitude, lng: b.busLocation.longitude } : undefined;
    return [
      {
        company: 'MTRB' as const,
        route,
        dir: stopId.includes('-D') ? ('I' as const) : ('O' as const),
        stopId,
        eta: toHkIso(now + sec * 1000),
        seq: 0,
        destTc: '',
        destEn: '',
        remarkTc: b.busRemark ?? '',
        remarkEn: '',
        scheduled: b.isScheduled === '1',
        gps,
        busId: b.busId,
        lineRef: b.lineRef,
      },
    ];
  });
}

/** 毫秒 -> 香港時間 ISO（例如 2026-11-03T19:31:05+08:00），同其他營辦商一致，介面直接攞 HH:MM */
export function toHkIso(ms: number): string {
  return `${new Date(ms + 8 * 3600_000).toISOString().slice(0, 19)}+08:00`;
}
