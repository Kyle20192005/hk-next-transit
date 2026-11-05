import type { Calendar, Company, Eta, RouteData, RouteIndex } from '@hknt/core';

/** 後端 = apps/web 嘅 API。上線時設定 EXPO_PUBLIC_API_BASE 做正式網址（例如 https://eta.kyle05.dev） */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000').replace(/\/+$/, '');

/** 路線檔位置：ctb（城巴同聯營線）、kmb（九巴、龍運）、nlb（新大嶼山巴士）、mtrb（港鐵巴士） */
export type Co = 'ctb' | 'kmb' | 'nlb' | 'mtrb';
export const isCo = (x: unknown): x is Co => x === 'ctb' || x === 'kmb' || x === 'nlb' || x === 'mtrb';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface NearStop {
  id: string;
  co: Co;
  name: string;
  distance: number;
  routes: { co: Co; route: string; dir: 'O' | 'I'; dest: string; companies: Company[] }[];
}

export interface LiveBus {
  from: number;
  nextEta: string;
  company?: string;
  gps?: { lat: number; lng: number };
  schedule?: boolean;
}

const q = encodeURIComponent;

export const api = {
  /** 所有路線（四間公司；聯營線只出一次） */
  routes: () => get<RouteIndex>('/api/routes'),
  calendar: () => get<Calendar>('/api/calendar'),
  route: (co: Co, route: string) => get<RouteData>(`/api/route/${co}/${q(route)}`),
  /** 成條線嘅巴士位置同同 ETA 一致嘅每段行車時間 */
  buses: (co: Co, route: string, variantId: string) =>
    get<{ buses: LiveBus[]; segSeconds: number[]; fetchedAt: string }>(`/api/buses?co=${co}&route=${q(route)}&v=${q(variantId)}`),
  /** 某站到站時間；failed = 攞唔到數據嘅公司（唔好當佢冇車） */
  eta: (co: Co, route: string, stop: string) =>
    get<{ etas: Eta[]; failed?: Company[]; fetchedAt: string }>(`/api/eta?co=${co}&route=${q(route)}&stop=${q(stop)}`),
  nearby: (lat: number, lng: number) => get<{ stops: NearStop[] }>(`/api/nearby?lat=${lat}&lng=${lng}`),
  /** 一個站所有路線嘅下一班 */
  stopEtas: (co: Co, stop: string) =>
    get<{ routes: { route: string; dir: 'O' | 'I'; etas: { eta: string; company: Company; scheduled: boolean }[] }[] }>(
      `/api/stop-etas?co=${co}&stop=${q(stop)}`,
    ),
};
