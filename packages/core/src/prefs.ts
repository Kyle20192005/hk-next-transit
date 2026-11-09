import { TRANSPORT_MODES, type TransportMode } from './transport';

/**
 * 用戶設定（設定頁），網頁存 localStorage、App 存 AsyncStorage，同一個格式（`hknt.prefs`）。
 * 每項都要真係有作用，唔好加淨係擺樣嘅設定。
 */
export interface Prefs {
  /** 外觀：跟系統／淺色／深色 */
  theme: 'system' | 'light' | 'dark';
  /** 交通工具優先：「路線」分頁預設同交通工具次序；港鐵到站做好之後首頁下班車先顯示 */
  priority: 'bus' | 'rail';
  /** 到站時間：剩幾多分鐘，定實際鐘數 */
  etaFormat: 'minutes' | 'clock';
  /** 附近車站範圍（米） */
  nearbyRadius: 300 | 600 | 1000;
  /** 首頁大卡打開時揀邊個分頁 */
  homeCard: 'last' | 'next' | 'favs';
  /** 開首頁、路線頁自動定位 */
  autoLocate: boolean;
  /** 輕鐵站面板：按月台（似車站顯示屏）定按路線（每條路線、每個方向一組）；面板頂切換都會記住 */
  lrtGroup: 'platform' | 'route';
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', priority: 'bus', etaFormat: 'minutes', nearbyRadius: 600, homeCard: 'last', autoLocate: true, lrtGroup: 'platform' };
export const PREFS_KEY = 'hknt.prefs';
export const NEARBY_RADII = [300, 600, 1000] as const;

/** 「600 米」／「1 公里」 */
export const radiusLabel = (m: number) => (m >= 1000 ? `${m / 1000} 公里` : `${m} 米`);

/** 讀返嚟嘅設定：唔認得嘅值用預設 */
export function cleanPrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof Prefs>(k: K, ok: readonly Prefs[K][]): Prefs[K] => (ok.includes(r[k] as Prefs[K]) ? (r[k] as Prefs[K]) : DEFAULT_PREFS[k]);
  return {
    theme: pick('theme', ['system', 'light', 'dark']),
    priority: pick('priority', ['bus', 'rail']),
    etaFormat: pick('etaFormat', ['minutes', 'clock']),
    nearbyRadius: pick('nearbyRadius', NEARBY_RADII),
    homeCard: pick('homeCard', ['last', 'next', 'favs']),
    autoLocate: typeof r.autoLocate === 'boolean' ? r.autoLocate : DEFAULT_PREFS.autoLocate,
    lrtGroup: pick('lrtGroup', ['platform', 'route']),
  };
}

/** 交通工具次序：優先嗰款排第一（「路線」分頁頂嘅分類） */
export function orderedModes(priority: Prefs['priority']) {
  const first: TransportMode = priority === 'rail' ? 'rail' : 'bus';
  return [...TRANSPORT_MODES.filter((m) => m.id === first), ...TRANSPORT_MODES.filter((m) => m.id !== first)];
}

/** 香港時間 HH:MM */
export function hkClock(ms: number): string {
  const d = new Date(ms + 8 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 香港時間 HH:MM:SS（「最後更新」） */
export function hkClockSec(ms: number): string {
  return `${hkClock(ms)}:${String(new Date(ms).getUTCSeconds()).padStart(2, '0')}`;
}

/**
 * 一班車嘅到站時間點顯示：main = 大字，unit = 細字單位。
 * minutes：「5」+「分」，0 分鐘 =「即將」；clock：「18:32」（0 分鐘都係「即將」）。
 */
export function etaParts(at: number, now: number, fmt: Prefs['etaFormat'], unit = '分'): { main: string; unit: string } {
  const m = Math.max(0, Math.round((at - now) / 60000));
  if (m === 0) return { main: '即將', unit: '' };
  return fmt === 'clock' ? { main: hkClock(at), unit: '' } : { main: String(m), unit };
}

/** 後面幾班：minutes「12、20 分」，clock「18:40、18:52」 */
export function etaRest(ats: number[], now: number, fmt: Prefs['etaFormat']): string {
  if (!ats.length) return '';
  if (fmt === 'clock') return ats.map(hkClock).join('、');
  return `${ats.map((a) => Math.max(0, Math.round((a - now) / 60000))).join('、')} 分`;
}
