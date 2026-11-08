import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { cleanFavGroups, FAV_GROUPS_KEY, type FavGroupDef } from '@hknt/core';
import { clearFavoriteGroup } from './favorites';

/** 收藏分組（core fav-groups.ts）：AsyncStorage，同網頁 lib/fav-groups.ts 一樣格式 */
let list: FavGroupDef[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(FAV_GROUPS_KEY)
    .then((raw) => {
      if (raw) {
        list = cleanFavGroups(JSON.parse(raw));
        emit();
      }
    })
    .catch(() => {});
}

function write(next: FavGroupDef[]) {
  list = next;
  emit();
  AsyncStorage.setItem(FAV_GROUPS_KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useFavGroups(): FavGroupDef[] {
  return useSyncExternalStore(subscribe, () => list, () => list);
}

/** 新增或者改（同 id 就改） */
export function saveFavGroup(g: FavGroupDef) {
  load();
  write(list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g]);
}

/** 刪分組：入面嘅收藏變返未分組（收藏本身唔刪） */
export function deleteFavGroup(id: string) {
  write(list.filter((x) => x.id !== id));
  clearFavoriteGroup(id);
}
