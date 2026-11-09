import { describe, expect, it } from 'vitest';
import { LRT_MAP_STATIONS } from './lrt-map';
import { LRT_STOP_LL } from './lrt-geo';
import { lrtStopName } from './lrt';
import { MTR_STATION_LL } from './mtr-geo';
import { mtrStationLines, mtrStationName } from './mtr';
import { metresBetween } from './geo';
import { MTR_LRT_XFER, lrtXferOf, mtrXferOf } from './rail-xfer';
import { MTR_MAP_XFER_DIR, mtrMapStations, mtrXferLink } from './mtr-map';

describe('港鐵 ↔ 輕鐵轉乘', () => {
  it('四對站：同名、屯馬綫、實際位置相距 400 米內', () => {
    expect(Object.keys(MTR_LRT_XFER).sort()).toEqual(['SIH', 'TIS', 'TUM', 'YUL']);
    for (const [mtr, lrt] of Object.entries(MTR_LRT_XFER)) {
      expect(lrtStopName(lrt)).toBe(mtrStationName(mtr));
      expect(mtrStationLines(mtr)).toContain('TML');
      const a = MTR_STATION_LL[mtr]!;
      const b = LRT_STOP_LL[lrt]!;
      expect(metresBetween([a[0], a[1]], [b[0], b[1]])).toBeLessThan(400);
    }
  });
  it('雙向查', () => {
    expect(lrtXferOf('TIS')).toBe('430');
    expect(mtrXferOf('430')).toBe('TIS');
    expect(lrtXferOf('MOK')).toBeNull();
    expect(mtrXferOf('1')).toBeNull();
  });
  it('輕鐵圖只係轉乘站有轉乘虛綫，港鐵圖四個站都有', () => {
    const marked = LRT_MAP_STATIONS.filter((s) => s.xl).map((s) => s.id).sort();
    expect(marked).toEqual(Object.values(MTR_LRT_XFER).sort());
    expect(Object.keys(MTR_MAP_XFER_DIR).sort()).toEqual(Object.keys(MTR_LRT_XFER).sort());
    const tis = mtrXferLink(mtrMapStations().find((s) => s.code === 'TIS')!)!;
    // 天水圍向南：虛綫起點喺站圈邊、站圈喺下面
    expect(tis.a[0]).toBeCloseTo(tis.c[0]);
    expect(tis.c[1]).toBeGreaterThan(tis.a[1]);
    expect(mtrXferLink(mtrMapStations().find((s) => s.code === 'MOK')!)).toBeNull();
  });
});
