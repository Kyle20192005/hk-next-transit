import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 唔好真係讀數據／問巴士公司：mock data 同 core computeBuses
vi.mock('./data', () => ({
  getRoute: async () => ({ route: '38', company: 'CTB', variants: [{ id: 'v1' }] }),
  getCalendar: async () => ({}),
}));
vi.mock('./segments', () => ({ hourlyTimesFor: async () => ({}) }));
vi.mock('@hknt/core', () => ({
  variantStops: () => [],
  computeBuses: async () => ({ route: '38', variant: 'v1', fetchedAt: new Date().toISOString(), segSeconds: [], hourlySegments: 0, buses: [], failed: [] }),
}));

describe('lines', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stops a prefetch-only line after 45s, keeps a watched line', async () => {
    const { createLines } = await import('./lines');
    const lines = createLines(fetch);
    await lines.get('ctb', '38', 'v1'); // 預先 fetch：問一次
    expect(lines.status()[0]).toMatchObject({ polling: true, asks: 1 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lines.size()).toBe(0);

    await lines.get('ctb', '38', 'v1');
    await lines.get('ctb', '38', 'v1'); // 真係睇緊：問多過一次
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lines.size()).toBe(1);
  });
});
