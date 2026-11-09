import { describe, expect, it } from 'vitest';
import { BusyError, companyOf, createUpstream, isSoftMiss, TokenBucket } from './upstream';

describe('upstream fetch', () => {
  it('caches, merges concurrent requests and keeps errors out of cache', async () => {
    let calls = 0;
    let fail = false;
    let t = 0;
    const fake: typeof fetch = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(fail ? 'no' : JSON.stringify({ n: calls }), { status: fail ? 500 : 200 });
    };
    const up = createUpstream({ ttlMs: 10_000, rps: 100, fetchImpl: fake, now: () => t });
    const [a, b] = await Promise.all([up.fetch('https://rt.data.gov.hk/citybus/x'), up.fetch('https://rt.data.gov.hk/citybus/x')]);
    expect(await a.json()).toEqual({ n: 1 });
    expect(await b.json()).toEqual({ n: 1 });
    expect(calls).toBe(1);
    await up.fetch('https://rt.data.gov.hk/citybus/x');
    expect(calls).toBe(1); // cache 命中
    t = 11_000;
    fail = true;
    const r = await up.fetch('https://rt.data.gov.hk/citybus/x');
    expect(r.status).toBe(500);
    expect(calls).toBe(2);
    fail = false;
    await up.fetch('https://rt.data.gov.hk/citybus/x');
    expect(calls).toBe(3); // 出錯嘅冇 cache，即刻再問
    expect(up.stats.get('CTB')).toMatchObject({ requests: 3, errors: 1 });
  });

  it('separates POST bodies (港鐵巴士)', async () => {
    let calls = 0;
    const fake: typeof fetch = async () => (calls++, new Response('{}'));
    const up = createUpstream({ ttlMs: 10_000, rps: 100, fetchImpl: fake });
    await up.fetch('https://mtr/x', { method: 'POST', body: '{"routeName":"K76"}' });
    await up.fetch('https://mtr/x', { method: 'POST', body: '{"routeName":"K12"}' });
    expect(calls).toBe(2);
  });
});

describe('TokenBucket', () => {
  it('limits rate', async () => {
    const b = new TokenBucket(10);
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 15 }, () => b.take()));
    // 頭 10 個即刻有，之後 5 個要等大約 0.5 秒
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
  });
});

describe('priority', () => {
  it('serves high priority before low, and rejects low when the queue is long', async () => {
    const b = new TokenBucket(2); // 每秒 2 個，一開始有 2 個 token
    const order: string[] = [];
    await Promise.all([b.take(), b.take()]); // 用晒
    const low = b.take(true, 10).then(() => order.push('low'));
    const high = b.take().then(() => order.push('high'));
    await Promise.all([low, high]);
    expect(order).toEqual(['high', 'low']);
    // 排隊上限 = rps × maxLowWait = 2：已經有 2 個排緊，低優先直接拒絕
    void b.take();
    void b.take();
    await expect(b.take(true, 1)).rejects.toBeInstanceOf(BusyError);
  });

  it('lowFetch reports busy', async () => {
    let busy = false;
    const up = createUpstream({ ttlMs: 10_000, rps: 1, fetchImpl: async () => new Response('{}') });
    const f = up.lowFetch(() => (busy = true));
    await up.fetch('https://rt.data.gov.hk/a'); // 用咗唯一嗰個 token
    void up.fetch('https://rt.data.gov.hk/b'); // 排緊一個（高優先）
    void up.fetch('https://rt.data.gov.hk/c');
    await expect(f('https://rt.data.gov.hk/d')).rejects.toBeInstanceOf(BusyError);
    expect(busy).toBe(true);
  });
});

describe('per-host limits', () => {
  it('uses rpsByHost for matching host', () => {
    const up = createUpstream({ ttlMs: 1000, rps: 10, rpsByHost: { 'data.etabus.gov.hk': 3 }, fetchImpl: async () => new Response('{}') });
    void up.fetch('https://data.etabus.gov.hk/x');
    void up.fetch('https://rt.data.gov.hk/y');
    expect(up.limits()).toEqual({ 'data.etabus.gov.hk': 3, 'rt.data.gov.hk': 10 });
  });
});

describe('專線小巴（data.etagmb.gov.hk）', () => {
  const GMB = 'https://data.etagmb.gov.hk/eta/stop/20000024';

  it('companyOf', () => {
    expect(companyOf(GMB)).toBe('GMB');
    expect(companyOf('https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001152/101')).toBe('CTB');
    expect(companyOf('https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/X')).toBe('KMB');
  });

  it('isSoftMiss：淨係專線小巴嘅 500「ETA unavailable」同 404', () => {
    expect(isSoftMiss(GMB, 500, '{"code":500,"message":"ETA unavailable"}')).toBe(true);
    expect(isSoftMiss(GMB, 404, '')).toBe(true);
    expect(isSoftMiss(GMB, 500, '{"message":"Internal"}')).toBe(false);
    expect(isSoftMiss(GMB, 502, 'ETA unavailable')).toBe(false);
    expect(isSoftMiss('https://rt.data.gov.hk/x', 500, 'ETA unavailable')).toBe(false);
  });

  it('「ETA unavailable」照 cache、唔計出錯；真出錯照計、唔 cache', async () => {
    let calls = 0;
    const status = 500;
    let body = '{"code":500,"message":"ETA unavailable"}';
    const fake: typeof fetch = async () => (calls++, new Response(body, { status }));
    const up = createUpstream({ ttlMs: 10_000, rps: 100, fetchImpl: fake, now: () => 0 });
    const a = await up.fetch(GMB);
    expect(a.status).toBe(500);
    expect(await a.text()).toContain('ETA unavailable');
    await up.fetch(GMB);
    expect(calls).toBe(1); // cache 命中
    expect(up.stats.get('GMB')).toMatchObject({ requests: 1, cacheHits: 1, errors: 0, lastError: null });

    const other = 'https://data.etagmb.gov.hk/eta/stop/20000093';
    body = '{"message":"Internal"}';
    await up.fetch(other);
    await up.fetch(other);
    expect(calls).toBe(3); // 真出錯冇 cache
    expect(up.stats.get('GMB')).toMatchObject({ requests: 3, errors: 2, lastError: 'HTTP 500' });
  });
});
