import { describe, expect, it } from 'vitest';
import { createUpstream, TokenBucket } from './upstream';

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
