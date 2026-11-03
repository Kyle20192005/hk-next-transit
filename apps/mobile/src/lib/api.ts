import type { Eta, RouteData, RouteIndex } from '@hknt/core';

/** 後端 = apps/web 嘅 API。上線時設定 EXPO_PUBLIC_API_BASE 做正式網址 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  ctbIndex: () => get<RouteIndex>('/api/ctb'),
  ctbRoute: (route: string) => get<RouteData>(`/api/ctb/${encodeURIComponent(route)}`),
  eta: (route: string, stop: string) =>
    get<{ etas: Eta[]; fetchedAt: string }>(`/api/eta?company=ctb&route=${encodeURIComponent(route)}&stop=${stop}`),
};
