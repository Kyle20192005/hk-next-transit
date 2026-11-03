import type { Calendar } from './types';
import { hkParts } from './time';

/**
 * 用成條線每個站嘅 ETA 追蹤巴士位置。
 *
 * 原理：一架喺 A、B 兩站之間嘅車，會出現喺 B 站嘅 ETA，但已經唔會出現喺 A 站
 * （A 站嘅下一班已經係後面嗰架）。所以由尾站開始，逐個站睇佢嘅每個 ETA：
 * 如果前一個站搵到「時間差 ≈ 呢段行車時間」嘅 ETA，即係同一架車仲喺上游；
 * 搵唔到，就即係佢已經過咗前一個站，喺兩站之間。
 * 位置只用嗰一段嘅行車時間計，唔會累積成條線嘅誤差。
 */
export interface TrackedBus {
  /** 喺第 from 個站同第 from+1 個站之間（index 對應 variantStops） */
  from: number;
  /** 預計幾時到第 from+1 個站（毫秒） */
  nextEta: number;
}

/** 一架車喺上游站嘅 ETA 同預期差幾多都當係同一架（毫秒）：最少 2 分鐘，或者呢段行車時間嘅一半 */
function tolerance(segMs: number): number {
  return Math.max(120_000, segMs * 0.5);
}

/**
 * 追蹤成條線嘅巴士。
 * @param stopEtas 每個站（按走法次序）屬於呢個走法嘅 ETA（毫秒）
 * @param segSeconds 每段行車時間（秒），長度 = 站數 - 1（時段實測或者平均）
 * @returns buses：每架車嘅位置；segSeconds：同 ETA 一致嘅每段行車時間——
 *   同一架車喺相鄰兩站都有 ETA 嘅話，用兩個 ETA 嘅時間差（中位數），
 *   令地圖位置同到站時間對得上；冇就用傳入嘅 segSeconds。
 */
export function trackLine(
  stopEtas: number[][],
  segSeconds: number[],
  now: number,
): { buses: TrackedBus[]; segSeconds: number[] } {
  const live = stopEtas.map((l) => [...l].filter((t) => t >= now - 60_000).sort((a, b) => a - b));
  const buses: TrackedBus[] = [];
  const observed: number[][] = segSeconds.map(() => []);
  for (let k = live.length - 1; k >= 1; k--) {
    const segMs = (segSeconds[k - 1] ?? 60) * 1000;
    const prev = live[k - 1]!;
    const used = new Set<number>();
    for (const e of live[k]!) {
      const expected = e - segMs;
      // 喺上一個站搵同一架車：時間要早過（或者等於）呢個站，而且接近預期
      let match = -1;
      let best = Infinity;
      prev.forEach((p, j) => {
        if (used.has(j) || p > e) return;
        const diff = Math.abs(p - expected);
        if (diff <= tolerance(segMs) && diff < best) {
          best = diff;
          match = j;
        }
      });
      if (match >= 0) {
        used.add(match);
        observed[k - 1]!.push((e - prev[match]!) / 1000);
        continue;
      }
      // 喺兩站之間 = 已經過咗上一個站，所以「到站時間 - 呢段行車時間」唔會遲過而家。
      // 遲過而家即係佢仲未去到上一個站，只係上一個站嘅 ETA 列表（最多 3 班）冇列到佢。
      if (expected <= now + tolerance(segMs)) buses.push({ from: k - 1, nextEta: e });
    }
  }
  const effective = segSeconds.map((s, i) => {
    const o = observed[i]!.filter((x) => x > 0).sort((a, b) => a - b);
    return o.length ? Math.round(o[Math.floor(o.length / 2)]!) : s;
  });
  return { buses: buses.sort((a, b) => b.from - a.from || a.nextEta - b.nextEta), segSeconds: effective };
}

/** 只要巴士位置 */
export function trackBuses(stopEtas: number[][], segSeconds: number[], now: number): TrackedBus[] {
  return trackLine(stopEtas, segSeconds, now).buses;
}

/** 架車喺兩站之間行咗幾多（0–1），用嗰一段嘅行車時間計 */
export function busFraction(bus: TrackedBus, segSeconds: number[], now: number): number {
  const segMs = (segSeconds[bus.from] ?? 60) * 1000;
  return Math.min(1, Math.max(0, 1 - (bus.nextEta - now) / segMs));
}

export type BusLabel = { kind: 'coming'; stopsAway: number; bus: TrackedBus } | { kind: 'arriving'; bus: TrackedBus } | { kind: 'notDeparted' };

/**
 * 將追蹤到嘅車對應返某個站嘅 ETA：上游嘅車由近到遠，順序對應 ETA（巴士通常唔會互相超越）；
 * 對應唔到嘅 ETA 即係仲未由總站開出。
 * @param etas 呢個站屬於呢個走法嘅 ETA（毫秒），按時間排
 */
export function labelEtas(buses: TrackedBus[], stopIndex: number, etas: number[]): BusLabel[] {
  const upstream = buses
    .filter((b) => b.from < stopIndex)
    .sort((a, b) => b.from - a.from || a.nextEta - b.nextEta);
  return etas.map((_, i): BusLabel => {
    const bus = upstream[i];
    if (!bus) return { kind: 'notDeparted' };
    if (bus.from === stopIndex - 1) return { kind: 'arriving', bus };
    return { kind: 'coming', stopsAway: stopIndex - bus.from, bus };
  });
}

/**
 * 按時段嘅行車時間檔案位置（hk-bus-time-between-stops）：
 * 星期用 0–6（0 = 星期日，公眾假期都當 0），鐘數兩位數。
 */
export function hourlySlot(now: Date, calendar: Calendar): { weekday: number; hour: string } {
  const { ymd, weekday, minutes } = hkParts(now);
  // 公眾假期：GTFS 會喺假期加開「只有星期日」嘅班次
  const holiday = Object.values(calendar).some(
    (c) => c.add.includes(ymd) && c.days[6] && c.days.slice(0, 6).every((d) => !d),
  );
  return { weekday: holiday ? 0 : (weekday + 1) % 7, hour: String(Math.floor(minutes / 60)).padStart(2, '0') };
}

/** 架車沿路線去第 stopIndex 個站仲有幾遠（米）；cumMetres = 每個站嘅累計距離 */
export function busDistanceTo(bus: TrackedBus, fraction: number, stopIndex: number, cumMetres: number[]): number | null {
  const a = cumMetres[bus.from];
  const b = cumMetres[bus.from + 1];
  const target = cumMetres[stopIndex];
  if (a === undefined || b === undefined || target === undefined) return null;
  return Math.max(0, target - (a + (b - a) * fraction));
}
