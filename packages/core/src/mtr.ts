import { MTR_LINE_STATIONS, MTR_STATION_NAMES } from './mtr-data';

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
  const b = body as { status?: number; isdelay?: string; data?: Record<string, { UP?: RawTrain[]; DOWN?: RawTrain[] }> };
  if (!b || b.status !== 1) return null;
  const d = b.data?.[`${line}-${sta}`];
  if (!d) return null;
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
