import type { DepartureRow } from './departures';
import { metresBetween } from './geo';
import { MTR_LINE_STATIONS, MTR_STATION_NAMES } from './mtr-data';
import { MTR_STATION_LL } from './mtr-geo';
import type { NearMtr } from './nearby-cache';
import { hkClock, type Prefs } from './prefs';

/**
 * 港鐵（重鐵）：綫、站、實時到站（data.gov.hk「港鐵列車到站時間」API）。
 * 站名、站序由港鐵開放數據 CSV 生成（mtr-data.ts）；顏色係各綫官方代表色。
 */
export interface MtrLine {
  code: string;
  zh: string;
  en: string;
  color: string;
  /** 綫色上面嘅字色 */
  ink: string;
}

export const MTR_LINES: readonly MtrLine[] = [
  { code: 'ISL', zh: '港島綫', en: 'Island Line', color: '#007DC5', ink: '#fff' },
  { code: 'TWL', zh: '荃灣綫', en: 'Tsuen Wan Line', color: '#E2231A', ink: '#fff' },
  { code: 'KTL', zh: '觀塘綫', en: 'Kwun Tong Line', color: '#00AB4E', ink: '#fff' },
  { code: 'TKL', zh: '將軍澳綫', en: 'Tseung Kwan O Line', color: '#7D499D', ink: '#fff' },
  { code: 'TML', zh: '屯馬綫', en: 'Tuen Ma Line', color: '#923011', ink: '#fff' },
  { code: 'EAL', zh: '東鐵綫', en: 'East Rail Line', color: '#53B7E8', ink: '#0b2a3a' },
  { code: 'SIL', zh: '南港島綫', en: 'South Island Line', color: '#BAC429', ink: '#2a2d06' },
  { code: 'TCL', zh: '東涌綫', en: 'Tung Chung Line', color: '#F7943E', ink: '#3a1f05' },
  { code: 'AEL', zh: '機場快綫', en: 'Airport Express', color: '#00888A', ink: '#fff' },
  { code: 'DRL', zh: '迪士尼綫', en: 'Disneyland Resort Line', color: '#F173AC', ink: '#3a0a20' },
];

export const mtrLine = (code: string): MtrLine | undefined => MTR_LINES.find((l) => l.code === code);
export const mtrStationName = (code: string): string => MTR_STATION_NAMES[code]?.[0] ?? code;
export const mtrStationEn = (code: string): string => MTR_STATION_NAMES[code]?.[1] ?? code;
export const isMtrStation = (code: string): boolean => /^[A-Z]{3}$/.test(code) && code in MTR_STATION_NAMES;

/** 經過呢個站嘅綫（按 MTR_LINES 次序），例如金鐘 → 港島、荃灣、東鐵、南港島 */
export function mtrStationLines(sta: string): string[] {
  // 馬場唔喺站序（賽馬日先停），屬東鐵綫
  if (sta === 'RAC') return ['EAL'];
  const set = new Set<string>();
  for (const [key, list] of Object.entries(MTR_LINE_STATIONS)) if (list.includes(sta)) set.add(key.split(':')[0]!);
  return MTR_LINES.map((l) => l.code).filter((c) => set.has(c));
}

/** 一條綫（連支綫）嘅頭尾站：UP 方向往邊、DOWN 方向往邊（用嚟寫冇車時嘅方向名） */
export function mtrTermini(line: string): { up: string[]; down: string[] } {
  const up = new Set<string>();
  const down = new Set<string>();
  for (const [key, list] of Object.entries(MTR_LINE_STATIONS)) {
    if (key.split(':')[0] !== line) continue;
    down.add(list[0]!);
    up.add(list[list.length - 1]!);
  }
  return { up: [...up], down: [...down] };
}

export interface MtrTrain {
  /** 目的地站代號同中文名 */
  dest: string;
  destName: string;
  /** 月台 */
  plat: string;
  /** 預計到站（+08:00 ISO） */
  time: string;
  /** API 俾嘅分鐘數 */
  mins: number;
  /** 東鐵綫經馬場 */
  viaRacecourse?: boolean;
}

export interface MtrDirection {
  dir: 'UP' | 'DOWN';
  /** 方向名，例如「往 荃灣」（有車就用車嘅目的地，冇就用頭尾站） */
  label: string;
  trains: MtrTrain[];
}

export interface MtrLineEtas {
  line: string;
  dirs: MtrDirection[];
  /** 港鐵話延誤（isdelay = Y） */
  delayed: boolean;
  /** 港鐵成條綫暫時冇提供到站資料（API 回應 curr_time「-」、冇 UP／DOWN），唔等於冇車 */
  noData?: boolean;
}

interface RawTrain {
  dest?: string;
  plat?: string;
  time?: string;
  ttnt?: string;
  valid?: string;
  route?: string;
}

/** 「2026-11-09 08:01:00」（香港時間）→ +08:00 ISO */
const toIso = (s: string) => `${s.replace(' ', 'T')}+08:00`;

const dirLabel = (codes: string[]) => `往 ${codes.map(mtrStationName).join('／')}`;

/**
 * 解讀港鐵到站 API（getSchedule.php?line=&sta=）。status = 0（例如暫停服務）就當攞唔到。
 * 終點站有一邊冇車，嗰邊唔出。
 */
export function parseMtrSchedule(body: unknown, line: string, sta: string): MtrLineEtas | null {
  const b = body as { status?: number; isdelay?: string; data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[]; curr_time?: string }> };
  if (!b || b.status !== 1) return null;
  const d = b.data?.[`${line}-${sta}`];
  if (!d) return null;
  // 2026-11-09 早上觀塘綫成條綫都係咁（列車照行）：唔好寫「暫時冇班次」
  if (!d.UP && !d.DOWN && d.curr_time === '-') return { line, dirs: [], delayed: b.isdelay === 'Y', noData: true };
  const t = mtrTermini(line);
  const dirs: MtrDirection[] = (['UP', 'DOWN'] as const).flatMap((dir) => {
    const ends = (dir === 'UP' ? t.up : t.down).filter((c) => c !== sta);
    const trains = (d[dir] ?? [])
      // 收咗車之後 API 間中會俾聽日嘅班次（例如 1432 分鐘後）：兩個鐘以上嘅唔要
      .filter((x) => x.valid !== 'N' && x.time && x.dest && Number(x.ttnt ?? 0) <= 120)
      .map((x) => ({ dest: x.dest!, destName: mtrStationName(x.dest!), plat: x.plat ?? '', time: toIso(x.time!), mins: Number(x.ttnt ?? 0) || 0, ...(x.route === 'RAC' ? { viaRacecourse: true } : {}) }));
    // 呢個站係呢個方向嘅終點（例如荃灣嘅 UP）：冇車又冇得去，唔出
    if (!trains.length && !ends.length) return [];
    const destCodes = trains.length ? [...new Set(trains.map((x) => x.dest))] : ends;
    return [{ dir, label: dirLabel(destCodes), trains }];
  });
  return { line, dirs, delayed: b.isdelay === 'Y' };
}

export const MTR_API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

/** 一個站所有綫嘅到站時間（轉車站幾條綫一齊問）；攞唔到嘅綫放 failed */
export async function mtrStationEtas(sta: string, fetcher: typeof fetch): Promise<{ lines: MtrLineEtas[]; failed: string[] }> {
  const codes = mtrStationLines(sta);
  const results = await Promise.all(
    codes.map(async (line) => {
      try {
        const res = await fetcher(`${MTR_API}?line=${line}&sta=${sta}&lang=TC`);
        if (!res.ok) return { line, etas: null };
        return { line, etas: parseMtrSchedule(await res.json(), line, sta) };
      } catch {
        return { line, etas: null };
      }
    }),
  );
  return { lines: results.flatMap((r) => (r.etas ? [r.etas] : [])), failed: results.filter((r) => !r.etas).map((r) => r.line) };
}

/**
 * 一班車點顯示（港鐵慣例）：0 分鐘 =「正在離開」（列車喺月台）、1 分鐘 =「即將到站」，其他「N 分鐘」或者鐘數（設定「到站時間顯示」）。
 * 用 API 俾嘅分鐘數（ttnt，按港鐵伺服器時間計），唔自己減時間，同車站顯示屏一致。
 */
export function mtrTrainEta(t: Pick<MtrTrain, 'mins' | 'time'>, fmt: Prefs['etaFormat']): { main: string; unit: string; now: boolean } {
  if (t.mins <= 0) return { main: '正在離開', unit: '', now: true };
  if (t.mins === 1) return { main: '即將到站', unit: '', now: true };
  return fmt === 'clock' ? { main: hkClock(Date.parse(t.time)), unit: '', now: false } : { main: String(t.mins), unit: '分鐘', now: false };
}

/** 搜尋用：拎走空格、標點，統一大細楷同異體字（茘 → 荔） */
const searchKey = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/茘/g, '荔')
    .replace(/[\s\-'’.,()（）]/g, '');

/**
 * 搵港鐵站（路綫圖頂搜尋欄）：中文、英文（唔理大細楷同空格）或者站代號（例如 TKO）。
 * 排序：完全一樣 → 開頭一樣 → 英文某個字開頭 → 中間有；同分按站名長短。尾「站」／「station」會拎走。
 */
export function searchMtrStations(query: string, limit = 8): string[] {
  const q = searchKey(query).replace(/(站|station)$/, '');
  if (!q) return [];
  const hits: { code: string; score: number; len: number }[] = [];
  for (const [code, [zh, en]] of Object.entries(MTR_STATION_NAMES)) {
    const z = searchKey(zh);
    const e = searchKey(en);
    const words = en.toLowerCase().split(/[\s-]+/);
    let score: number;
    if (z === q || e === q || code.toLowerCase() === q) score = 0;
    else if (z.startsWith(q) || e.startsWith(q)) score = 1;
    else if (words.some((w) => w.startsWith(q))) score = 2;
    else if (z.includes(q) || e.includes(q)) score = 3;
    else continue;
    hits.push({ code, score, len: zh.length });
  }
  return hits
    .sort((a, b) => a.score - b.score || a.len - b.len || a.code.localeCompare(b.code))
    .slice(0, limit)
    .map((h) => h.code);
}

/** 綫名簡稱（到站卡標籤）：「荃灣」「東鐵」；機場快綫叫「機鐵」 */
export function mtrLineShort(code: string): string {
  if (code === 'AEL') return '機鐵';
  return (mtrLine(code)?.zh ?? code).replace(/綫$/, '');
}

/**
 * 附近港鐵站（直綫距離，由近到遠）。馬場只喺賽馬日開，唔計。
 * 首頁大字「最近港鐵站」用 2 公里內最近一個；大卡用 800 米內嘅。
 */
export function nearestMtrStations(lat: number, lng: number, maxM = 2000, limit = 3): NearMtr[] {
  return Object.entries(MTR_STATION_LL)
    .filter(([sta]) => sta !== 'RAC')
    .map(([sta, ll]) => ({ sta, distance: Math.round(metresBetween([lat, lng], [ll[0], ll[1]])) }))
    .filter((s) => s.distance <= maxM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * 港鐵站到站卡嘅行（首頁大卡、收藏）：每條綫每個方向下一班，按時間排，最多 limit 行；標籤用綫色同簡稱，有月台。
 * only = 只要呢幾條綫（收藏咗嘅綫；冇或者空 = 全部）。撳落去開港鐵路綫圖嗰個站（link.co = 'mtr'）。
 */
export function mtrDepartureRows(sta: string, lines: MtrLineEtas[], limit = 4, only?: string[]): DepartureRow[] {
  const rows: DepartureRow[] = [];
  for (const l of lines) {
    const info = mtrLine(l.line);
    if (!info || l.noData || (only?.length && !only.includes(l.line))) continue;
    for (const d of l.dirs) {
      const t = d.trains[0];
      if (!t) continue;
      rows.push({
        key: `mtr-${sta}-${l.line}-${d.dir}`,
        badge: { text: mtrLineShort(l.line), bg: info.color, ink: info.ink },
        dest: t.destName,
        at: Date.parse(t.time),
        platform: t.plat || undefined,
        nowText: t.mins <= 0 ? '正在離開' : t.mins === 1 ? '即將到站' : undefined,
        link: { co: 'mtr', route: l.line, dir: d.dir === 'UP' ? 'O' : 'I', stop: sta },
      });
    }
  }
  return rows.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity)).slice(0, limit);
}

/**
 * 首頁大卡嘅港鐵站卡：800 米內最多 2 個；冇嘅話照出（2 公里內）最近嗰個（例如青衣南去青衣站 1.9 公里），
 * 下班車一定見到港鐵。mtr = `/api/nearby` 嘅 mtr（由近到遠）。
 */
export function mtrCardStations(mtr: NearMtr[], nearM = 800, max = 2): NearMtr[] {
  const near = mtr.filter((m) => m.distance <= nearM).slice(0, max);
  return near.length ? near : mtr.slice(0, 1);
}

/** 「最近睇過」入面嘅港鐵站（route = 站代號，co = 'mtr'） */
export const mtrRecent = (sta: string) => ({ co: 'mtr' as const, route: sta, dir: 'O' as const, dest: mtrStationName(sta), companies: [] });
