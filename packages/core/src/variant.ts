import type { Calendar, Dir, RouteData, Variant } from './types';
import { departuresAround } from './schedule';
import { hkParts } from './time';

/** 走法簡稱：「置富花園 - 北角碼頭(不經華富)」→「不經華富」；冇括號就用全名 */
export function shortName(v: Pick<Variant, 'name'>): string {
  const m = v.name.match(/[（(]([^）)]+)[）)]\s*$/);
  return m?.[1] ?? v.name;
}

/**
 * 走法顯示名稱：正常走法叫「正常路線」；括號入面係走法描述（例如「經華富」）先加埋，
 * 目的地（例如 70 號嘅「交易廣場」）唔加。特別班用簡稱。
 */
export function variantLabel(v: Pick<Variant, 'name' | 'special'>): string {
  const short = shortName(v);
  if (v.special) return short;
  return short !== v.name && /經|繞|不/.test(short) ? `正常路線（${short}）` : '正常路線';
}

/** 呢個方向有邊幾個走法（循環線嘅走法兩個方向都會出現） */
export function variantsForDir(route: RouteData, dir: Dir): Variant[] {
  return route.variants.filter((v) => v.stopDirs.includes(dir));
}

export interface VariantStop {
  dir: Dir;
  stopId: string;
  /** 城巴 ETA 會出嘅 seq，亦即係呢個走法入面嘅站序 */
  seq: number;
}

/**
 * 走法實際停嘅城巴站，按次序排列。
 * 包埋走法範圍內嘅城巴獨有站（例如 38 號嘅黃竹坑醫院），同城巴 App 一致。
 */
export function variantStops(v: Variant): VariantStop[] {
  const dirOrder: Dir[] = [];
  for (const d of v.stopDirs) if (d && !dirOrder.includes(d)) dirOrder.push(d);
  const out: VariantStop[] = [];
  for (const dir of dirOrder) {
    const items = Object.entries(v.expSeq)
      .filter(([k]) => k.startsWith(`${dir}:`))
      .map(([k, seq]) => ({ dir, stopId: k.slice(2), seq }))
      .sort((a, b) => a.seq - b.seq);
    out.push(...items);
  }
  return out;
}

/** 走法喺城巴列表入面嘅範圍包唔包第 i 個站（即係行經呢段路） */
export function passesThrough(v: Variant, dir: Dir, list: string[], i: number): boolean {
  const idx = v.stops
    .map((s, k) => (s && v.stopDirs[k] === dir ? list.indexOf(s) : -1))
    .filter((x) => x >= 0);
  return idx.length > 0 && Math.min(...idx) < i && i < Math.max(...idx);
}

/** 「現正服務」嘅判斷：未來 60 分鐘有班次由總站開出，或者有車行緊 */
export const LOOKAHEAD_MIN = 60;

export type VariantStatus =
  | { state: 'running'; /** 最接近而家嘅開車時間同而家差幾多分鐘，用嚟排序 */ distance: number }
  | { state: 'later'; nextDeparture: number }
  | { state: 'ended' }
  | { state: 'none' };

export function variantStatus(v: Variant, calendar: Calendar, now: Date): VariantStatus {
  const deps = departuresAround(v, calendar, now);
  if (deps.length === 0) return { state: 'none' };
  const nowMin = hkParts(now).minutes;
  const runMin = (v.offsets[v.offsets.length - 1] ?? 0) / 60;
  // 已經開出但未到終點嘅車，或者未來 60 分鐘會開出嘅車
  const active = deps.filter((d) => d >= nowMin - runMin && d <= nowMin + LOOKAHEAD_MIN);
  if (active.length) return { state: 'running', distance: Math.min(...active.map((d) => Math.abs(d - nowMin))) };
  const next = deps.find((d) => d > nowMin);
  return next === undefined ? { state: 'ended' } : { state: 'later', nextDeparture: next };
}

/** 走法狀態文字；short = 收埋時用嘅簡短版 */
export function statusText(s: VariantStatus, short = false): string {
  switch (s.state) {
    case 'running':
      return '現正服務';
    case 'later':
      return short ? `${LOOKAHEAD_MIN}分鐘內冇班次` : `未來${LOOKAHEAD_MIN}分鐘沒有班次由總站開出`;
    case 'ended':
      return short ? '今日已結束' : '今日服務已結束';
    case 'none':
      return short ? '今日冇班次' : '今日沒有班次';
  }
}

/**
 * 按城巴 App 嘅方式排序：現正服務嘅排先，當中最接近而家開出嘅排最前；
 * 其餘按正常走法先、特別班後。
 */
export function sortVariants(variants: Variant[], calendar: Calendar, now: Date): { variant: Variant; status: VariantStatus }[] {
  const rank = (s: VariantStatus) => (s.state === 'running' ? 0 : s.state === 'later' ? 1 : s.state === 'ended' ? 2 : 3);
  return variants
    .map((variant) => ({ variant, status: variantStatus(variant, calendar, now) }))
    .sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r) return r;
      if (a.status.state === 'running' && b.status.state === 'running') {
        const d = a.status.distance - b.status.distance;
        if (d) return d;
      }
      if (a.status.state === 'later' && b.status.state === 'later') {
        return a.status.nextDeparture - b.status.nextDeparture;
      }
      return Number(a.variant.special) - Number(b.variant.special);
    });
}
