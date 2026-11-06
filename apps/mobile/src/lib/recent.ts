import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Company } from '@hknt/core';
import type { Co } from './api';

/**
 * 最近睇過嘅路線（首頁「最近睇過」，同網頁 lib/recent.ts 一樣格式）：AsyncStorage，最多 8 條，同一條線同方向只留最新。
 */
export interface RecentRoute {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  at: number;
}

const KEY = 'hknt.recent.v1';
const MAX = 8;
let list: RecentRoute[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) {
        // 開 App 之後已經加咗嘅（例如由通知直接入路線頁）排先
        const saved = JSON.parse(raw) as RecentRoute[];
        list = [...list, ...saved.filter((s) => !list.some((x) => x.co === s.co && x.route === s.route && x.dir === s.dir))].slice(0, MAX);
        emit();
      }
    })
    .catch(() => {});
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function addRecent(r: Omit<RecentRoute, 'at'>) {
  load();
  const same = (x: RecentRoute) => x.co === r.co && x.route === r.route && x.dir === r.dir;
  list = [{ ...r, at: Date.now() }, ...list.filter((x) => !same(x))].slice(0, MAX);
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

export function useRecent(): RecentRoute[] {
  return useSyncExternalStore(subscribe, () => list, () => list);
}

/** 清除最近睇過（設定頁） */
export function clearRecent() {
  load();
  list = [];
  emit();
  AsyncStorage.removeItem(KEY).catch(() => {});
}
