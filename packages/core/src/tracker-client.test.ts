import { describe, expect, it } from 'vitest';
import { createBusesClient } from './tracker-client';

describe('createBusesClient', () => {
  it('uses tracker, falls back on failure and stays on fallback for a while', async () => {
    const calls: string[] = [];
    let trackerUp = true;
    let t = 0;
    const fake: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://rt') && !trackerUp) throw new Error('down');
      return new Response('{}');
    };
    const c = createBusesClient({ trackerBase: 'https://rt/', fallbackBase: '', fetcher: fake, now: () => t });
    await c.buses('ctb', '38', '1540-1');
    expect(calls.pop()).toBe('https://rt/api/buses?co=ctb&route=38&v=1540-1');
    trackerUp = false;
    await c.buses('ctb', '38', '1540-1');
    expect(calls.slice(-2)).toEqual(['https://rt/api/buses?co=ctb&route=38&v=1540-1', '/api/buses?co=ctb&route=38&v=1540-1']);
    trackerUp = true;
    t = 30_000;
    await c.buses('ctb', '38', '1540-1');
    expect(calls.pop()).toBe('/api/buses?co=ctb&route=38&v=1540-1'); // 60 秒內唔再試 tracker
    t = 61_000;
    await c.buses('ctb', '38', '1540-1');
    expect(calls.pop()).toBe('https://rt/api/buses?co=ctb&route=38&v=1540-1');
  });
  it('hedges: slow tracker → backup answers first, tracker still used next time', async () => {
    const calls: string[] = [];
    let slow = true;
    const fake: typeof fetch = (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://rt') && slow) return new Promise((r) => setTimeout(() => r(new Response('"rt"')), 200));
      return Promise.resolve(new Response(url.startsWith('https://rt') ? '"rt"' : '"backup"'));
    };
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: '', fetcher: fake, hedgeMs: 20 });
    expect(await (await c.buses('ctb', '107', 'x')).json()).toBe('backup');
    slow = false;
    expect(await (await c.buses('ctb', '107', 'x')).json()).toBe('rt');
    expect(c.usingTracker()).toBe(true);
  });
  it('timeout falls back once but keeps using tracker', async () => {
    const calls: string[] = [];
    let slow = true;
    const fake: typeof fetch = (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://rt') && slow)
        return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      return Promise.resolve(new Response('{}'));
    };
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: '', fetcher: fake, timeoutMs: 20, hedgeMs: 1000 });
    await c.buses('ctb', '38', 'x');
    expect(calls.slice(-2)).toEqual(['https://rt/api/buses?co=ctb&route=38&v=x', '/api/buses?co=ctb&route=38&v=x']);
    slow = false;
    await c.buses('ctb', '38', 'x');
    expect(calls.pop()).toBe('https://rt/api/buses?co=ctb&route=38&v=x');
  });
  it('503 (busy) falls back without marking tracker down', async () => {
    const calls: string[] = [];
    let busy = true;
    const fake: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://rt') && busy) return new Response('{}', { status: 503 });
      return new Response('{}');
    };
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: '', fetcher: fake, areaViaTracker: true });
    await c.here(22.3, 114.18);
    expect(calls.slice(-2)).toEqual(['https://rt/api/here?lat=22.3&lng=114.18', '/api/here?lat=22.3&lng=114.18']);
    expect(c.usingTracker()).toBe(true);
    busy = false;
    await c.stopEtas('ctb', '001106');
    expect(calls.pop()).toBe('https://rt/api/stop-etas?co=ctb&stop=001106');
  });
  it('area requests (here / stop-etas) use fallback while AREA_ETAS_VIA_TRACKER is off', async () => {
    const calls: string[] = [];
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: 'https://eta', fetcher: async (i) => (calls.push(String(i)), new Response('{}')) });
    await c.here(22.3, 114.18);
    await c.stopEtas('kmb', 'ABC');
    expect(calls).toEqual(['https://eta/api/here?lat=22.3&lng=114.18', 'https://eta/api/stop-etas?co=kmb&stop=ABC']);
  });
  it('eta goes through tracker too', async () => {
    const calls: string[] = [];
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: '', fetcher: async (i) => (calls.push(String(i)), new Response('{}')) });
    await c.eta('ctb', '101', '001152');
    expect(calls).toEqual(['https://rt/api/eta?co=ctb&route=101&stop=001152']);
  });
  it('without tracker uses fallback only', async () => {
    const calls: string[] = [];
    const c = createBusesClient({ trackerBase: '', fallbackBase: 'https://eta', fetcher: async (i) => (calls.push(String(i)), new Response('{}')) });
    await c.buses('kmb', '1A', 'O1');
    expect(calls).toEqual(['https://eta/api/buses?co=kmb&route=1A&v=O1']);
  });
});
