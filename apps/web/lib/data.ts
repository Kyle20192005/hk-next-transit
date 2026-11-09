import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CO_LIST, dataFileRequest, type AnyStopEntry, isCo, SAFE_ROUTE, type Calendar, type Co, type Place, type RouteData, type RouteIndex, type TramTimetable } from '@hknt/core';

/**
 * 讀 pipeline 輸出嘅數據。
 * - 有 DATA_BASE_URL：由網上攞（每小時更新一次 cache）
 * - 冇：讀本地 pipeline/out（開發用）
 *
 * 私人 GitHub repo：設定 DATA_TOKEN（fine-grained token，Contents 唯讀）。
 * DATA_BASE_URL 係 raw.githubusercontent.com 網址時，會自動改用 GitHub Contents API，
 * 因為 raw 網址唔一定接受 fine-grained token。
 */
const BASE = process.env.DATA_BASE_URL?.replace(/\/+$/, '');
const TOKEN = process.env.DATA_TOKEN;
const LOCAL = path.resolve(process.cwd(), '../../pipeline/out');

/** 回傳實際要 call 嘅網址同 headers（core dataFileRequest，同 tracker 共用） */
const remote = (file: string) => dataFileRequest(BASE!, TOKEN, file);

/** 數據版本（index.json 嘅 generatedAt）檢查頻率 */
const VERSION_REVALIDATE_S = 300;

/**
 * 數據版本：用嚟做 cache key。Vercel 嘅 fetch cache 喺重新部署之後都會保留，
 * 如果淨係靠時間過期，數據更新咗都要等成個鐘先見到；加版本落網址，數據一更新就用新嘅。
 */
async function dataVersion(): Promise<string> {
  const { url, headers } = remote('ctb/index.json');
  try {
    const res = await fetch(url, { headers, next: { revalidate: VERSION_REVALIDATE_S } });
    if (!res.ok) return '';
    return ((await res.json()) as RouteIndex).generatedAt ?? '';
  } catch {
    return '';
  }
}

/**
 * 記憶體 cache（同一個 Vercel instance 重用）：Next.js fetch cache 每項最多 2MB，`stops.json`（約 2.6MB）cache 唔到，
 * 每次「附近」都要重新下載同 parse，慢成 2–3 秒。只 cache 幾個大嘅共用檔（呼叫者唔會改佢哋）；
 * key 有數據版本，數據一更新就換新，舊版本嗰份順手清走。
 */
const MEMO_FILES = new Set(['stops.json', 'places.json', 'index.json', 'calendar.json', 'ctb/stops.json']);
const memo = new Map<string, Promise<unknown>>();

async function load<T>(file: string): Promise<T | null> {
  if (BASE) {
    const isIndex = file === 'ctb/index.json';
    const version = isIndex ? '' : await dataVersion();
    if (!version || !MEMO_FILES.has(file)) return fetchRemote<T>(file, version);
    const key = `${version}|${file}`;
    let hit = memo.get(key) as Promise<T | null> | undefined;
    if (!hit) {
      for (const k of memo.keys()) if (k.endsWith(`|${file}`)) memo.delete(k);
      hit = fetchRemote<T>(file, version);
      memo.set(key, hit);
      // 出錯唔好記住，下次再試
      hit.catch(() => memo.delete(key));
    }
    return hit;
  }
  try {
    return JSON.parse(await readFile(path.join(LOCAL, file), 'utf-8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function fetchRemote<T>(file: string, version: string): Promise<T | null> {
  const { url: base, headers } = remote(file);
  const isIndex = file === 'ctb/index.json';
  const url = version ? `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}` : base;
  const res = await fetch(url, { headers, next: { revalidate: isIndex ? VERSION_REVALIDATE_S : 86400 } });
  if (res.status === 404) {
    // 私人 repo 冇權限時 GitHub 都係回 404，所以要寫 log，唔好靜靜雞當冇數據
    console.warn(`[data] ${file}：404（檔案唔存在，或者冇權限讀取）`);
    return null;
  }
  if (!res.ok) throw new Error(`讀取 ${file} 失敗：HTTP ${res.status}`);
  return (await res.json()) as T;
}


export function getCtbRoute(route: string): Promise<RouteData | null> {
  if (!SAFE_ROUTE.test(route)) return Promise.resolve(null);
  return load<RouteData>(`ctb/${route.toUpperCase()}.json`);
}

export async function getCtbIndex(): Promise<RouteIndex> {
  return (await load<RouteIndex>('ctb/index.json')) ?? { generatedAt: '', routes: [] };
}

/** 站點索引（附近車站用）：每個站經過嘅路線、方向、往邊度（唔包終點站） */
export interface StopIndexEntry {
  id: string;
  n: string;
  lat: number;
  lng: number;
  r: [route: string, dir: 'O' | 'I', destTc: string][];
}

export async function getCtbStops(): Promise<StopIndexEntry[]> {
  return (await load<{ stops: StopIndexEntry[] }>('ctb/stops.json'))?.stops ?? [];
}

/** 路線檔位置（core 共用） */
export { CO_LIST, isCo, type Co };

export function getRoute(co: Co, route: string): Promise<RouteData | null> {
  if (!isCo(co) || !SAFE_ROUTE.test(route)) return Promise.resolve(null);
  return load<RouteData>(`${co}/${route.toUpperCase()}.json`);
}

/** 統一路線索引（兩間公司）；舊數據冇就用城巴索引 */
export async function getIndex(): Promise<RouteIndex> {
  return (await load<RouteIndex>('index.json')) ?? (await getCtbIndex());
}

/** 統一站點索引項目（core 共用） */
export type { AnyStopEntry };

/** 統一站點索引（城巴站 + 九巴站）；舊數據冇就用城巴站 */
export async function getAllStops(): Promise<AnyStopEntry[]> {
  const all = await load<{ stops: AnyStopEntry[] }>('stops.json');
  if (all) return all.stops;
  return (await getCtbStops()).map((s) => ({ ...s, co: 'ctb' as const, r: s.r.map((x) => ['ctb', ...x] as AnyStopEntry['r'][number]) }));
}

/** 地區名（OSM，pipeline places.py）；舊數據冇就係空 */
export async function getPlaces(): Promise<Place[]> {
  return (await load<{ places: Place[] }>('places.json'))?.places ?? [];
}

export async function getCalendar(): Promise<Calendar> {
  return (await load<Calendar>('calendar.json')) ?? {};
}

/** 電車時間表（pipeline/tram.py）；舊數據冇就係 null */
export async function getTramTimetable(): Promise<TramTimetable | null> {
  return load<TramTimetable>('tram.json');
}

/** 診斷用：數據來源設定同讀取結果（唔會顯示 token） */
export async function dataHealth() {
  const source = !BASE ? 'local' : remote('ctb/index.json').via;
  const out: Record<string, unknown> = {
    source,
    dataBaseUrl: BASE ?? null,
    hasToken: Boolean(TOKEN),
  };
  if (!BASE) {
    out.localDir = LOCAL;
  } else {
    const { url, headers } = remote('ctb/index.json');
    try {
      const res = await fetch(url, { headers, cache: 'no-store' });
      out.indexStatus = res.status;
      if (res.ok) {
        const idx = (await res.json()) as RouteIndex;
        out.routes = idx.routes.length;
        out.generatedAt = idx.generatedAt;
      } else {
        out.hint =
          res.status === 404
            ? '404：檔案唔存在，或者 token 冇呢個 repo 嘅讀取權限'
            : res.status === 401
              ? '401：token 無效或者過期'
              : res.status === 403
                ? '403：token 權限唔夠（要 Contents: Read-only），或者超過 API 限額'
                : undefined;
      }
    } catch (e) {
      out.error = (e as Error).message;
    }
  }
  return out;
}
