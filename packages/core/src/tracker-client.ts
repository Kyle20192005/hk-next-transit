/**
 * 實時數據（巴士位置、某站到站時間）用邊個後端（網頁同 App 共用）：設咗 tracker 網址就先問 tracker（香港 VPS，所有人共用同一份上游請求），
 * tracker 1.5 秒未覆就同時問後備（Vercel 同名 API），邊個先返用邊個；出錯即刻用後備。
 * 連唔到或者 5xx 先當佢死咗，之後 `downMs` 內直接用後備。慢唔算死：tracker 第一次計一條冷門線要幾秒，之後有快照就即刻有。
 * 兩邊回應格式一樣（docs/realtime-backend.md 階段 1a）。
 */
export const busesPath = (co: string, route: string, variantId: string) =>
  `/api/buses?co=${co}&route=${encodeURIComponent(route)}&v=${encodeURIComponent(variantId)}`;

/**
 * 「一個站所有路線」同「喺度搭得、首頁下班車」要唔要經 tracker。
 * 2026-11-08 實測：首頁一次問 8 個站頭，中環一個位置要成 90 個上游請求；tracker UPSTREAM_RPS=8 頂唔順，
 * 結果兩邊都做一次（浪費一倍）。量完 data.gov.hk 上限、調高 UPSTREAM_RPS 之後先改 true（tracker 已經有呢兩個 API）。
 */
export const AREA_ETAS_VIA_TRACKER = false;

export const etaPath = (co: string, route: string, stopId: string) =>
  `/api/eta?co=${co}&route=${encodeURIComponent(route)}&stop=${encodeURIComponent(stopId)}`;

export function createLiveClient(opts: {
  /** tracker 網址（例如 https://rt.example.com）；冇就淨係用後備 */
  trackerBase: string | null | undefined;
  /** 後備網址前綴（網頁 ''＝同一個網站；App = API_BASE） */
  fallbackBase: string;
  fetcher?: typeof fetch;
  /** tracker 幾耐未覆就同時問後備（邊個先返用邊個）；tracker 第一次計一條冷門線要幾秒 */
  hedgeMs?: number;
  /** tracker 最多等幾耐 */
  timeoutMs?: number;
  downMs?: number;
  now?: () => number;
  /** 覆蓋 AREA_ETAS_VIA_TRACKER（測試用） */
  areaViaTracker?: boolean;
}) {
  const f = opts.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const tracker = opts.trackerBase?.replace(/\/+$/, '') || null;
  const hedgeMs = opts.hedgeMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const downMs = opts.downMs ?? 60_000;
  const now = opts.now ?? Date.now;
  let downUntil = 0;

  /** 問 tracker：成功回傳 Response；出錯／超時回傳 null（連唔到或 5xx 先當佢死咗） */
  async function viaTracker(path: string): Promise<Response | null> {
    // AbortSignal.timeout 唔係個個平台都有（React Native），自己做
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await f(`${tracker}${path}`, { signal: ctl.signal });
      if (res.ok) return res;
      // 503 = tracker 忙（低優先請求排唔到）；4xx（例如數據版本未同步）：今次用後備，唔當佢死咗
      if (res.status >= 500 && res.status !== 503) downUntil = now() + downMs;
      return null;
    } catch {
      if (!ctl.signal.aborted) downUntil = now() + downMs;
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function get(path: string): Promise<Response> {
    const fallback = () => f(`${opts.fallbackBase}${path}`);
    if (!tracker || now() < downUntil) return fallback();
    const fromTracker = viaTracker(path);
    // tracker hedgeMs 內覆到就用佢；未覆就同時問後備，邊個先有結果用邊個（tracker 照計落去，下次就即刻有）
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((r) => (timer = setTimeout(() => r('late'), hedgeMs)));
    const first = await Promise.race([fromTracker, late]);
    clearTimeout(timer);
    if (first && first !== 'late') return first;
    if (first === null) return fallback(); // tracker 出錯：即刻用後備
    const backup = fallback();
    return new Promise<Response>((resolve, reject) => {
      let pending = 2;
      let backupRes: Response | null = null; // 後備出錯嘅回應：兩邊都唔得就俾佢（前端顯示錯誤訊息）
      const done = (e?: unknown) => {
        if (--pending > 0) return;
        if (backupRes) resolve(backupRes);
        else reject(e ?? new Error('tracker 同後備都失敗'));
      };
      fromTracker.then((r) => (r ? resolve(r) : done()), done);
      backup.then((r) => (r.ok ? resolve(r) : ((backupRes = r), done())), done);
    });
  }

  // 一次問好多個站嘅（附近、喺度搭得）：AREA_ETAS_VIA_TRACKER 未開就直接用後備
  const area = (path: string) => (opts.areaViaTracker ?? AREA_ETAS_VIA_TRACKER ? get(path) : f(`${opts.fallbackBase}${path}`));

  return {
    /** 成條線嘅巴士位置；回傳 Response（同 fetch 一樣用） */
    buses: (co: string, route: string, variantId: string) => get(busesPath(co, route, variantId)),
    /** 某路線喺某站嘅到站時間（tracker 追蹤緊呢條線就直接用佢 cache 住嘅，唔使再問巴士公司） */
    eta: (co: string, route: string, stopId: string) => get(etaPath(co, route, stopId)),
    /** 一個站所有路線嘅下一兩班（附近車站） */
    stopEtas: (co: string, stopId: string) => area(`/api/stop-etas?co=${co}&stop=${encodeURIComponent(stopId)}`),
    /** 呢個位置可以搭嘅所有路線（喺度搭得、首頁下班車） */
    here: (lat: number, lng: number) => area(`/api/here?lat=${lat}&lng=${lng}`),
    /** 港鐵站所有綫嘅到站時間 */
    mtr: (sta: string) => get(`/api/mtr?sta=${encodeURIComponent(sta)}`),
    /** 輕鐵站每個月台嘅到站時間 */
    lrt: (sta: string) => get(`/api/lrt?sta=${encodeURIComponent(sta)}`),
    /** 而家係咪用緊 tracker（除錯用） */
    usingTracker: () => Boolean(tracker) && now() >= downUntil,
  };
}

/** 舊名 */
export const createBusesClient = createLiveClient;
