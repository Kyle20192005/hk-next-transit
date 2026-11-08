/**
 * 網頁、App、tracker 共用嘅 ID 同格式（以前三邊各抄一份）。
 */

/** 路線檔位置：ctb（城巴同聯營線）、kmb（九巴、龍運）、nlb（新大嶼山巴士）、mtrb（港鐵巴士） */
export type Co = 'ctb' | 'kmb' | 'nlb' | 'mtrb';
export const CO_LIST: readonly Co[] = ['ctb', 'kmb', 'nlb', 'mtrb'];
export const isCo = (x: unknown): x is Co => CO_LIST.includes(x as Co);

/** 路線號碼（例如 101、A11、N8P） */
export const SAFE_ROUTE = /^[A-Za-z0-9]{1,6}$/;
/** 站 ID：城巴 6 位數字、九巴 16 位十六進制、新大嶼山巴士數字、港鐵巴士（例如 K76-U010） */
export const SAFE_STOP = /^(\d{1,6}|[0-9A-F]{16}|[A-Z0-9]{1,6}(-[A-Z0-9]{1,3})?-[a-z]?[UD]\d{3}[A-Z]?)$/;
/** 走法 ID */
export const SAFE_VARIANT = /^[A-Za-z0-9-]{1,20}$/;

/** 前端更新頻率同顯示上限（網頁、App 一致） */
export const LIVE_REFRESH = { busesMs: 20_000, etaMs: 30_000, maxEtas: 5 } as const;

const RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/;

/**
 * pipeline 數據檔（GitHub data 分支）嘅實際網址同 headers（網頁 lib/data.ts、tracker src/data.ts 共用）。
 * 私人 repo：有 token 而且係 raw.githubusercontent 網址，就改用 GitHub Contents API（raw 唔一定接受 fine-grained token）。
 */
export function dataFileRequest(base: string, token: string | null | undefined, file: string): { url: string; headers: Record<string, string>; via: 'github-api' | 'url' } {
  const m = base.match(RAW_GITHUB);
  if (token && m) {
    const [, owner, repo, ref] = m;
    return {
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(ref!)}`,
      headers: { Accept: 'application/vnd.github.raw+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      via: 'github-api',
    };
  }
  return { url: `${base}/${file}`, headers: token ? { Authorization: `Bearer ${token}` } : {}, via: 'url' };
}

/** 巴士位置 API 回應 → 前端用嘅格式（到站時間變毫秒） */
export function parseLiveBuses(buses: { from: number; nextEta: string; company?: string; gps?: { lat: number; lng: number }; schedule?: boolean }[]) {
  return buses.map((b) => ({ from: b.from, nextEta: Date.parse(b.nextEta), company: b.company, gps: b.gps, schedule: b.schedule }));
}
