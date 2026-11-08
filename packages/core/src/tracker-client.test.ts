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
    const c = createBusesClient({ trackerBase: 'https://rt', fallbackBase: '', fetcher: fake, timeoutMs: 20 });
    await c.buses('ctb', '38', 'x');
    expect(calls.slice(-2)).toEqual(['https://rt/api/buses?co=ctb&route=38&v=x', '/api/buses?co=ctb&route=38&v=x']);
    slow = false;
    await c.buses('ctb', '38', 'x');
    expect(calls.pop()).toBe('https://rt/api/buses?co=ctb&route=38&v=x');
  });
  it('without tracker uses fallback only', async () => {
    const calls: string[] = [];
    const c = createBusesClient({ trackerBase: '', fallbackBase: 'https://eta', fetcher: async (i) => (calls.push(String(i)), new Response('{}')) });
    await c.buses('kmb', '1A', 'O1');
    expect(calls).toEqual(['https://eta/api/buses?co=kmb&route=1A&v=O1']);
  });
});
