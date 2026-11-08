import { hourlyPrefixes, hourlySlot, type Calendar, type HourlyTimes, type VariantStop } from '@hknt/core';

/**
 * 而家時段嘅實測行車時間（同網頁 apps/web/lib/journey.ts 一樣）：hk-bus-time-between-stops 按「星期 + 鐘數」，
 * 檔案每小時更新，記憶體 cache 1 個鐘。點用由 core `computeBuses` 決定。
 */
const HOURLY_BASE = 'https://timeinterval.hkbuseta.com/times_hourly';
const TTL_MS = 3600_000;
const memo = new Map<string, { at: number; data: Promise<HourlyTimes> }>();

function loadPrefix(weekday: number, hour: string, prefix: string): Promise<HourlyTimes> {
  const key = `${weekday}/${hour}/${prefix}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = fetch(`${HOURLY_BASE}/${key}.json`, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? (r.json() as Promise<HourlyTimes>) : {}))
    .catch(() => ({}) as HourlyTimes); // 第三方：攞唔到就用平均
  memo.set(key, { at: Date.now(), data });
  if (memo.size > 2000) for (const [k, v] of memo) if (Date.now() - v.at > TTL_MS) memo.delete(k);
  return data;
}

export async function hourlyTimesFor(stops: VariantStop[], calendar: Calendar, now: Date): Promise<HourlyTimes> {
  const { weekday, hour } = hourlySlot(now, calendar);
  return Object.assign({}, ...(await Promise.all(hourlyPrefixes(stops).map((p) => loadPrefix(weekday, hour, p)))));
}
