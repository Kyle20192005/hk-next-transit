import 'server-only';
import { hourlySlot, type Calendar, type Variant, type VariantStop } from '@hknt/core';

/** hk-bus-time-between-stops：按「星期幾 + 鐘數」嘅站到站實測行車時間，每小時更新 */
const HOURLY_BASE = 'https://timeinterval.hkbuseta.com/times_hourly';

type Times = Record<string, Record<string, number>>;

async function loadPrefix(weekday: number, hour: string, prefix: string): Promise<Times> {
  try {
    const res = await fetch(`${HOURLY_BASE}/${weekday}/${hour}/${prefix}.json`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as Times) : {};
  } catch {
    return {}; // 第三方：攞唔到就用平均行車時間
  }
}

/**
 * 而家呢個時段嘅每段行車時間（秒）。有時段數據就用，冇就用走法嘅平均值（variant.segSeconds）。
 * 時段數據同平均值相差太遠（少過 0.4 倍或者多過 3 倍）當係異常，用平均值。
 */
export async function segmentsNow(
  v: Variant,
  stops: VariantStop[],
  calendar: Calendar,
  now: Date,
): Promise<{ segSeconds: number[]; hourly: number }> {
  const avg = v.segSeconds ?? stops.slice(1).map(() => 60);
  const { weekday, hour } = hourlySlot(now, calendar);
  const prefixes = [...new Set(stops.map((s) => s.stopId.slice(0, 2)))];
  const files = await Promise.all(prefixes.map((p) => loadPrefix(weekday, hour, p)));
  const times: Times = Object.assign({}, ...files);
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
