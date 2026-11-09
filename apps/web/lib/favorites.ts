'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { mtrLine, mtrStationName, type Company } from '@hknt/core';
import type { Co } from './data';

/**
 * 收藏：路線（某個方向）、路線上嘅某個站，或者港鐵站（co = 'mtr'，stopId = 站代號，成個站所有綫）。
 * 存喺瀏覽器 localStorage（唔使登入，只喺呢部機）。
 * localStorage 可能用唔到（私密瀏覽、封鎖網站資料），所以讀寫都 try/catch，用唔到就只喺記憶體。
 */
export interface Favorite {
  co: Co | 'mtr';
  route: string;
  dir: 'O' | 'I';
  /** 往邊度（顯示用） */
  dest: string;
  companies: Company[];
  /** 收藏咗嘅站；冇即係收藏成條路線 */
  stopId?: string;
  stopName?: string;
  /** 加入時間（排序用） */
  at: number;
  /** 收藏分組 ID（core fav-groups.ts）；冇 = 未分組 */
  group?: string;
}

const KEY = 'hknt.favorites.v1';
const EVENT = 'hknt:favorites';
let memory: Favorite[] | null = null;
const EMPTY: Favorite[] = [];

/**
 * 港鐵收藏（路綫圖面板撳星號）：同巴士「路線 + 站」一樣係「綫 + 站」（route = 綫代號）。
 * 0.18.0 收藏咗成個站嘅（route 空白）照用，顯示所有綫。
 */
export const mtrFavorite = (sta: string, line: string): Omit<Favorite, 'at'> => ({
  co: 'mtr',
  route: line,
  dir: 'O',
  dest: mtrLine(line)?.zh ?? line,
  companies: [],
  stopId: sta,
  stopName: mtrStationName(sta),
});
export const isMtrFav = (f: Pick<Favorite, 'co'>): f is Favorite & { co: 'mtr' } => f.co === 'mtr';

export const favKey = (f: Pick<Favorite, 'co' | 'route' | 'dir' | 'stopId'>) => `${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`;

function read(): Favorite[] {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Favorite[]) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function write(list: Favorite[]) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 用唔到 localStorage：今次瀏覽仍然有效 */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memory = null;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage); // 其他分頁改咗
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** 收藏列表（新加嘅排先） */
export function useFavorites(): Favorite[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 某個路線／站有冇收藏，同埋切換 */
export function useFavorite(target: Omit<Favorite, 'at'>): [boolean, () => void] {
  const list = useFavorites();
  const key = favKey(target);
  const on = list.some((f) => favKey(f) === key);
  const toggle = useCallback(() => {
    const cur = read();
    write(cur.some((f) => favKey(f) === key) ? cur.filter((f) => favKey(f) !== key) : [{ ...target, at: Date.now() }, ...cur]);
    // target 每次 render 都係新 object，用 key 判斷就夠
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [on, toggle];
}

export function removeFavorite(f: Favorite) {
  write(read().filter((x) => favKey(x) !== favKey(f)));
}

/** 清除所有收藏（設定頁） */
export function clearFavorites() {
  write([]);
}

/** 放入分組（null = 移出分組） */
export function setFavoriteGroup(f: Favorite, group: string | null) {
  write(read().map((x) => (favKey(x) === favKey(f) ? { ...x, group: group ?? undefined } : x)));
}

/** 刪分組時：入面嘅收藏變返未分組 */
export function clearFavoriteGroup(group: string) {
  write(read().map((x) => (x.group === group ? { ...x, group: undefined } : x)));
}
