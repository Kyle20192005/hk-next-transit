'use client';
import { useEffect, useState } from 'react';
import { cleanTools, DEFAULT_TOOLS, type NewsItem, type ToolId } from '@hknt/core';

const REFRESH_MS = 5 * 60_000;

/** 交通消息（`/api/news`），有位置就標埋附近；每 5 分鐘更新 */
export function useNews(pos: { lat: number; lng: number } | null): NewsItem[] | null {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const key = pos ? `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)}` : '';
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/news${key ? `?lat=${key.split(',')[0]}&lng=${key.split(',')[1]}` : ''}`);
        const body = (await res.json()) as { items?: NewsItem[] };
        if (!cancelled && res.ok) setItems(body.items ?? []);
      } catch {
        if (!cancelled) setItems((x) => x ?? []);
      }
    };
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

export function loadTools(): ToolId[] {
  try {
    return cleanTools(JSON.parse(localStorage.getItem(TOOLS_KEY) ?? 'null'));
  } catch {
    return DEFAULT_TOOLS;
  }
}
export function saveTools(t: ToolId[]) {
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(t));
  } catch {
    /* 今次有效 */
  }
}
