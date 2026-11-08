/**
 * 巴士位置用邊個後端（網頁同 App 共用）：設咗 tracker 網址就先問 tracker（香港 VPS，所有人共用同一份上游請求），
 * 佢冇回應、出錯或者超時就退返原本嘅 `/api/buses`（Vercel），而且之後 `downMs` 內直接用後備，唔再等 tracker。
 * 兩邊回應格式一樣（docs/realtime-backend.md 階段 1a）。
 */
export const busesPath = (co: string, route: string, variantId: string) =>
  `/api/buses?co=${co}&route=${encodeURIComponent(route)}&v=${encodeURIComponent(variantId)}`;

export function createBusesClient(opts: {
  /** tracker 網址（例如 https://rt.example.com）；冇就淨係用後備 */
  trackerBase: string | null | undefined;
  /** 後備網址前綴（網頁 ''＝同一個網站；App = API_BASE） */
  fallbackBase: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  downMs?: number;
  now?: () => number;
}) {
  const f = opts.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const tracker = opts.trackerBase?.replace(/\/+$/, '') || null;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const downMs = opts.downMs ?? 60_000;
  const now = opts.now ?? Date.now;
  let downUntil = 0;

  async function viaTracker(path: string): Promise<Response | null> {
    if (!tracker || now() < downUntil) return null;
    // AbortSignal.timeout 唔係個個平台都有（React Native），自己做
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await f(`${tracker}${path}`, { signal: ctl.signal });
      if (res.ok) return res;
      if (res.status >= 500) downUntil = now() + downMs;
      return null; // 4xx（例如數據版本未同步）：今次用後備，唔當佢死咗
    } catch {
      downUntil = now() + downMs;
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    /** 攞巴士位置；回傳 Response（同 fetch 一樣用） */
    async buses(co: string, route: string, variantId: string): Promise<Response> {
      const path = busesPath(co, route, variantId);
      return (await viaTracker(path)) ?? f(`${opts.fallbackBase}${path}`);
    },
    /** 而家係咪用緊 tracker（除錯用） */
    usingTracker: () => Boolean(tracker) && now() >= downUntil,
  };
}
