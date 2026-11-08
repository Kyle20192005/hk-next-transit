import 'server-only';
import { hourlyPrefixes, hourlySlot, type Calendar, type HourlyTimes, type VariantStop } from '@hknt/core';

/** hk-bus-time-between-stops：按「星期幾 + 鐘數」嘅站到站實測行車時間，每小時更新 */
const HOURLY_BASE = 'https://timeinterval.hkbuseta.com/times_hourly';

async function loadPrefix(weekday: number, hour: string, prefix: string): Promise<HourlyTimes> {
  try {
    const res = await fetch(`${HOURLY_BASE}/${weekday}/${hour}/${prefix}.json`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as HourlyTimes) : {};
  } catch {
    return {}; // 第三方：攞唔到就用平均行車時間
  }
}

/** 而家時段嘅實測行車時間（成條線要用嗰幾個檔合埋）；點用由 core `segmentsFromHourly` / `computeBuses` 決定 */
export async function hourlyTimesFor(stops: VariantStop[], calendar: Calendar, now: Date): Promise<HourlyTimes> {
  const { weekday, hour } = hourlySlot(now, calendar);
  const files = await Promise.all(hourlyPrefixes(stops).map((p) => loadPrefix(weekday, hour, p)));
  return Object.assign({}, ...files);
}
