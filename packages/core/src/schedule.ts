import type { Calendar, Eta, Variant } from './types';
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

const DAY_MS = 86_400_000;
const HK_OFFSET_MS = 8 * 3600_000;
/** 包含 `t` 嗰日嘅香港午夜（毫秒） */
const hkMidnight = (t: number) => Math.floor((t + HK_OFFSET_MS) / DAY_MS) * DAY_MS - HK_OFFSET_MS;

/** 由總站開出到呢個站要幾多分鐘（時間表估算）；呢個走法唔經呢個站 → null */
export function minutesToStop(v: Variant, stopId: string, dir: string): number | null {
  const idx = v.stops.findIndex((s, i) => s === stopId && v.stopDirs[i] === dir);
  if (idx >= 0) return (v.offsets[idx] ?? 0) / 60;
  return null;
}

export interface LastBus {
  /** 呢個服務日喺呢個站嘅尾班（毫秒）；今日冇班次就 null */
  last: number | null;
  /** 尾班過咗之後，下一班（頭班）幾時到（毫秒）；未過尾班就 null */
  nextFirst: number | null;
  /** 尾班前一班（同一服務日，毫秒）：用嚟分實時班次邊班先係尾班（`lastBusEtaIndex`） */
  prev?: number | null;
}

/**
 * 呢個站嘅尾班車（所有經過呢個站、同方向嘅走法一齊計；用政府時間表 + 由總站開出嘅估計時間）。
 * 服務日：琴日嘅班次過咗午夜仲未完（例如 01:00 仲有 00:45 開出嗰班）就當仲係琴日嘅服務日。
 * 冇任何走法有時間表 → null（唔好亂講）。
 */
export function lastBusAt(variants: Variant[], stopId: string, dir: string, calendar: Calendar, now: number): LastBus | null {
  const today = hkMidnight(now);
  const days = [-1, 0, 1].map((d) => today + d * DAY_MS);
  const perDay: number[][] = [[], [], []];
  let any = false;
  for (const v of variants) {
    const off = minutesToStop(v, stopId, dir);
    if (off === null || !v.schedules.some((s) => s.departures.length)) continue;
    any = true;
    days.forEach((dayStart, k) => {
      const active = activeServiceIds(calendar, new Date(dayStart + 12 * 3600_000));
      for (const s of v.schedules) {
        if (!active.has(s.serviceId)) continue;
        for (const m of s.departures) perDay[k]!.push(dayStart + (m + off) * 60_000);
      }
    });
  }
  if (!any) return null;
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const lastYesterday = max(perDay[0]!);
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
  const firstToday = min(perDay[1]!);
  // 服務日：琴日嘅班次未行完、或者今日頭班都未開（例如凌晨 00:03，琴晚 23:45 尾班已過）→ 仲係琴日
  const yesterday = lastYesterday !== null && (lastYesterday > now || firstToday === null || now < firstToday);
  const day = yesterday ? perDay[0]! : perDay[1]!;
  const last = max(day);
  // 前一班：早過尾班 1 分鐘以上（唔同走法同一時間開出當同一班）
  const prev = last === null ? null : max(day.filter((t) => t < last - 60_000));
  if (last !== null && last > now) return { last, nextFirst: null, prev };
  const upcoming = perDay.flat().filter((t) => t > now);
  return { last, nextFirst: upcoming.length ? Math.min(...upcoming) : null, prev };
}

/** 香港時間 HH:MM */
const clock = (t: number) => {
  const d = new Date(t + HK_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/** 實時班次同時間表尾班最多相差幾耐都當係同一班（時間表到中途站係估算，夜晚塞車少，15 分鐘夠） */
const LAST_BUS_TOLERANCE_MS = 15 * 60_000;

/**
 * 實時班次入面邊一班係尾班車（index；認唔到 -1）。
 * 用最遲嗰班實時班次：同時間表尾班相差 15 分鐘內，而且近尾班多過近前一班（`prev`）先算。
 * 營辦商每間公司最多俾 3 班：嗰間已經 3 班，後面可能仲有車未列出，所以要差唔多到估計嘅尾班（2 分鐘內或者更遲）先算。
 * 尾班過咗估計時間但仲有實時班次（例如遲咗）都認得。
 */
export function lastBusEtaIndex(etas: readonly Pick<Eta, 'eta' | 'company'>[], info: LastBus | null): number {
  if (!info || info.last === null) return -1;
  let idx = -1;
  let latest = -Infinity;
  etas.forEach((e, i) => {
    const t = e.eta ? Date.parse(e.eta) : NaN;
    if (t > latest) {
      latest = t;
      idx = i;
    }
  });
  if (idx < 0) return -1;
  const diff = latest - info.last;
  if (Math.abs(diff) > LAST_BUS_TOLERANCE_MS) return -1;
  if (info.prev != null && Math.abs(latest - info.prev) <= Math.abs(diff)) return -1;
  const co = etas[idx]!.company;
  if (etas.filter((e) => e.eta && e.company === co).length >= 3 && diff < -2 * 60_000) return -1;
  return idx;
}

/**
 * 尾班車提示文字：
 * - 尾班未到：「尾班約 23:45」；30 分鐘內「尾班約 23:45 · 仲有 12 分鐘」（urgent）
 * - 過咗：「尾班車已經開走 · 下次頭班約 06:10」（聽日嘅加「聽日」）
 * 時間係時間表估算，所以寫「約」；有 `actual`（`lastBusEtaIndex` 認到嗰班嘅實時時間）就用實時：「尾班車 00:00 · 仲有 27 分鐘」（嗰班同時標「尾班」）。
 */
export function lastBusText(info: LastBus | null, now: number, actual?: number | null): { text: string; urgent: boolean; gone: boolean } | null {
  if (!info) return null;
  // 認到邊班實時班次係尾班：用實時時間（唔再寫「約」）
  // ETA 啱啱過咗幾秒（車喺站／即將到）都仲算
  if (actual != null && actual > now - 60_000) {
    const mins = Math.max(0, Math.round((actual - now) / 60_000));
    return { text: `尾班車 ${clock(actual)}${mins <= 0 ? ' · 即將到站' : mins <= 30 ? ` · 仲有 ${mins} 分鐘` : ''}`, urgent: mins <= 30, gone: false };
  }
  if (info.last !== null && info.last > now) {
    const mins = Math.round((info.last - now) / 60_000);
    return mins <= 30
      ? { text: `尾班約 ${clock(info.last)} · 仲有 ${mins} 分鐘`, urgent: true, gone: false }
      : { text: `尾班約 ${clock(info.last)}`, urgent: false, gone: false };
  }
  // 過咗午夜講「今日」會混淆（凌晨 00:03 嘅「今日」其實係琴晚），所以講「尾班車已經開走」
  if (info.nextFirst === null) return { text: '尾班車已經開走', urgent: false, gone: true };
  const tomorrow = hkMidnight(info.nextFirst) > hkMidnight(now);
  return { text: `尾班車已經開走 · 下次頭班約 ${tomorrow ? '聽日 ' : ''}${clock(info.nextFirst)}`, urgent: false, gone: true };
}
