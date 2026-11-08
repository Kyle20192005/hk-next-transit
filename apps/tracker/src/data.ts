import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataFileRequest, isCo, SAFE_ROUTE, SAFE_STOP, type AnyStopEntry, type Calendar, type Co, type RouteData, type RouteIndex } from '@hknt/core';
import { config } from './config';

/**
 * 讀 pipeline 輸出嘅路線數據（同網頁 apps/web/lib/data.ts 一樣嘅來源）：
 * DATA_BASE_URL（GitHub data 分支；私人 repo 加 DATA_TOKEN，自動改用 Contents API）或者本地 DATA_DIR。
 * 記憶體 cache；每 5 分鐘睇一次數據版本（index.json 嘅 generatedAt），換咗版就清 cache。
 */
const VERSION_CHECK_MS = 5 * 60_000;
const remote = (file: string) => dataFileRequest(config.dataBaseUrl!, config.dataToken, file);

async function loadFile<T>(file: string): Promise<T | null> {
  if (config.dataBaseUrl) {
    const { url, headers } = remote(file);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`讀取 ${file} 失敗：HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  try {
    return JSON.parse(await readFile(path.resolve(config.dataDir, file), 'utf-8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

let version = '';
let checkedAt = 0;
const files = new Map<string, Promise<unknown>>();

/** 數據版本；過期就再睇，版本變咗就清晒 cache */
export async function dataVersion(): Promise<string> {
  if (Date.now() - checkedAt < VERSION_CHECK_MS) return version;
  checkedAt = Date.now();
  try {
    const idx = await loadFile<RouteIndex>('ctb/index.json');
    const v = idx?.generatedAt ?? '';
    if (v && v !== version) {
      if (version) console.log(`[data] 數據版本 ${version} → ${v}，清 cache`);
      version = v;
      files.clear();
    }
  } catch (e) {
    console.warn(`[data] 睇唔到數據版本：${(e as Error).message}`);
  }
  return version;
}

function cached<T>(file: string): Promise<T | null> {
  let p = files.get(file) as Promise<T | null> | undefined;
  if (!p) {
    p = loadFile<T>(file);
    files.set(file, p);
    p.catch(() => files.delete(file)); // 出錯唔好記住，下次再試
  }
  return p;
}

export { isCo, SAFE_ROUTE, SAFE_STOP, type Co };

export async function getRoute(co: Co, route: string): Promise<RouteData | null> {
  await dataVersion();
  return cached<RouteData>(`${co}/${route.toUpperCase()}.json`);
}

export async function getCalendar(): Promise<Calendar> {
  await dataVersion();
  return (await cached<Calendar>('calendar.json')) ?? {};
}

/** 統一路線索引（聯營線判斷、公司名） */
export async function getIndex(): Promise<RouteIndex> {
  await dataVersion();
  return (await cached<RouteIndex>('index.json')) ?? { generatedAt: '', routes: [] };
}

/** 統一站點索引（約 2.6MB，載入一次放記憶體）：附近、喺度搭得用 */
export async function getAllStops(): Promise<AnyStopEntry[]> {
  await dataVersion();
  return (await cached<{ stops: AnyStopEntry[] }>('stops.json'))?.stops ?? [];
}
