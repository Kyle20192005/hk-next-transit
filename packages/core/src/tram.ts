import type { DepartureRow } from './departures';
import { metresBetween } from './geo';
import { activeServiceIds } from './schedule';
import { addDays, hkParts } from './time';
import { TRAM_ROUTES, TRAM_STATIONS, type TramStation } from './tram-data';
import type { Calendar } from './types';

/**
 * 香港電車：站（tram-data.ts，data.gov.hk 開放數據 + GTFS）、時間表（pipeline 每日生成 out/tram.json），
 * 同電車公司網站「下一班電車」（hktramways.com/nextTram/geteat.php，唔係開放數據，可能隨時停用；冇就用時間表推算）。
 */

/** 電車色（自己揀嘅綠色，路綫圖、標籤、卡色條用） */
export const TRAM_BRAND = { zh: '電車', color: '#007a4d', ink: '#fff' } as const;
/** 成人車費冇資料時嘅預設（GTFS 2026：$3.3，全程同價） */
export const TRAM_JOYYOU_NOTE = '樂悠咭（60–64 歲）$2';

const BY_ID = new Map(TRAM_STATIONS.map((s) => [s.id, s]));
const BY_CODE = new Map(TRAM_STATIONS.flatMap((s) => s.codes.map((c) => [c, s] as const)));

export const tramStation = (id: string): TramStation | undefined => BY_ID.get(id);
export const isTramStation = (id: string): boolean => BY_ID.has(id);
export const tramStationName = (id: string): string => BY_ID.get(id)?.zh ?? id;
/** 電車公司到站代號 → 站（例如 HVT_K → 跑馬地） */
export const tramStationByCode = (code: string): TramStation | undefined => BY_CODE.get(code);

/** 方向字（站面板、搜尋結果） */
export const TRAM_DIR_ZH: Record<TramStation['dir'], string> = { W: '西行', E: '東行', S: '往跑馬地', N: '跑馬地開出', T: '總站' };

/** 搜尋：中文、英文（唔理大細楷同空格）、站代號；同名嘅東西行站都出（按方向排） */
export function searchTramStations(query: string, limit = 10): string[] {
  const q = query.trim().replace(/站$/, '');
  if (!q) return [];
  const ql = q.toLowerCase().replace(/\s+/g, '');
  const hits: { id: string; rank: number }[] = [];
  for (const s of TRAM_STATIONS) {
    const zh = s.zh.replace(/[（）()]/g, '');
    const en = s.en.toLowerCase().replace(/\s+/g, '');
    let rank = -1;
    if (s.zh === q || zh === q || s.id.toLowerCase() === ql) rank = 0;
    else if (zh.startsWith(q) || en.startsWith(ql)) rank = 1;
    else if (zh.includes(q) || en.includes(ql)) rank = 2;
    if (rank >= 0) hits.push({ id: s.id, rank });
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map((h) => h.id);
}

/** 附近電車站（直線距離），近到遠 */
export function nearestTramStations(lat: number, lng: number, maxM = 600, limit = 4): { sta: string; distance: number }[] {
  return TRAM_STATIONS.filter((s) => !s.alightOnly)
    .map((s) => ({ sta: s.id, distance: Math.round(metresBetween([lat, lng], [s.lat, s.lng])) }))
    .filter((x) => x.distance <= maxM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** 對面方向最近嘅站（東行站 → 西行站），站面板「對面」用 */
export function oppositeTramStation(id: string): string | null {
  const s = BY_ID.get(id);
  if (!s || (s.dir !== 'E' && s.dir !== 'W')) return null;
  const want = s.dir === 'E' ? 'W' : 'E';
  let best: { id: string; d: number } | null = null;
  for (const o of TRAM_STATIONS) {
    if (o.dir !== want) continue;
    const d = metresBetween([s.lat, s.lng], [o.lat, o.lng]);
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best && best.d <= 400 ? best.id : null;
}

// ---------------------------------------------------------------------------
// 實時（電車公司網站）

export interface TramEta {
  /** 目的地站 ID（對唔到就係電車公司代號） */
  dest: string;
  destZh: string;
  /** 到站時間（毫秒） */
  at: number;
  /** 已經到站 */
  arrived: boolean;
}

/** 解析 geteat.php 嘅 XML（<metadata arrive_in_second="" tram_dest_tc="" dest_stop_code="" is_arrived=""/>）；唔識讀回傳 null */
export function parseTramEta(xml: string, now = Date.now()): TramEta[] | null {
  if (typeof xml !== 'string' || !xml.includes('<root')) return null;
  const out: TramEta[] = [];
  for (const m of xml.matchAll(/<metadata\b([^>]*)\/?>/g)) {
    const a: Record<string, string> = {};
    for (const [, k, v] of (m[1] ?? '').matchAll(/(\w+)="([^"]*)"/g)) a[k!] = v!;
    const secs = Number(a.arrive_in_second ?? NaN);
    const mins = Number(a.arrive_in_minute ?? NaN);
    const s = Number.isFinite(secs) ? secs : Number.isFinite(mins) ? mins * 60 : NaN;
    if (!Number.isFinite(s)) continue;
    const st = a.dest_stop_code ? tramStationByCode(a.dest_stop_code) : undefined;
    out.push({
      dest: st?.id ?? a.dest_stop_code ?? '',
      destZh: st?.zh ?? (a.tram_dest_tc ?? '').replace(/總站$/, ''),
      at: now + s * 1000,
      arrived: a.is_arrived === '1',
    });
  }
  return out.sort((x, y) => x.at - y.at);
}

// ---------------------------------------------------------------------------
// 時間表（out/tram.json）

export interface TramTimetable {
  routes: {
    id: string;
    zh: string;
    dirs: Record<string, { stops: string[]; offsets: number[]; minutes: number | null; schedules: { serviceId: string; departures: number[] }[] }>;
  }[];
  /** 成人車費（GTFS），冇就 null */
  fare: number | null;
}

export interface TramStopDest {
  /** 目的地站 ID */
  dest: string;
  /** 行經嘅路線（GTFS route_id） */
  routes: string[];
  /** 之後幾班（毫秒，按時間表推算） */
  next: number[];
  /** 而家大約幾多分鐘一班（前後一個鐘內嘅中位數）；而家冇車就 null */
  headway: number | null;
  /** 今日（服務日）呢個站頭班、尾班（毫秒） */
  first: number | null;
  last: number | null;
}

/** 香港時間某日午夜（毫秒） */
function hkMidnight(at: Date): number {
  const { minutes } = hkParts(at);
  return Math.floor(at.getTime() / 60000) * 60000 - minutes * 60000;
}

/**
 * 某個站按時間表嘅下幾班車：每個目的地一組（同一個目的地幾條路線併埋）。
 * 時間 = 總站開車時間 + 估計去到呢個站嘅時間（按距離比例，pipeline/tram.py）。電車班次密，所以重點係「幾多分鐘一班」。
 */
export function tramStopSchedule(tt: TramTimetable, calendar: Calendar, sta: string, at: Date, n = 3): TramStopDest[] {
  const today = activeServiceIds(calendar, at);
  const yesterday = activeServiceIds(calendar, addDays(at, -1));
  const base = hkMidnight(at);
  const nowMin = (at.getTime() - base) / 60000;
  const groups = new Map<string, { routes: Set<string>; times: number[]; todayTimes: number[] }>();
  for (const r of tt.routes) {
    for (const d of Object.values(r.dirs)) {
      const i = d.stops.indexOf(sta);
      if (i < 0 || i === d.stops.length - 1) continue;
      const off = (d.offsets[i] ?? 0) / 60;
      const dest = d.stops[d.stops.length - 1]!;
      const g = groups.get(dest) ?? { routes: new Set<string>(), times: [], todayTimes: [] };
      g.routes.add(r.id);
      for (const s of d.schedules) {
        if (today.has(s.serviceId)) for (const dep of s.departures) {
          g.times.push(dep + off);
          g.todayTimes.push(dep + off);
        }
        if (yesterday.has(s.serviceId)) for (const dep of s.departures) if (dep >= 1440) g.times.push(dep - 1440 + off);
      }
      groups.set(dest, g);
    }
  }
  const out: TramStopDest[] = [];
  for (const [dest, g] of groups) {
    const times = [...new Set(g.times.map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
    const next = times.filter((t) => t >= nowMin - 0.5).slice(0, n);
    const win = times.filter((t) => t >= nowMin - 60 && t <= nowMin + 60);
    const gaps = win.slice(1).map((t, k) => t - win[k]!).filter((x) => x > 0).sort((a, b) => a - b);
    const headway = gaps.length && next.length ? Math.round(gaps[Math.floor(gaps.length / 2)]!) : null;
    const tdy = g.todayTimes.sort((a, b) => a - b);
    out.push({
      dest,
      routes: [...g.routes].sort(),
      next: next.map((t) => base + t * 60000),
      headway,
      first: tdy.length ? base + tdy[0]! * 60000 : null,
      last: tdy.length ? base + tdy[tdy.length - 1]! * 60000 : null,
    });
  }
  // 有車嘅排先，再按下一班
  return out.sort((a, b) => (a.next[0] ?? Infinity) - (b.next[0] ?? Infinity) || tramStationName(a.dest).localeCompare(tramStationName(b.dest)));
}

/** 首頁「最近睇過」：打開電車站記低（co = 'tram'，route = 站 ID，dest = 站名；撳返開電車圖嗰個站） */
export const tramRecent = (sta: string) => ({ co: 'tram' as const, route: sta, dir: 'O' as const, dest: tramStationName(sta), companies: [] });

/** 卡／列表用嘅站名：東西行同名嘅站加方向，例如「銀行街（西行）」；總站、跑馬地環綫唔加 */
export function tramStationLabel(id: string): string {
  const s = BY_ID.get(id);
  if (!s) return id;
  return s.dir === 'W' || s.dir === 'E' ? `${s.zh}（${TRAM_DIR_ZH[s.dir]}）` : s.zh;
}

/**
 * 電車站標題（首頁「最近睇過」、附近車站頁）：「站」字擺喺方向前面，例如「銀行街站（西行）」；
 * 本身已經叫「…站」（金鐘港鐵站）唔再加；總站、跑馬地環綫冇方向（「筲箕灣站」）。
 */
export function tramStopTitle(sta: string): string {
  const name = tramStationName(sta);
  const label = tramStationLabel(sta);
  const dir = label.startsWith(name) ? label.slice(name.length) : '';
  return `${name}${name.endsWith('站') ? '' : '站'}${dir}`;
}

/** 路線名（例如「筲箕灣 ↔ 上環（西港城）」） */
export const tramRouteName = (id: string): string => TRAM_ROUTES.find((r) => r.id === id)?.zh ?? id;

/** 附近車站頁：每個目的地下一班（實時有就用實時，冇就時間表，scheduled = 推算，介面標「約」）；電車冇首頁大卡同收藏（用戶決定） */
export function tramDepartureRows(sta: string, live: readonly TramEta[] | null, sched: readonly TramStopDest[], limit = 4): DepartureRow[] {
  const badge = { text: TRAM_BRAND.zh, bg: TRAM_BRAND.color, ink: TRAM_BRAND.ink };
  const link = { co: 'tram', route: '', dir: 'O' as const, stop: sta };
  if (live && live.length) {
    const seen = new Set<string>();
    const rows: DepartureRow[] = [];
    for (const e of live) {
      if (seen.has(e.dest)) continue;
      seen.add(e.dest);
      rows.push({ key: `tram:${sta}:${e.dest}:${e.at}`, badge, dest: e.destZh, at: e.at, link, ...(e.arrived ? { nowText: '已到站' } : {}) });
    }
    return rows.slice(0, limit);
  }
  return sched
    .filter((d) => d.next.length)
    .slice(0, limit)
    .map((d) => ({ key: `tram:${sta}:${d.dest}`, badge, dest: tramStationName(d.dest), at: d.next[0]!, scheduled: true, link }));
}
