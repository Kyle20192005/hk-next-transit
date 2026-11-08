import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBusesClient, type Calendar, type Company, type Eta, type NewsItem, type RouteData, type RouteIndex } from '@hknt/core';

/**
 * 後端 = apps/web 嘅 API。預設用線上網站（手機連唔到電腦嘅 localhost）；
 * 想用本地 server 就設定 EXPO_PUBLIC_API_BASE（例如 http://<電腦 IP>:3000）。
 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'https://eta.kyle05.dev').replace(/\/+$/, '');

/** 巴士位置：tracker（EXPO_PUBLIC_TRACKER_URL）優先，出錯退返 API_BASE */
const busesClient = createBusesClient({ trackerBase: process.env.EXPO_PUBLIC_TRACKER_URL, fallbackBase: API_BASE });

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
  lat: number;
  lng: number;
  distance: number;
  routes: { co: Co; route: string; dir: 'O' | 'I'; dest: string; companies: Company[] }[];
}

/** 「喺度搭得」一行：呢個位置（40 米內所有公司嘅站）可以搭嘅一條線 */
export interface HereRoute {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  stopId: string;
  stopName: string;
  distance: number;
  etas: { eta: string; company: Company; scheduled: boolean }[];
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
  buses: async (co: Co, route: string, variantId: string) => {
    // 設咗 EXPO_PUBLIC_TRACKER_URL 就先問 tracker（香港 VPS），出錯自動退返網站 /api/buses
    const res = await busesClient.buses(co, route, variantId);
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
    return body as { buses: LiveBus[]; segSeconds: number[]; fetchedAt: string };
  },
  /** 某站到站時間；failed = 攞唔到數據嘅公司（唔好當佢冇車） */
  eta: (co: Co, route: string, stop: string) =>
    get<{ etas: Eta[]; failed?: Company[]; fetchedAt: string }>(`/api/eta?co=${co}&route=${q(route)}&stop=${q(stop)}`),
  /** 喺度搭得：呢個位置可以搭嘅所有路線同下一兩班 */
  here: (lat: number, lng: number) => get<{ routes: HereRoute[]; radius: number }>(`/api/here?lat=${lat}&lng=${lng}`),
  news: (pos: { lat: number; lng: number } | null) => get<{ items: NewsItem[] }>(`/api/news${pos ? `?lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}` : ''}`),
  nearby: (lat: number, lng: number, r = 600) => get<{ stops: NearStop[]; area?: { n: string; en: string | null } | null }>(`/api/nearby?lat=${lat}&lng=${lng}&r=${r}`),
  /** 一個站所有路線嘅下一班 */
  stopEtas: (co: Co, stop: string) =>
    get<{ routes: { route: string; dir: 'O' | 'I'; etas: { eta: string; company: Company; scheduled: boolean }[] }[] }>(
      `/api/stop-etas?co=${co}&stop=${q(stop)}`,
    ),
};

// ---------- 路線資料同日曆嘅快取：開過嘅即刻顯示，背景再更新 ----------

const memRoute = new Map<string, RouteData>();
let memCalendar: Promise<Calendar> | null = null;
const routeKey = (co: Co, route: string) => `hknt.route.v1.${co}.${route.toUpperCase()}`;

/** 手機入面上次嘅路線資料（冇就 null）；記憶體有就唔使讀儲存 */
export async function cachedRoute(co: Co, route: string): Promise<RouteData | null> {
  const k = routeKey(co, route);
  const m = memRoute.get(k);
  if (m) return m;
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as RouteData) : null;
  } catch {
    return null;
  }
}

/** 由網上攞最新路線資料，順手存低 */
export async function freshRoute(co: Co, route: string): Promise<RouteData> {
  const data = await api.route(co, route);
  const k = routeKey(co, route);
  memRoute.set(k, data);
  AsyncStorage.setItem(k, JSON.stringify(data)).catch(() => {
    /* 存唔到都冇所謂 */
  });
  return data;
}

/** 假期日曆：成個 App 開住期間只攞一次 */
export function calendarOnce(): Promise<Calendar> {
  memCalendar ??= api.calendar().catch((e) => {
    memCalendar = null; // 失敗咗下次再試
    throw e;
  });
  return memCalendar;
}
