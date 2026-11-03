import type { Calendar, Eta, RouteData, RouteIndex } from '@hknt/core';

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
  calendar: () => get<Calendar>('/api/calendar'),
  ctbRoute: (route: string) => get<RouteData>(`/api/ctb/${encodeURIComponent(route)}`),
  /** 成條線嘅巴士位置（後端用每個站嘅 ETA 追蹤）同同 ETA 一致嘅每段行車時間 */
  buses: (route: string, variantId: string) =>
    get<{ buses: { from: number; nextEta: string }[]; segSeconds: number[]; fetchedAt: string }>(
      `/api/buses?company=ctb&route=${encodeURIComponent(route)}&v=${encodeURIComponent(variantId)}`,
    ),
  eta: (route: string, stop: string) =>
    get<{ etas: Eta[]; fetchedAt: string }>(`/api/eta?company=ctb&route=${encodeURIComponent(route)}&stop=${stop}`),
};
