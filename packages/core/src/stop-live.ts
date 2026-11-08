import { fetchCtbEta } from './ctb';
import { etasAtStop } from './eta';
import type { Co } from './ids';
import { fetchKmbStopEta } from './kmb';
import type { Company, Eta, RouteData, RouteIndex } from './types';

/**
 * 「一個站所有路線嘅下一兩班」同「喺度搭得」（/api/stop-etas、/api/here）：Vercel 同 tracker 共用。
 * 數據點攞（路線檔、索引、站點）同 fetch 由呼叫嗰邊提供。
 */

/** 統一站點索引項目（out/stops.json）：r = [路線檔位置, 路線, 方向, 往邊度] */
export interface AnyStopEntry {
  id: string;
  co: Co;
  n: string;
  lat: number;
  lng: number;
  r: [co: Co, route: string, dir: 'O' | 'I', destTc: string][];
}

export interface StopLiveDeps {
  getRoute: (co: Co, route: string) => Promise<RouteData | null>;
  getIndex: () => Promise<RouteIndex>;
  getAllStops: () => Promise<AnyStopEntry[]>;
  fetcher: typeof fetch;
}

export interface StopRouteEtas {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  etas: { eta: string; company: Company; scheduled: boolean; remark: string }[];
}

/**
 * 一個站所有經過嘅路線同下一兩班車：
 * - 九巴站：九巴有「一個站所有路線」嘅 API，一次 call 攞晒
 * - 城巴站：要逐條路線 call；聯營線合併埋九巴嘅車
 * - 新大嶼山、港鐵巴士：逐條路線用路線檔查
 */
export async function routesAtStop(entry: AnyStopEntry, deps: StopLiveDeps, now = Date.now()): Promise<StopRouteEtas[]> {
  const { co, id: stop } = entry;
  const { fetcher } = deps;
  let etasFor: (route: string, dir: string) => Eta[];
  const routesHere = [...new Set(entry.r.map(([, route]) => route))];

  if (co === 'nlb' || co === 'mtrb') {
    // 走法明確，唔使時間表
    const lists = await Promise.all(
      routesHere.map(async (route) => {
        const data = await deps.getRoute(co, route);
        return [route, data ? await etasAtStop(data, stop, {}, fetcher).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  } else if (co === 'kmb') {
    const all = await fetchKmbStopEta(stop, fetcher).catch(() => []);
    etasFor = (route, dir) => all.filter((e) => e.route === route && e.dir === dir);
  } else {
    const index = await deps.getIndex();
    const joint = new Set(index.routes.filter((r) => (r.co ?? 'ctb') === 'ctb' && (r.companies?.length ?? 1) > 1).map((r) => r.route));
    const lists = await Promise.all(
      routesHere.map(async (route) => {
        if (!joint.has(route)) return [route, await fetchCtbEta(stop, route, fetcher).catch(() => [])] as const;
        const data = await deps.getRoute('ctb', route);
        // 附近列表唔使推斷走法，所以唔使時間表（calendar 傳空）
        return [route, data ? await etasAtStop(data, stop, {}, fetcher).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  }

  return entry.r.map(([rco, route, dir, dest]) => ({
    co: rco,
    route,
    dir,
    dest,
    etas: etasFor(route, dir)
      .filter((e) => e.eta && Date.parse(e.eta) >= now - 60_000)
      .sort((a, b) => Date.parse(a.eta!) - Date.parse(b.eta!))
      .slice(0, 3)
      .map((e) => ({ eta: e.eta!, company: e.company, scheduled: e.scheduled ?? false, remark: e.remarkTc })),
  }));
}

/** 一個站所有路線（/api/stop-etas 回應）；搵唔到站回傳 null */
export async function stopEtas(co: Co, stop: string, deps: StopLiveDeps, now = Date.now()) {
  const entry = (await deps.getAllStops()).find((s) => s.id === stop && s.co === co);
  if (!entry) return null;
  const routes = await routesAtStop(entry, deps, now);
  return { stop, co, name: entry.n, fetchedAt: new Date(now).toISOString(), routes };
}

/** 幾多米內當係「同一個位置」：城巴、九巴同一個站頭通常係兩個站 ID，有時隔幾步 */
export const HERE_DEFAULT_R = 40;
const HERE_MAX_R = 80;
/** 最多合併幾多個站（避免繁忙路口 call 太多） */
const HERE_MAX_STOPS = 6;

const metres = (lat1: number, lng1: number, lat2: number, lng2: number) =>
  Math.hypot((lat1 - lat2) * 111320, (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180));

export const inHongKong = (lat: number, lng: number) => lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5;

/**
 * 「喺度搭得」（/api/here 回應）：呢個位置 r 米內所有公司嘅站可以搭嘅路線同下一兩班車。
 * 同一條線（公司＋號碼＋方向）喺幾個站都有，只留最近嗰個站。按下一班排先後，冇班次排最後。
 */
export async function hereRoutes(lat: number, lng: number, rParam: number | null, deps: StopLiveDeps, now = Date.now()) {
  const r = Math.min(HERE_MAX_R, Math.max(10, rParam || HERE_DEFAULT_R));
  const [all, index] = await Promise.all([deps.getAllStops(), deps.getIndex()]);
  const companiesOf = new Map(index.routes.map((x) => [`${x.co ?? 'ctb'}/${x.route}`, x.companies ?? ['CTB']]));
  const stops = all
    .map((s) => ({ s, d: Math.round(metres(lat, lng, s.lat, s.lng)) }))
    .filter((x) => x.d <= r)
    .sort((a, b) => a.d - b.d)
    .slice(0, HERE_MAX_STOPS);

  const perStop = await Promise.all(stops.map(({ s }) => routesAtStop(s, deps, now).catch(() => [])));

  // 合併：同一條線同一個方向只留最近嘅站（stops 已經由近到遠）
  const seen = new Map<string, StopRouteEtas & { companies: Company[]; stopId: string; stopCo: Co; stopName: string; distance: number }>();
  perStop.forEach((list, i) => {
    const { s, d } = stops[i]!;
    for (const x of list) {
      const key = `${x.co}/${x.route}/${x.dir}`;
      if (!seen.has(key)) seen.set(key, { ...x, companies: (companiesOf.get(`${x.co}/${x.route}`) ?? []) as Company[], stopId: s.id, stopCo: s.co, stopName: s.n, distance: d });
    }
  });
  const next = (x: { etas: { eta: string }[] }) => (x.etas[0] ? Date.parse(x.etas[0].eta) : Infinity);
  const routes = [...seen.values()].sort((a, b) => next(a) - next(b) || a.route.localeCompare(b.route, 'en', { numeric: true }));

  return {
    fetchedAt: new Date(now).toISOString(),
    radius: r,
    stops: stops.map(({ s, d }) => ({ id: s.id, co: s.co, name: s.n, distance: d })),
    routes,
  };
}
