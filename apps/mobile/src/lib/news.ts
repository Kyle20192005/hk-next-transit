import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { cleanTools, DEFAULT_TOOLS, type NewsItem, type ToolId } from '@hknt/core';
import { api } from './api';

const REFRESH_MS = 5 * 60_000;

/** 交通消息（`/api/news`），有位置就標埋附近；每 5 分鐘更新（同網頁 lib/news.ts 一樣） */
export function useNews(pos: { lat: number; lng: number } | null): NewsItem[] | null {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const key = pos ? `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)}` : '';
  useEffect(() => {
    let cancelled = false;
    const p = key ? { lat: Number(key.split(',')[0]), lng: Number(key.split(',')[1]) } : null;
    const tick = () =>
      api
        .news(p)
        .then((b) => !cancelled && setItems(b.items))
        .catch(() => !cancelled && setItems((x) => x ?? []));
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [key]);
  return items;
}

const TOOLS_KEY = 'hknt.tools';

/** 首頁常用工具：AsyncStorage（同網頁 localStorage 一樣格式）。首頁同「自訂常用工具」頁共用一份，儲存後首頁即刻更新 */
let current: ToolId[] = DEFAULT_TOOLS;
let loaded = false;
const listeners = new Set<(t: ToolId[]) => void>();
function setAll(t: ToolId[]) {
  current = t;
  listeners.forEach((f) => f(t));
}
export function saveTools(t: ToolId[]) {
  setAll(t);
  AsyncStorage.setItem(TOOLS_KEY, JSON.stringify(t)).catch(() => {});
}
export function useTools(): ToolId[] {
  const [tools, setTools] = useState<ToolId[]>(current);
  useEffect(() => {
    listeners.add(setTools);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(TOOLS_KEY)
        .then((raw) => raw && setAll(cleanTools(JSON.parse(raw))))
        .catch(() => {});
    }
    return () => {
      listeners.delete(setTools);
    };
  }, []);
  return tools;
}
