import { metresBetween } from './geo';
import { LRT_ROUTE_STOPS, LRT_STOPS } from './lrt-data';
import { LRT_STOP_LL } from './lrt-geo';
import { hkClock, type Prefs } from './prefs';

/**
 * 輕鐵：路線（顏色）、站、實時到站（data.gov.hk「輕鐵列車到站時間」API，rt.data.gov.hk，同巴士 API 同一個 host）。
 * 路線同站序由港鐵開放數據 CSV 生成（lrt-data.ts，tools/lrt-data.py）。
 */
export interface LrtRoute {
  route: string;
  /** 路線色（路綫圖、標籤） */
  color: string;
  /** 色上面嘅字色 */
  ink: string;
}

/** 路線色：港鐵官方輕鐵路線色（Wikipedia Module:Adjacent stations/MTR Light Rail 記錄嘅色碼，路線識別用） */
export const LRT_ROUTES: readonly LrtRoute[] = [
  { route: '505', color: '#DA2128', ink: '#fff' },
  { route: '507', color: '#00A54F', ink: '#fff' },
  { route: '610', color: '#541912', ink: '#fff' },
  { route: '614', color: '#15C0F2', ink: '#05313f' },
  { route: '614P', color: '#F6A4AA', ink: '#4a1418' },
  { route: '615', color: '#FFDC01', ink: '#3a3000' },
  { route: '615P', color: '#016584', ink: '#fff' },
  { route: '705', color: '#7BC351', ink: '#1f3a0b' },
  { route: '706', color: '#B279B4', ink: '#fff' },
  { route: '751', color: '#F58220', ink: '#3a1c05' },
  { route: '761P', color: '#6E2C91', ink: '#fff' },
];

export const lrtRoute = (r: string): LrtRoute | undefined => LRT_ROUTES.find((x) => x.route === r);
export const lrtStopName = (id: string): string => LRT_STOPS[id]?.[0] ?? id;
export const lrtStopEn = (id: string): string => LRT_STOPS[id]?.[1] ?? id;
export const isLrtStop = (id: string): boolean => /^\d{1,4}$/.test(id) && id in LRT_STOPS;

/** 經過呢個站嘅路線（按 LRT_ROUTES 次序） */
export function lrtStopRoutes(id: string): string[] {
  return LRT_ROUTES.map((r) => r.route).filter((r) => Object.values(LRT_ROUTE_STOPS[r] ?? {}).some((list) => list.includes(id)));
}

export interface LrtTrain {
  route: string;
  /** 目的地（中文，例如「元朗」「天水圍循環綫」） */
  dest: string;
  destEn: string;
  /** 幾多分鐘；null = 冇時間（API 寫「-」） */
  mins: number | null;
  /** 即將抵達／正在離開 */
  status?: 'arriving' | 'departing';
  /** 1 = 單卡，2 = 孖卡 */
  cars: number;
}

export interface LrtPlatform {
  platform: string;
  trains: LrtTrain[];
}

interface RawLrtTrain {
  route_no?: string;
  dest_ch?: string;
  dest_en?: string;
  time_en?: string;
  time_ch?: string;
  train_length?: number;
}

/**
 * 解讀輕鐵到站 API（getSchedule?station_id=）：每個月台嘅班次。
 * time_en：「6 mins」「1 min」「Arriving」「Departing」「-」（冇時間）。status 唔係 1 就當攞唔到。
 */
export function parseLrtSchedule(body: unknown): LrtPlatform[] | null {
  const b = body as { status?: number; platform_list?: { platform_id?: number | string; route_list?: RawLrtTrain[] }[] };
  if (!b || b.status !== 1 || !Array.isArray(b.platform_list)) return null;
  return b.platform_list.map((p) => ({
    platform: String(p.platform_id ?? ''),
    trains: (p.route_list ?? [])
      .filter((t) => t.route_no)
      .map((t) => {
        const en = (t.time_en ?? '').trim().toLowerCase();
        const n = en.match(/^(\d+)\s*min/);
        const status = en.startsWith('arriv') ? ('arriving' as const) : en.startsWith('depart') ? ('departing' as const) : undefined;
        return {
          route: t.route_no!,
          dest: (t.dest_ch ?? '').trim(),
          destEn: (t.dest_en ?? '').trim(),
          mins: n ? Number(n[1]) : status ? 0 : null,
          ...(status ? { status } : {}),
          cars: Number(t.train_length) || 1,
        };
      }),
  }));
}

export const LRT_API = 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule';

/** 一個輕鐵站所有月台嘅到站時間；攞唔到 failed = true */
export async function lrtStationEtas(id: string, fetcher: typeof fetch): Promise<{ platforms: LrtPlatform[]; failed: boolean }> {
  try {
    const res = await fetcher(`${LRT_API}?station_id=${id}`);
    if (!res.ok) return { platforms: [], failed: true };
    const p = parseLrtSchedule(await res.json());
    return p ? { platforms: p, failed: false } : { platforms: [], failed: true };
  } catch {
    return { platforms: [], failed: true };
  }
}

/** 搵輕鐵站（中文、英文唔理大細楷同空格、站代號），同港鐵搜尋一樣嘅排序 */
export function searchLrtStops(query: string, limit = 8): string[] {
  const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\-'’.,()（）]/g, '');
  const q = key(query).replace(/(站|stop|station)$/, '');
  if (!q) return [];
  const hits: { id: string; score: number; len: number }[] = [];
  for (const [id, [zh, en, code]] of Object.entries(LRT_STOPS)) {
    const z = key(zh);
    const e = key(en);
    const words = en.toLowerCase().split(/[\s-]+/);
    let score: number;
    if (z === q || e === q || code.toLowerCase() === q) score = 0;
    else if (z.startsWith(q) || e.startsWith(q)) score = 1;
    else if (words.some((w) => w.startsWith(q))) score = 2;
    else if (z.includes(q) || e.includes(q)) score = 3;
    else continue;
    hits.push({ id, score, len: zh.length });
  }
  return hits
    .sort((a, b) => a.score - b.score || a.len - b.len || Number(a.id) - Number(b.id))
    .slice(0, limit)
    .map((h) => h.id);
}

/**
 * 輕鐵班次顯示：「正在離開」「即將到站」，其他 N 分鐘（設定揀鐘數就顯示 HH:MM，由 now 起計）。
 * API 冇時間（「-」）就顯示「—」。
 */
export function lrtTrainEta(t: Pick<LrtTrain, 'mins' | 'status'>, fmt: Prefs['etaFormat'], now = Date.now()): { main: string; unit: string; now: boolean } {
  if (t.status === 'departing') return { main: '正在離開', unit: '', now: true };
  if (t.status === 'arriving' || t.mins === 0) return { main: '即將到站', unit: '', now: true };
  if (t.mins == null) return { main: '—', unit: '', now: false };
  return fmt === 'clock' ? { main: hkClock(now + t.mins * 60_000), unit: '', now: false } : { main: String(t.mins), unit: '分鐘', now: false };
}

/** 單卡／孖卡 */
export const lrtCars = (n: number): string => (n >= 2 ? '孖卡' : '單卡');

/** 最近嘅輕鐵站（直線距離，米）：maxM 內最多 limit 個，近嘅排先 */
export function nearestLrtStops(lat: number, lng: number, maxM = 2000, limit = 3): { sta: string; distance: number }[] {
  return Object.entries(LRT_STOP_LL)
    .map(([sta, ll]) => ({ sta, distance: Math.round(metresBetween([lat, lng], [ll[0], ll[1]])) }))
    .filter((s) => s.distance <= maxM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
