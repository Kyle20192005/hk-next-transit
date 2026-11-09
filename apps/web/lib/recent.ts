'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Company } from '@hknt/core';
import type { Co } from './data';

/**
 * 最近睇過嘅路線（首頁「最近睇過」）：存喺 localStorage，最多 8 條，同一條線同方向只留最新。
 * 讀寫 try/catch（私密瀏覽等用唔到就只喺記憶體）。App 版 apps/mobile/src/lib/recent.ts。
 */
export interface RecentRoute {
  /** 'mtr' = 港鐵站（route = 站代號，dest = 站名；core mtrRecent） */
  co: Co | 'mtr';
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  at: number;
}

const KEY = 'hknt.recent.v1';
const EVENT = 'hknt:recent';
const MAX = 8;
let memory: RecentRoute[] | null = null;
const EMPTY: RecentRoute[] = [];

function read(): RecentRoute[] {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as RecentRoute[]) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function addRecent(r: Omit<RecentRoute, 'at'>) {
  const same = (x: RecentRoute) => x.co === r.co && x.route === r.route && x.dir === r.dir;
  memory = [{ ...r, at: Date.now() }, ...read().filter((x) => !same(x))].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* 今次瀏覽仍然有效 */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useRecent(): RecentRoute[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** 路線頁用：開咗呢條線就記低（client component，路線頁係 server component） */
export function RecordRecent({ target }: { target: Omit<RecentRoute, 'at'> }) {
  const { co, route, dir, dest } = target;
  useEffect(() => {
    addRecent(target);
    // target 每次 render 都係新 object，用內容判斷
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co, route, dir, dest]);
  return null;
}

/** 清除最近睇過（設定頁） */
export function clearRecent() {
  memory = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 今次瀏覽仍然有效 */
  }
  window.dispatchEvent(new Event(EVENT));
}
