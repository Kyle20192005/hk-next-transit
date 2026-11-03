import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Calendar, RouteData, RouteIndex } from '@hknt/core';

/**
 * 讀 pipeline 輸出嘅數據。
 * 有 DATA_BASE_URL 就由 CDN 攞（每小時更新一次 cache），冇就讀本地 pipeline/out（開發用）。
 */
const BASE = process.env.DATA_BASE_URL;
/** 私人 GitHub repo 用：只需 Contents 讀取權限嘅 fine-grained token */
const TOKEN = process.env.DATA_TOKEN;
const LOCAL = path.resolve(process.cwd(), '../../pipeline/out');

async function load<T>(file: string): Promise<T | null> {
  if (BASE) {
    const res = await fetch(`${BASE}/${file}`, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined,
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`讀取 ${file} 失敗：${res.status}`);
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

export async function getCalendar(): Promise<Calendar> {
  return (await load<Calendar>('calendar.json')) ?? {};
}
