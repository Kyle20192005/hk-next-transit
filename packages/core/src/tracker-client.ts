/**
 * 實時數據（巴士位置、某站到站時間）用邊個後端（網頁同 App 共用）：設咗 tracker 網址就先問 tracker（香港 VPS，所有人共用同一份上游請求），
 * 佢出錯或者超時就退返原本嘅 `/api/buses`（Vercel）；連唔到或者 5xx 先當佢死咗，之後 `downMs` 內直接用後備。
 * 超時唔算死：tracker 第一次計一條線要幾秒，之後有快照就即刻有。
 * 兩邊回應格式一樣（docs/realtime-backend.md 階段 1a）。
 */
export const busesPath = (co: string, route: string, variantId: string) =>
  `/api/buses?co=${co}&route=${encodeURIComponent(route)}&v=${encodeURIComponent(variantId)}`;

export const etaPath = (co: string, route: string, stopId: string) =>
  `/api/eta?co=${co}&route=${encodeURIComponent(route)}&stop=${encodeURIComponent(stopId)}`;

export function createLiveClient(opts: {
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
      // 超時（tracker 第一次計一條長線要幾秒）：今次用後備，但唔當佢死咗，下次照問（嗰陣 tracker 已經計好）
      if (!ctl.signal.aborted) downUntil = now() + downMs;
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  const get = async (path: string): Promise<Response> => (await viaTracker(path)) ?? f(`${opts.fallbackBase}${path}`);

  return {
    /** 成條線嘅巴士位置；回傳 Response（同 fetch 一樣用） */
    buses: (co: string, route: string, variantId: string) => get(busesPath(co, route, variantId)),
    /** 某路線喺某站嘅到站時間（tracker 追蹤緊呢條線就直接用佢 cache 住嘅，唔使再問巴士公司） */
    eta: (co: string, route: string, stopId: string) => get(etaPath(co, route, stopId)),
    /** 而家係咪用緊 tracker（除錯用） */
    usingTracker: () => Boolean(tracker) && now() >= downUntil,
  };
}

/** 舊名 */
export const createBusesClient = createLiveClient;
