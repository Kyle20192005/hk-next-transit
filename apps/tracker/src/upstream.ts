/**
 * 去營辦商 API 嘅 fetch（俾 core 嘅 etasAtStop 用）：
 * - 短時間 cache（同一個網址 + body，`upstreamTtlMs` 內唔再問）
 * - 合併同時請求（同一個網址未返嚟，第二個人等同一個結果）
 * - 限流（token bucket，所有線共用；每個伺服器各自計，超出就排隊）
 * - 統計：每間公司請求數、出錯數、平均回應時間（/health 顯示，用嚟及早發現俾人限流）
 */

/** 低優先請求排隊太長（tracker 忙）：唔排，即刻話佢知，等前端用 Vercel 後備 */
export class BusyError extends Error {
  constructor() {
    super('tracker 忙');
  }
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  /** 高優先（追蹤緊嘅路線、某站到站時間）先行，低優先（附近、喺度搭得：一次問好多個站）之後 */
  private queue: (() => void)[] = [];
  private low: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private rps: number,
    private now: () => number = Date.now,
  ) {
    this.tokens = rps;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.rps, this.tokens + ((t - this.last) / 1000) * this.rps);
    this.last = t;
  }

  /** 攞一個 token；冇就排隊等。低優先：前面排緊太多（maxLowWait 秒嘅量）就直接 BusyError */
  take(lowPriority = false, maxLowWait = 2): Promise<void> {
    if (lowPriority && this.queue.length + this.low.length >= this.rps * maxLowWait) return Promise.reject(new BusyError());
    return new Promise((resolve) => {
      (lowPriority ? this.low : this.queue).push(resolve);
      this.drain();
    });
  }

  get waiting() {
    return this.queue.length + this.low.length;
  }

  private drain() {
    this.refill();
    while ((this.queue.length || this.low.length) && this.tokens >= 1) {
      this.tokens -= 1;
      (this.queue.length ? this.queue : this.low).shift()!();
    }
    if ((this.queue.length || this.low.length) && !this.timer) {
      const wait = Math.ceil(((1 - this.tokens) / this.rps) * 1000);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, Math.max(1, wait));
    }
  }
}

type Stored = { at: number; status: number; contentType: string; body: string };

export interface UpstreamStats {
  requests: number;
  cacheHits: number;
  errors: number;
  totalMs: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** 按網址認公司（統計用） */
export function companyOf(url: string): string {
  if (url.includes('citybus')) return 'CTB';
  if (url.includes('kmb')) return 'KMB';
  if (url.includes('nlb')) return 'NLB';
  if (url.includes('mtr')) return 'MTRB';
  if (url.includes('hkbuseta')) return 'times';
  return 'other';
}

export function createUpstream(opts: { ttlMs: number; rps: number; fetchImpl?: typeof fetch; now?: () => number }) {
  const base = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  // 每個伺服器各自限速：城巴同新大嶼山（rt.data.gov.hk）、九巴（data.etabus.gov.hk）、港鐵巴士係唔同伺服器，唔使互相搶
  const buckets = new Map<string, TokenBucket>();
  const bucketFor = (url: string) => {
    let host = 'other';
    try {
      host = new URL(url).host;
    } catch {
      /* 唔係完整網址：共用 */
    }
    let b = buckets.get(host);
    if (!b) buckets.set(host, (b = new TokenBucket(opts.rps, now)));
    return b;
  };
  const cache = new Map<string, Stored>();
  const inflight = new Map<string, Promise<Stored>>();
  const stats = new Map<string, UpstreamStats>();
  const stat = (co: string) => {
    let s = stats.get(co);
    if (!s) stats.set(co, (s = { requests: 0, cacheHits: 0, errors: 0, totalMs: 0, lastError: null, lastErrorAt: null }));
    return s;
  };

  const toResponse = (s: Stored) => new Response(s.body, { status: s.status, headers: { 'content-type': s.contentType } });

  const makeFetch = (lowPriority: boolean, onBusy?: () => void): typeof fetch => async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === 'string' ? init.body : '';
    const key = `${init?.method ?? 'GET'} ${url} ${body}`;
    const co = companyOf(url);

    const hit = cache.get(key);
    if (hit && now() - hit.at < opts.ttlMs) {
      stat(co).cacheHits++;
      return toResponse(hit);
    }
    let p = inflight.get(key);
    if (!p) {
      p = (async () => {
        try {
          await bucketFor(url).take(lowPriority);
        } catch (e) {
          onBusy?.();
          throw e;
        }
        const s = stat(co);
        const t0 = now();
        s.requests++;
        try {
          const res = await base(url, { ...init, signal: AbortSignal.timeout(8000) });
          const stored: Stored = { at: now(), status: res.status, contentType: res.headers.get('content-type') ?? '', body: await res.text() };
          s.totalMs += now() - t0;
          if (res.ok) cache.set(key, stored);
          else {
            s.errors++;
            s.lastError = `HTTP ${res.status}`;
            s.lastErrorAt = new Date().toISOString();
          }
          return stored;
        } catch (e) {
          s.errors++;
          s.lastError = (e as Error).message;
          s.lastErrorAt = new Date().toISOString();
          throw e;
        }
      })();
      inflight.set(key, p);
      p.finally(() => inflight.delete(key)).catch(() => {});
    } else {
      stat(co).cacheHits++;
    }
    return toResponse(await p);
  };

  /** 清走過期 cache（定時叫，免得記憶體越嚟越大） */
  const sweep = () => {
    const t = now();
    for (const [k, v] of cache) if (t - v.at > opts.ttlMs * 3) cache.delete(k);
  };

  const queued = () => [...buckets.values()].reduce((n, b) => n + b.waiting, 0);
  return {
    /** 高優先：追蹤緊嘅路線、某站到站時間 */
    fetch: makeFetch(false),
    /** 低優先（附近、喺度搭得）：排隊太長會 BusyError；onBusy 用嚟知道今次請求有冇俾人拒絕 */
    lowFetch: (onBusy: () => void) => makeFetch(true, onBusy),
    stats,
    queued,
    sweep,
    cacheSize: () => cache.size,
  };
}
