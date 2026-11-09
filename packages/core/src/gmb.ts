import type { Co } from './ids';
import { toHkIso } from './mtrb';
import type { Dir, Eta, RouteData, Variant } from './types';

/**
 * 專線小巴（綠色小巴，co gmb、公司 GMB）。
 *
 * - 路線檔名 = 「地區-號碼」（NT-2、KLN-25MS、HKI-4A）：同一個號碼可以喺三個地區都有（2、3、12…），
 *   營辦商 route_id 又會因為重組而改（NT 78：2003702 → 2011655），所以收藏、最近睇過、網址一律用地區 + 號碼。
 * - 一個走法 = 一個 (route_id, route_seq)，`variant.gmb` 記住；`dir` 已經按主走法定好方向。
 * - 到站：`GET /eta/stop/{站 ID}` 一次攞晒呢個站所有專線小巴路線。「未開出」= 時間表時間（scheduled）；
 *   500 + 「ETA unavailable」= 呢個站冇到站服務，當冇車，唔當出錯。冇 GPS、冇車輛編號。
 */

export const GMB_BASE = 'https://data.etagmb.gov.hk';

/** 運輸署分區：港島、九龍、新界 */
export type GmbRegion = 'HKI' | 'KLN' | 'NT';
export const GMB_REGIONS: readonly GmbRegion[] = ['HKI', 'KLN', 'NT'];
/** 介面顯示嘅地區名（地區標籤、篩選） */
export const GMB_REGION_NAME: Record<GmbRegion, string> = { HKI: '港島', KLN: '九龍', NT: '新界' };

/** 地區 + 號碼 → 路線檔名（NT + 2 → NT-2） */
export const gmbKey = (region: GmbRegion, code: string): string => `${region}-${code.toUpperCase()}`;

const GMB_KEY = /^(HKI|KLN|NT)-([A-Z0-9]{1,5})$/i;

/** 路線檔名 → 地區同號碼（唔係專線小巴格式就 null）；一律轉大楷 */
export function parseGmbKey(route: string): { region: GmbRegion; code: string } | null {
  const m = GMB_KEY.exec(route);
  return m ? { region: m[1]!.toUpperCase() as GmbRegion, code: m[2]!.toUpperCase() } : null;
}

/** 顯示用號碼：專線小巴拎走地區（NT-2 → 2），其他公司原樣 */
export function routeCode(co: Co | string | undefined, route: string): string {
  return co === 'gmb' ? (parseGmbKey(route)?.code ?? route) : route;
}

/** 專線小巴嘅地區（其他公司 null） */
export function routeRegion(co: Co | string | undefined, route: string): GmbRegion | null {
  return co === 'gmb' ? (parseGmbKey(route)?.region ?? null) : null;
}

/** 路線屬「路線」分頁邊個分類：gmb → 'minibus'，其他 → 'bus' */
export function routeMode(co: Co | string | undefined): 'bus' | 'minibus' {
  return co === 'gmb' ? 'minibus' : 'bus';
}

/** 路線標題（分享、無障礙標籤、收藏分組）：專線小巴「2（新界）」（路線檔名 NT-2 唔好俾用戶見），其他公司原樣 */
export function routeTitle(co: Co | string | undefined, route: string): string {
  const region = routeRegion(co, route);
  return region ? `${routeCode(co, route)}（${GMB_REGION_NAME[region]}）` : route;
}

/** 說明文字講「小巴」定「巴士」（公司代碼；專線小巴 = 小巴，其他包括唔認得嘅 = 巴士） */
export function vehicleNoun(company: string | undefined): '小巴' | '巴士' {
  return company === 'GMB' ? '小巴' : '巴士';
}

/**
 * 路線頁標題「往 X」（同時用喺收藏、最近睇過、分享）：一般用走法最後一個站（lastStopName）。
 * 專線小巴用路線嘅起訖點（O = destTc、I = origTc；營辦商名，同路線列表、到站時間一樣，例如「鰂魚涌(船塢里)(循環線)」）：
 * 循環線重複嘅站只留第一次，最後一個站唔係真正終點。特別班（短程等）終點唔同，先用返最後一個站（循環線除外）。
 */
export function routeHeadDest(
  co: Co | string | undefined,
  data: Pick<RouteData, 'origTc' | 'destTc'>,
  dir: Dir,
  v: Pick<Variant, 'special' | 'name'> | null | undefined,
  lastStopName: string | undefined,
): string | undefined {
  if (co !== 'gmb' || !v || (v.special && !/循環線/.test(v.name))) return lastStopName;
  return (dir === 'O' ? data.destTc : data.origTc) || lastStopName;
}

/**
 * 走法最後一個站係咪終點站（唔上得車：唔顯示車費、尾班車、收藏，「最近」唔揀佢）。
 * 專線小巴循環線重複嘅站只留第一次，最後一個站之後仲要返總站（上得車，pipeline 有車費），所以有車費就唔係；
 * 其他公司一律係。
 */
export function lastStopIsTerminus(co: Co | string | undefined, v: Pick<Variant, 'fares'> | null | undefined, lastStopId: string | undefined): boolean {
  return !(co === 'gmb' && lastStopId !== undefined && v?.fares?.[lastStopId] !== undefined);
}

/**
 * 舊版 App（未識 GMB，CompanyTag 會 throw）兼容：/api/routes、/api/nearby、/api/here、/api/stop-etas
 * 要 query 有 `gmb=1` 先出專線小巴；新版網頁（client fetch）同 App 一律加。
 * （/api/stop-search 唔用呢個，用 `mode=minibus`；冇 mode = 只有巴士）
 */
export const GMB_OPT_IN = 'gmb=1';

/** 請求有冇講明識專線小巴（`gmb=1`） */
export function gmbOptIn(params: { get(name: string): string | null }): boolean {
  return params.get('gmb') === '1';
}

/** 網址加 `gmb=1`（已經有就唔再加） */
export function withGmbOptIn(url: string): string {
  if (/[?&]gmb=1(?:&|#|$)/.test(url)) return url;
  const hash = url.indexOf('#');
  const [base, frag] = hash < 0 ? [url, ''] : [url.slice(0, hash), url.slice(hash)];
  return `${base}${base.includes('?') ? '&' : '?'}${GMB_OPT_IN}${frag}`;
}

/** 一個站、一個 (route_id, route_seq) 嘅到站時間（/eta/stop 每項） */
export interface GmbStopEta {
  routeId: string;
  routeSeq: number;
  /** 呢個站喺嗰個走法嘅站序（循環線同一個站會出兩次，seq 唔同） */
  stopSeq: number;
  etas: { at: string; remarkTc: string; remarkEn: string; scheduled: boolean }[];
}

interface GmbEtaRaw {
  timestamp?: string | null;
  remarks_tc?: string | null;
  remarks_en?: string | null;
}
interface GmbStopRaw {
  route_id?: number | string;
  route_seq?: number | string;
  stop_seq?: number | string;
  enabled?: boolean;
  eta?: GmbEtaRaw[] | null;
}

/** 同一個位置相差幾耐內嘅兩班當係同一架車（營辦商間中出兩個幾秒之差嘅時間） */
const DUP_MS = 20_000;

/**
 * /eta/stop/{id} 回應 → GmbStopEta[]。
 * 時間轉香港時間 ISO（toHkIso，冇毫秒）；同一項入面 20 秒內重複嘅班次去重（有實時嘅留實時）。
 * `enabled: false`（呢個站暫停到站服務）當冇班次。
 */
export function parseGmbStopEta(body: unknown): GmbStopEta[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return (data as GmbStopRaw[]).flatMap((item): GmbStopEta[] => {
    const routeId = item.route_id == null ? '' : String(item.route_id);
    const routeSeq = Number(item.route_seq);
    const stopSeq = Number(item.stop_seq);
    if (!routeId || !Number.isFinite(routeSeq) || !Number.isFinite(stopSeq)) return [];
    const raw = item.enabled === false ? [] : (item.eta ?? []);
    const parsed = raw
      .map((e) => {
        const ms = e.timestamp ? Date.parse(e.timestamp) : NaN;
        const remarkTc = e.remarks_tc ?? '';
        const remarkEn = e.remarks_en ?? '';
        // 「未開出」= 時間表時間；null = 實時；「行車受阻」都係實時，保留備註
        const scheduled = remarkEn === 'Scheduled' || remarkTc === '未開出';
        return { ms, remarkTc, remarkEn, scheduled };
      })
      .filter((e) => Number.isFinite(e.ms))
      .sort((a, b) => a.ms - b.ms);
    const kept: typeof parsed = [];
    for (const e of parsed) {
      const last = kept[kept.length - 1];
      if (last && e.ms - last.ms <= DUP_MS) {
        // 同一架車：有實時就用實時嗰個
        if (last.scheduled && !e.scheduled) kept[kept.length - 1] = e;
        continue;
      }
      kept.push(e);
    }
    return [
      {
        routeId,
        routeSeq,
        stopSeq,
        etas: kept.map((e) => ({ at: toHkIso(e.ms), remarkTc: e.remarkTc, remarkEn: e.remarkEn, scheduled: e.scheduled })),
      },
    ];
  });
}

/**
 * GET /eta/stop/{stopId}：呢個站所有專線小巴路線嘅到站時間。
 * 404、或者 500 + 「ETA unavailable」→ []（呢個站冇到站服務，唔當出錯）；其他非 2xx throw。
 */
export async function fetchGmbStopEta(stopId: string, fetcher: typeof fetch = fetch): Promise<GmbStopEta[]> {
  const res = await fetcher(`${GMB_BASE}/eta/stop/${encodeURIComponent(stopId)}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = res.status === 500 ? await res.text().catch(() => '') : '';
    if (text.includes('ETA unavailable')) return [];
    throw new Error(`專線小巴 ETA ${res.status}`);
  }
  return parseGmbStopEta(await res.json());
}

/**
 * 一個站、幾條專線小巴路線（路線檔）嘅 Eta：一次 /eta/stop 攞晒，按 (routeId, routeSeq) 對走法。
 * 同一走法經過呢個站兩次（循環線）：用 expSeq 嗰個 stop_seq（即係第一次經過；對唔到就用最細嗰個），
 * 第二次經過嘅班次唔要。走法係營辦商指明，一定 certain。路線檔冇嘅 route_id 唔理。
 */
export async function gmbEtas(stopId: string, routes: readonly RouteData[], fetcher: typeof fetch = fetch): Promise<Eta[]> {
  // (routeId:routeSeq) → 經過呢個站嘅走法
  const passing = new Map<string, { data: RouteData; v: Variant; dir: Dir; seq: number | undefined }>();
  for (const data of routes) {
    for (const v of data.variants) {
      if (!v.gmb) continue;
      const key = Object.keys(v.expSeq).find((k) => k.slice(2) === stopId);
      if (!key) continue;
      passing.set(`${v.gmb.routeId}:${v.gmb.routeSeq}`, { data, v, dir: key[0] as Dir, seq: v.expSeq[key] });
    }
  }
  if (passing.size === 0) return [];

  const items = await fetchGmbStopEta(stopId, fetcher);
  const byKey = new Map<string, GmbStopEta[]>();
  for (const it of items) {
    const k = `${it.routeId}:${it.routeSeq}`;
    if (passing.has(k)) byKey.set(k, [...(byKey.get(k) ?? []), it]);
  }

  const out: Eta[] = [];
  for (const [k, list] of byKey) {
    const p = passing.get(k)!;
    const item = list.find((x) => x.stopSeq === p.seq) ?? list.reduce((a, b) => (b.stopSeq < a.stopSeq ? b : a));
    const { data, v, dir } = p;
    for (const x of item.etas) {
      out.push({
        company: 'GMB',
        route: data.route,
        dir,
        stopId,
        eta: x.at,
        seq: item.stopSeq,
        destTc: (dir === 'O' ? data.destTc : data.origTc) ?? '',
        destEn: (dir === 'O' ? data.destEn : data.origEn) ?? '',
        remarkTc: x.remarkTc,
        remarkEn: x.remarkEn,
        scheduled: x.scheduled,
        variant: { variantId: v.id, name: v.name, special: v.special, confidence: 'certain', reason: '營辦商資料指明走法' },
      });
    }
  }
  return out.sort((a, b) => (a.eta ?? '').localeCompare(b.eta ?? ''));
}
