import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Calendar, RouteData, RouteIndex } from '@hknt/core';

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

const RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/;

/** 回傳實際要 call 嘅網址同 headers */
function remote(file: string): { url: string; headers: Record<string, string>; via: 'github-api' | 'url' } {
  const m = BASE!.match(RAW_GITHUB);
  if (TOKEN && m) {
    const [, owner, repo, ref] = m;
    return {
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(ref!)}`,
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      via: 'github-api',
    };
  }
  return { url: `${BASE}/${file}`, headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}, via: 'url' };
}

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

async function load<T>(file: string): Promise<T | null> {
  if (BASE) {
    const { url: base, headers } = remote(file);
    const isIndex = file === 'ctb/index.json';
    const version = isIndex ? '' : await dataVersion();
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
  try {
    return JSON.parse(await readFile(path.join(LOCAL, file), 'utf-8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

const SAFE_ROUTE = /^[A-Za-z0-9]{1,6}$/;

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

export async function getCalendar(): Promise<Calendar> {
  return (await load<Calendar>('calendar.json')) ?? {};
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
