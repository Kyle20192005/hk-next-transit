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

/**
 * 詳細班次用邊個服務日：琴晚過咗午夜嘅班次（開車時間 ≥ 1440）未行完，就仲係琴日，
 * 時間以琴日午夜計（例如 00:31 → 1471），咁「翌日 00:20」嗰行先標到「尾班已開出」，唔會跳咗去今日嘅 06:50。
 */
export function timetableDay(variant: { schedules: Variant['schedules']; runMin: number }, calendar: Calendar, now: Date): { serviceIds: Set<string>; minutes: number } {
  const nowMin = hkParts(now).minutes;
  const runMin = variant.runMin;
  const yesterday = activeServiceIds(calendar, addDays(now, -1));
  const lastYesterday = Math.max(-1, ...variant.schedules.filter((s) => yesterday.has(s.serviceId)).flatMap((s) => s.departures));
  if (lastYesterday >= 1440 && nowMin + 1440 <= lastYesterday + runMin) return { serviceIds: yesterday, minutes: nowMin + 1440 };
  return { serviceIds: activeServiceIds(calendar, now), minutes: nowMin };
}

/** 走法由總站行到尾站要幾多分鐘（時間表估算；詳細班次判斷尾班仲喺唔喺路上） */
export const runMinutes = (v: Pick<Variant, 'offsets'>) => (v.offsets[v.offsets.length - 1] ?? 0) / 60;

/**
 * 詳細班次邊行要標：而家嘅時段（now）、下一班（next），或者尾班已開出仲行緊（lastRunning）。
 * runMin = 由總站行到尾站要幾多分鐘。
 */
export function timetableMarker(periods: TimetablePeriod[], minutes: number, runMin: number): { index: number; kind: 'now' | 'next' | 'lastRunning' } | null {
  const lastI = periods.length - 1;
  const last = periods[lastI];
  if (!last) return null;
  // 尾班之後：尾班仲喺路上就標佢，否則冇嘢標
  if (minutes > last.end) return minutes <= last.end + runMin ? { index: lastI, kind: 'lastRunning' } : null;
  const now = periods.findIndex((p, i) => {
    const next = periods[i + 1];
    return minutes >= p.start && (p.headway ? minutes <= p.end : !next || minutes < next.start);
  });
  if (now >= 0) return { index: now, kind: 'now' };
  const next = periods.findIndex((p) => p.start > minutes);
  return next >= 0 ? { index: next, kind: 'next' } : null;
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

/**
 * 由總站開出到呢個站要幾多分鐘（時間表估算）；呢個走法唔經呢個站 → null。
 * 城巴獨有站（政府冇，例如 101 嘅九龍城–宋皇臺遊樂場）冇自己嘅 offset：用城巴站序（`expSeq`）前後兩個政府站按站數插值。
 */
export function minutesToStop(v: Variant, stopId: string, dir: string): number | null {
  const own = (id: string, d: string) => {
    const i = v.stops.findIndex((s, k) => s === id && v.stopDirs[k] === d);
    return i >= 0 ? (v.offsets[i] ?? 0) : undefined;
  };
  const direct = own(stopId, dir);
  if (direct !== undefined) return direct / 60;
  if (v.expSeq?.[`${dir}:${stopId}`] === undefined) return null;
  // 同 variant.ts 嘅 variantStops 一樣次序（唔 import，避免循環引用）
  const dirOrder: string[] = [];
  for (const d of v.stopDirs) if (d && !dirOrder.includes(d)) dirOrder.push(d);
  const list = dirOrder.flatMap((d) =>
    Object.entries(v.expSeq)
      .filter(([key]) => key.startsWith(`${d}:`))
      .map(([key, seq]) => ({ dir: d, stopId: key.slice(2), seq }))
      .sort((x, y) => x.seq - y.seq),
  );
  const k = list.findIndex((x) => x.dir === dir && x.stopId === stopId);
  if (k < 0) return null;
  let a = k - 1;
  while (a >= 0 && own(list[a]!.stopId, list[a]!.dir) === undefined) a--;
  let b = k + 1;
  while (b < list.length && own(list[b]!.stopId, list[b]!.dir) === undefined) b++;
  const oa = a >= 0 ? own(list[a]!.stopId, list[a]!.dir)! : undefined;
  const ob = b < list.length ? own(list[b]!.stopId, list[b]!.dir)! : undefined;
  if (oa !== undefined && ob !== undefined) return (oa + ((ob - oa) * (k - a)) / (b - a)) / 60;
  const one = oa ?? ob;
  return one === undefined ? null : one / 60;
}

export interface LastBus {
  /** 尾班（收車前最後一班）到呢個站嘅時間（毫秒）；冇就 null */
  last: number | null;
  /** 尾班過咗之後，下一班幾時到（毫秒）；未過尾班就 null */
  nextFirst: number | null;
  /** 尾班前一班（毫秒）：用嚟分實時班次邊班先係尾班（`lastBusEtaIndex`） */
  prev?: number | null;
  /** 時間表估計由總站去到呢個站要幾多分鐘（尾班嗰個走法）：`adjustLastBus` 用實測行車時間校正 */
  offsetMin?: number;
}

/** 兩班車相隔幾耐以上當係「收咗車」（尾班同下一班之間）。970X 通宵 01:30 尾班、05:30 頭班相隔 4 個鐘；日間最疏都唔夠 3 個鐘 */
export const LAST_BUS_GAP_MS = 3 * 3600_000;

/**
 * 呢個站嘅尾班車（所有經過呢個站、同方向嘅走法一齊計，包埋特別班；用政府時間表 + 由總站開出嘅估計時間）。
 * 唔按日曆日切：將琴日、今日、聽日嘅到站時間排成一行，**收車 = 兩班之間相隔 3 個鐘以上**，尾班 = 收車前最後一班。
 * 所以通宵線（例如 970X 00:40–01:30 每 25 分鐘）00:25 嘅尾班係 01:30 嗰班，唔係琴日最後嗰班。
 * 全日有車（搵唔到收車）或者冇時間表 → null（唔好亂講）。
 */
export function lastBusAt(variants: Variant[], stopId: string, dir: string, calendar: Calendar, now: number): LastBus | null {
  const today = hkMidnight(now);
  const offOf = new Map<number, number>(); // 到站時間 → 嗰班嘅「總站去呢個站」分鐘
  for (const v of variants) {
    const off = minutesToStop(v, stopId, dir);
    if (off === null || !v.schedules.some((s) => s.departures.length)) continue;
    for (const d of [-1, 0, 1, 2]) {
      const dayStart = today + d * DAY_MS;
      const active = activeServiceIds(calendar, new Date(dayStart + 12 * 3600_000));
      for (const s of v.schedules) {
        if (!active.has(s.serviceId)) continue;
        for (const m of s.departures) offOf.set(dayStart + (m + off) * 60_000, off);
      }
    }
  }
  if (!offOf.size) return null;
  const times = [...offOf.keys()].sort((a, b) => a - b);
  const result = (k: number, nextFirst: number | null): LastBus => ({ last: times[k]!, nextFirst, prev: k > 0 ? times[k - 1]! : null, offsetMin: offOf.get(times[k]!) });
  const u = times.findIndex((t) => t > now);
  if (u < 0) return result(times.length - 1, null);
  // 而家喺收車時段入面（上一班同下一班相隔 3 個鐘以上）：尾班已過
  if (u > 0 && times[u]! - times[u - 1]! >= LAST_BUS_GAP_MS) return result(u - 1, times[u]!);
  if (u === 0 && times[0]! - now >= LAST_BUS_GAP_MS) return { last: null, nextFirst: times[0]!, prev: null };
  // 仲有車：向後搵第一個收車位
  for (let j = u; j < times.length - 1; j++) if (times[j + 1]! - times[j]! >= LAST_BUS_GAP_MS) return result(j, null);
  return null;
}

/**
 * 用實測行車時間校正尾班到站時間：時間表只有總站開車時間，中途站按走線長度估，夜晚車少快好多
 * （例如 107 去到香港仔隧道巴士轉乘站，估 00:45、實際 00:28）。
 * liveMin = 而家實測由總站去到呢個站要幾多分鐘（追蹤巴士用嘅每段行車時間加埋）。
 * 按比例縮放（最多 0.4–1.5 倍），尾班同前一班一齊移；頭班係朝早，唔郁。
 */
export function adjustLastBus(info: LastBus | null, liveMin: number | null | undefined): LastBus | null {
  if (!info || info.last === null || !info.offsetMin || info.offsetMin < 5 || !liveMin || !(liveMin > 0)) return info;
  const scale = Math.min(1.5, Math.max(0.4, liveMin / info.offsetMin));
  const delta = Math.round(info.offsetMin * (scale - 1) * 60_000);
  return { ...info, last: info.last + delta, prev: info.prev != null ? info.prev + delta : info.prev };
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
 * - 過咗：「尾班車已經開走 · 下一班約 06:10」（聽日嘅加「聽日」）
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
  return { text: `尾班車已經開走 · 下一班約 ${tomorrow ? '聽日 ' : ''}${clock(info.nextFirst)}`, urgent: false, gone: true };
}
