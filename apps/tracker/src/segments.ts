import { hourlySlot, type Calendar, type Variant, type VariantStop } from '@hknt/core';

/**
 * 而家時段嘅每段行車時間（同網頁 apps/web/lib/journey.ts 一樣）：hk-bus-time-between-stops 按「星期 + 鐘數」嘅實測，
 * 冇就用走法平均值；同平均值相差太遠（< 0.4 倍或 > 3 倍）當異常。檔案每小時更新，記憶體 cache 1 個鐘。
 */
const HOURLY_BASE = 'https://timeinterval.hkbuseta.com/times_hourly';
const TTL_MS = 3600_000;
type Times = Record<string, Record<string, number>>;
const memo = new Map<string, { at: number; data: Promise<Times> }>();

function loadPrefix(weekday: number, hour: string, prefix: string): Promise<Times> {
  const key = `${weekday}/${hour}/${prefix}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = fetch(`${HOURLY_BASE}/${key}.json`, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? (r.json() as Promise<Times>) : {}))
    .catch(() => ({}) as Times); // 第三方：攞唔到就用平均
  memo.set(key, { at: Date.now(), data });
  if (memo.size > 2000) for (const [k, v] of memo) if (Date.now() - v.at > TTL_MS) memo.delete(k);
  return data;
}

export async function segmentsNow(v: Variant, stops: VariantStop[], calendar: Calendar, now: Date): Promise<{ segSeconds: number[]; hourly: number }> {
  const avg = v.segSeconds ?? stops.slice(1).map(() => 60);
  const { weekday, hour } = hourlySlot(now, calendar);
  const prefixes = [...new Set(stops.map((s) => s.stopId.slice(0, 2)))];
  const times: Times = Object.assign({}, ...(await Promise.all(prefixes.map((p) => loadPrefix(weekday, hour, p)))));
  let hourly = 0;
  const segSeconds = avg.map((a, i) => {
    const t = times[stops[i]!.stopId]?.[stops[i + 1]!.stopId];
    if (t && t > 0 && t >= a * 0.4 && t <= a * 3) {
      hourly++;
      return Math.round(t);
    }
    return a;
  });
  return { segSeconds, hourly };
}
