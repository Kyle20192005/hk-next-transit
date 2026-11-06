/**
 * 交通消息（運輸署特別交通消息 + 事故消息）。資料冇座標同地區，所以「附近」用站名判斷：
 * 攞用戶附近（1.5 公里內）巴士站名入面嘅路名、地方名（`placeTokens`），消息內文有提到就當附近。
 */
export interface NewsItem {
  id: string;
  /** 第一句（標題用） */
  title: string;
  text: string;
  /** 港鐵相關 */
  mtr: boolean;
  /** 有巴士改道、暫停等 */
  bus: boolean;
  /** 附近（有提到用戶附近嘅路名、地方名）；冇傳位置時 false */
  nearby: boolean;
  /** 消息時間（ISO，有先有） */
  at?: string;
  /** 已完結（事故消息先有） */
  closed?: boolean;
}

/** 太普通、唔可以用嚟判斷附近嘅字 */
const GENERIC = new Set(['巴士總站', '總站', '巴士站', '公共運輸交匯處', '交匯處', '港鐵站', '碼頭', '廣場', '中心', '大廈', '商場', '花園', '道', '街', '路']);

/** 由站名攞地方名：「海富中心, 夏慤道」→ 海富中心、夏慤道；拎走括號同站號，最少兩個字 */
export function placeTokens(stopNames: string[]): string[] {
  const out = new Set<string>();
  for (const n of stopNames) {
    for (const raw of n.split(/[,，、\-–/]| - /)) {
      const t = raw.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();
      if (t.length >= 2 && !GENERIC.has(t) && !/^\d/.test(t)) out.add(t);
    }
  }
  return [...out];
}

export function mentionsAny(text: string, tokens: string[]): boolean {
  return tokens.some((t) => text.includes(t));
}

/** 標題：第一句（去到第一個「。」），太長截斷 */
export function newsTitle(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const first = flat.split('。')[0] ?? flat;
  return first.length > max ? `${first.slice(0, max)}…` : first;
}

export const isMtrNews = (text: string) => /港鐵|鐵路|綫|輕鐵/.test(text);
export const isBusNews = (text: string) => /巴士/.test(text);

/** 消息分類：全部／附近／港鐵 */
export type NewsFilter = 'all' | 'nearby' | 'mtr';
export const filterNews = (items: NewsItem[], f: NewsFilter) => (f === 'nearby' ? items.filter((n) => n.nearby) : f === 'mtr' ? items.filter((n) => n.mtr) : items);

/** 首頁「常用工具」：可以揀邊幾個（最多 4 個），網頁同 App 共用 */
export type ToolId = 'routes' | 'nearby' | 'favs' | 'news' | 'nav' | 'settings';
export const TOOLS: { id: ToolId; label: string; icon: 'route' | 'pin' | 'star' | 'warning' | 'navigate' | 'settings'; color: string; soon?: boolean }[] = [
  { id: 'routes', label: '搵路線', icon: 'route', color: '#E89A00' },
  { id: 'nearby', label: '附近車站', icon: 'pin', color: '#2F6FD6' },
  { id: 'favs', label: '收藏', icon: 'star', color: '#F2A900' },
  { id: 'news', label: '交通消息', icon: 'warning', color: '#D7282F' },
  { id: 'nav', label: '導航', icon: 'navigate', color: '#7B4FD6', soon: true },
  { id: 'settings', label: '設定', icon: 'settings', color: '#5E6B7A' },
];
export const DEFAULT_TOOLS: ToolId[] = ['routes', 'nearby', 'favs', 'news'];
export const MAX_TOOLS = 4;
/** 讀返嚟嘅設定：剔走唔認得嘅，空就用預設 */
export function cleanTools(raw: unknown): ToolId[] {
  const ok = Array.isArray(raw) ? raw.filter((t): t is ToolId => TOOLS.some((x) => x.id === t)) : [];
  return ok.length ? ok.slice(0, MAX_TOOLS) : DEFAULT_TOOLS;
}
/** 揀／唔揀一個工具（最多 4 個，最少 1 個） */
export function toggleTool(tools: ToolId[], id: ToolId): ToolId[] {
  const next = tools.includes(id) ? tools.filter((t) => t !== id) : tools.length < MAX_TOOLS ? [...tools, id] : tools;
  return next.length ? next : tools;
}
