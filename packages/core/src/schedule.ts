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

/** 時間表一個時段：start–end 每 headway 分鐘一班；單一班次 headway = null */
export interface TimetablePeriod {
  start: number;
  end: number;
  headway: number | null;
}

/**
 * 將開車時間（由午夜起計分鐘）還原做時段：最少三班、相隔一樣嘅連續班次併做一段，
 * 例如 06:00、06:08、06:16 → 06:00–06:16 每 8 分鐘；段與段首尾相接（同 GTFS frequencies 一樣）。
 * 唔成段嘅零散班次逐班列出（headway = null）。
 */
export function timetablePeriods(departures: number[]): TimetablePeriod[] {
  const deps = [...new Set(departures)].sort((a, b) => a - b);
  const n = deps.length;
  const gap = (k: number) => deps[k + 1]! - deps[k]!;
  const out: TimetablePeriod[] = [];
  let shared = false; // deps[i] 係咪已經係上一段嘅尾班
  let i = 0;
  while (i < n) {
    if (i + 2 < n && gap(i) === gap(i + 1)) {
      let j = i + 2;
      while (j + 1 < n && gap(j) === gap(i)) j++;
      out.push({ start: deps[i]!, end: deps[j]!, headway: gap(i) });
      i = j;
      shared = true;
      if (i === n - 1) break;
      continue;
    }
    if (!shared) out.push({ start: deps[i]!, end: deps[i]!, headway: null });
    shared = false;
    i++;
  }
  return out;
}

/** 服務日子文字：例如「星期一至五」、「星期六」、「星期日及公眾假期」 */
export function serviceDaysLabel(days: boolean[]): string {
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  const on = days.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return '特別日子';
  if (on.length === 7) return '每日';
  if (on.length === 1 && on[0] === 6) return '星期日及公眾假期';
  // 連續日子用「至」
  const contiguous = on.every((d, k) => k === 0 || d === on[k - 1]! + 1);
  if (contiguous && on.length > 2) return `星期${names[on[0]!]}至${names[on[on.length - 1]!]}`;
  return `星期${on.map((i) => names[i]).join('、')}`;
}
