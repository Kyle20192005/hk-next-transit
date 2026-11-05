import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';
import type { Company } from '@hknt/core';
import type { Co } from './api';

/**
 * 收藏（同網頁版 lib/favorites.ts 一樣嘅格式）：路線（某個方向）或者路線上嘅某個站。
 * 存喺 AsyncStorage（只喺呢部機）；開 App 時讀一次入記憶體，之後同步更新。
 */
export interface Favorite {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  stopId?: string;
  stopName?: string;
  at: number;
}

const KEY = 'hknt.favorites.v1';
let list: Favorite[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const favKey = (f: Pick<Favorite, 'co' | 'route' | 'dir' | 'stopId'>) => `${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`;

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) {
        list = JSON.parse(raw) as Favorite[];
        emit();
      }
    })
    .catch(() => {
      /* 讀唔到就當冇收藏 */
    });
}

function write(next: Favorite[]) {
  list = next;
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {
    /* 寫唔到：今次開 App 仍然有效 */
  });
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useFavorites(): Favorite[] {
  return useSyncExternalStore(subscribe, () => list, () => list);
}

export function useFavorite(target: Omit<Favorite, 'at'>): [boolean, () => void] {
  const all = useFavorites();
  const key = favKey(target);
  const on = all.some((f) => favKey(f) === key);
  const toggle = useCallback(() => {
    write(list.some((f) => favKey(f) === key) ? list.filter((f) => favKey(f) !== key) : [{ ...target, at: Date.now() }, ...list]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [on, toggle];
}

export function removeFavorite(f: Favorite) {
  write(list.filter((x) => favKey(x) !== favKey(f)));
}
