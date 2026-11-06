import { COMPANIES } from './company';
import type { Company } from './types';

/**
 * 首頁「附近」嘅到站卡（似港鐵 App「下班車」）：一張卡 = 一個站頭，每行 = 一班車。
 * 結構通用：將來港鐵、小巴、渡輪、電車都用同一款卡（左邊色條 + 標籤 + 往邊 + 幾多分鐘），只係資料來源唔同。
 */
export interface DepartureRow {
  key: string;
  /** 左邊標籤：巴士 = 路線號碼（公司色）；港鐵將來 = 綫名（綫色） */
  badge: { text: string; bg: string; ink: string };
  dest: string;
  /** 到站時間（毫秒）；null = 冇時間（例如只收藏咗路線、冇收藏站） */
  at: number | null;
  /** 原定班次（時間表，唔係實時） */
  scheduled?: boolean;
  /** 收藏咗嘅站暫時冇班次（at = null 但唔係淨係收藏路線） */
  noService?: boolean;
  /** 港鐵月台（將來用） */
  platform?: string;
  /** 撳落去開邊度 */
  link: { co: string; route: string; dir: 'O' | 'I'; stop?: string };
}

/** 一個站頭：幾間公司喺附近（40 米內）嘅站併埋 */
export interface StopHead<S> {
  key: string;
  name: string;
  lat: number;
  lng: number;
  /** 同用戶距離（米），用最近嗰個站 */
  distance: number;
  stops: S[];
}

const metres = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/** 將附近嘅站（按距離排好）併成站頭：同第一個站相距 radius 米內嘅歸入同一個站頭 */
export function groupStopHeads<S extends { id: string; co: string; name: string; lat: number; lng: number; distance: number }>(stops: S[], radius = 40): StopHead<S>[] {
  const heads: StopHead<S>[] = [];
  for (const s of stops) {
    const h = heads.find((x) => metres(x.lat, x.lng, s.lat, s.lng) <= radius);
    if (h) h.stops.push(s);
    else heads.push({ key: `${s.co}-${s.id}`, name: s.name, lat: s.lat, lng: s.lng, distance: s.distance, stops: [s] });
  }
  return heads;
}

/** `/api/here` 每條線嘅格式（巴士） */
export interface HereRouteLike {
  co: string;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  stopId: string;
  etas: { eta: string; company: Company; scheduled: boolean }[];
}

/**
 * 巴士站頭嘅行：每條線（同方向）只出最快一班，按到站時間排，最多 limit 行；已經開走嘅唔要。
 * 標籤用嗰班車公司嘅顏色（聯營線每班車可以係唔同公司）。
 */
export function busDepartureRows(routes: HereRouteLike[], now: number, limit = 4): DepartureRow[] {
  const rows: DepartureRow[] = [];
  for (const r of routes) {
    const e = r.etas.find((x) => Date.parse(x.eta) >= now - 30_000);
    if (!e) continue;
    const c = COMPANIES[e.company] ?? COMPANIES[r.companies[0] ?? 'CTB'];
    rows.push({
      key: `${r.co}-${r.route}-${r.dir}`,
      badge: { text: r.route, bg: c.bg, ink: c.ink },
      dest: r.dest,
      at: Date.parse(e.eta),
      scheduled: e.scheduled,
      link: { co: r.co, route: r.route, dir: r.dir, stop: r.stopId },
    });
  }
  return rows.sort(byTime).slice(0, limit);
}

const byTime = (a: DepartureRow, b: DepartureRow) => (a.at ?? Infinity) - (b.at ?? Infinity);

/** 「2 分鐘」／「即將」；冇時間就空白 */
export function minutesLabel(at: number | null, now: number): string {
  if (at === null) return '';
  const m = Math.max(0, Math.round((at - now) / 60000));
  return m === 0 ? '即將' : `${m} 分鐘`;
}

/** 收藏（同網頁、App 嘅 Favorite 格式一樣） */
export interface FavLike {
  co: string;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  stopId?: string;
  stopName?: string;
}

export interface FavGroup<F> {
  key: string;
  /** 站名；只收藏路線嘅一組係「收藏路線」 */
  name: string;
  /** 呢組係收藏咗嘅站（有到站時間） */
  isStop: boolean;
  favs: F[];
}

/**
 * 首頁「收藏」分頁嘅卡：收藏咗嘅站按站分組（一個站一張卡，次序跟收藏次序），
 * 淨係收藏咗路線（冇站）嘅另外一張「收藏路線」放最後。
 */
export function groupFavorites<F extends FavLike>(favs: F[]): FavGroup<F>[] {
  const groups: FavGroup<F>[] = [];
  for (const f of favs) {
    if (!f.stopId) continue;
    const key = `${f.co}-${f.stopId}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.favs.push(f);
    else groups.push({ key, name: f.stopName ?? f.stopId, isStop: true, favs: [f] });
  }
  const routes = favs.filter((f) => !f.stopId);
  if (routes.length) groups.push({ key: 'routes', name: '收藏路線', isStop: false, favs: routes });
  return groups;
}

/** 收藏卡嘅行：每個收藏一行，有到站時間嘅按時間排先；etas 係嗰個收藏嘅班次（同方向） */
export function favDepartureRows<F extends FavLike>(items: { fav: F; etas: { eta: string | null; company: Company; scheduled?: boolean }[] | null }[], now: number): DepartureRow[] {
  return items
    .map(({ fav, etas }) => {
      const e = etas?.find((x) => x.eta && Date.parse(x.eta) >= now - 30_000);
      const c = COMPANIES[e?.company ?? fav.companies[0] ?? 'CTB'] ?? COMPANIES.CTB;
      return {
        key: `${fav.co}-${fav.route}-${fav.dir}-${fav.stopId ?? ''}`,
        badge: { text: fav.route, bg: c.bg, ink: c.ink },
        dest: fav.dest,
        at: e?.eta ? Date.parse(e.eta) : null,
        scheduled: e?.scheduled,
        noService: !!fav.stopId && !e,
        link: { co: fav.co, route: fav.route, dir: fav.dir, stop: fav.stopId },
      } satisfies DepartureRow;
    })
    .sort(byTime);
}
