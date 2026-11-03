import type { Calendar, Variant } from './types';
import { addDays, hkParts } from './time';

/** 某一日（香港時間）有效嘅 serviceId */
export function activeServiceIds(calendar: Calendar, date: Date): Set<string> {
  const { ymd, weekday } = hkParts(date);
  const out = new Set<string>();
  for (const [id, c] of Object.entries(calendar)) {
    if (c.remove.includes(ymd)) continue;
    if (c.add.includes(ymd) || (c.days[weekday] && c.start <= ymd && ymd <= c.end)) out.add(id);
  }
  return out;
}

/**
 * 某個走法喺 `at` 前後嘅開車時間（以 `at` 當日午夜起計分鐘）。
 * 包埋前一日過咗午夜嘅班次（departures > 1440 嗰啲）。
 */
export function departuresAround(variant: Variant, calendar: Calendar, at: Date): number[] {
  const today = activeServiceIds(calendar, at);
  const yesterday = activeServiceIds(calendar, addDays(at, -1));
  const out: number[] = [];
  for (const s of variant.schedules) {
    if (today.has(s.serviceId)) out.push(...s.departures);
    if (yesterday.has(s.serviceId)) out.push(...s.departures.filter((m) => m >= 1440).map((m) => m - 1440));
  }
  return out.sort((a, b) => a - b);
}

/**
 * 走法今日（服務日）嘅頭尾班，例如 [360, 594] 代表 06:00–09:54；
 * 尾班過咗午夜會 >1440（例如 1475 = 翌日 00:35）。今日冇班次回傳 null。
 */
export function serviceWindow(variant: Variant, calendar: Calendar, at: Date): [number, number] | null {
  const today = activeServiceIds(calendar, at);
  const deps = variant.schedules.filter((s) => today.has(s.serviceId)).flatMap((s) => s.departures).sort((a, b) => a - b);
  const first = deps[0];
  const last = deps[deps.length - 1];
  return first === undefined || last === undefined ? null : [first, last];
}

export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

export interface ServiceSummary {
  /** 今日頭班、尾班（由午夜起計分鐘，可 >1440） */
  first: number;
  last: number;
  /** 而家附近（前 30 分鐘至後 60 分鐘）嘅班次相隔（分鐘，中位數）；呢段時間冇車就 null */
  headwayNow: number | null;
  /** 今日班次相隔範圍（分鐘） */
  headwayMin: number | null;
  headwayMax: number | null;
}

/** 走法今日嘅服務時間同班次（由總站開出計） */
export function serviceSummary(variant: Variant, calendar: Calendar, at: Date): ServiceSummary | null {
  const today = activeServiceIds(calendar, at);
  const deps = [...new Set(variant.schedules.filter((s) => today.has(s.serviceId)).flatMap((s) => s.departures))].sort((a, b) => a - b);
  if (!deps.length) return null;
  const gaps = deps.slice(1).map((d, i) => d - deps[i]!).filter((g) => g > 0);
  const nowMin = hkParts(at).minutes;
  const near = deps.map((d, i) => [d, i] as const).filter(([d, i]) => i > 0 && d >= nowMin - 30 && d <= nowMin + 60);
  const nearGaps = near.map(([d, i]) => d - deps[i - 1]!).sort((a, b) => a - b);
  return {
    first: deps[0]!,
    last: deps[deps.length - 1]!,
    headwayNow: nearGaps.length ? nearGaps[Math.floor(nearGaps.length / 2)]! : null,
    headwayMin: gaps.length ? Math.min(...gaps) : null,
    headwayMax: gaps.length ? Math.max(...gaps) : null,
  };
}
