'use client';
import { useSyncExternalStore } from 'react';
import { cleanFavGroups, FAV_GROUPS_KEY, type FavGroupDef } from '@hknt/core';
import { clearFavoriteGroup } from './favorites';

/** 收藏分組（core fav-groups.ts）：localStorage，同 App AsyncStorage 一樣格式 */
const EVENT = 'hknt:favGroups';
let memory: FavGroupDef[] | null = null;
const EMPTY: FavGroupDef[] = [];

function read(): FavGroupDef[] {
  if (memory) return memory;
  try {
    memory = cleanFavGroups(JSON.parse(localStorage.getItem(FAV_GROUPS_KEY) ?? '[]'));
  } catch {
    memory = [];
  }
  return memory;
}

function write(list: FavGroupDef[]) {
  memory = list;
  try {
    localStorage.setItem(FAV_GROUPS_KEY, JSON.stringify(list));
  } catch {
    /* 今次瀏覽仍然有效 */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useFavGroups(): FavGroupDef[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 新增或者改（同 id 就改） */
export function saveFavGroup(g: FavGroupDef) {
  const cur = read();
  write(cur.some((x) => x.id === g.id) ? cur.map((x) => (x.id === g.id ? g : x)) : [...cur, g]);
}

/** 刪分組：入面嘅收藏變返未分組（收藏本身唔刪） */
export function deleteFavGroup(id: string) {
  write(read().filter((x) => x.id !== id));
  clearFavoriteGroup(id);
}
