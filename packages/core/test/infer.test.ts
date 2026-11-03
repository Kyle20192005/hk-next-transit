import { describe, expect, it } from 'vitest';
import { inferVariant, activeServiceIds, serviceWindow, fmtMinutes, type Calendar, type Eta, type RouteData } from '../src';
import route38 from './fixtures/ctb-38.json';
import calendar38 from './fixtures/calendar-38.json';

const route = route38 as unknown as RouteData;
const calendar = calendar38 as Calendar;

/** 2026-11-03（星期二）早上實時觀察到嘅城巴 38 ETA */
function eta(stopId: string, dir: 'O' | 'I', hhmm: string, seq: number): Eta {
  return {
    company: 'CTB', route: '38', dir, stopId, seq,
    eta: `2026-11-03T${hhmm}:00+08:00`,
    destTc: '', destEn: '', remarkTc: '', remarkEn: '',
  };
}

describe('城巴 38 走法推斷', () => {
  it.each([
    // 站, 方向, 到站, seq, 預期走法, 預期可信度
    ['002260', 'O', '09:35', 3, '1540-1', 'certain'],     // 華富道,石排灣道：只有不經華富經過
    ['002338', 'O', '10:04', 4, '1000304-1', 'certain'],  // 華富(北)：只有經華富經過
    ['001249', 'O', '09:35', 19, '1540-1', 'certain'],    // 北角碼頭：seq 19 = 不經華富
    ['003969', 'O', '10:21', 16, '1000304-1', 'certain'], // 轉乘站：seq 16 = 經華富
    ['003969', 'O', '09:56', 9, '1540-1', 'certain'],     // 轉乘站：seq 9 = 不經華富
    ['002186', 'O', '09:54', 1, '1540-1', 'likely'],      // 置富總站：seq 都係 1，要靠時間表
    ['002186', 'O', '10:00', 1, '1000304-1', 'likely'],
    ['001249', 'I', '09:45', 1, '1540-2', 'likely'],      // 北角碼頭總站
    ['001249', 'I', '10:12', 1, '1000304-2', 'likely'],
  ] as const)('%s %s %s seq%d → %s', (stop, dir, t, seq, variantId, confidence) => {
    const g = inferVariant(route, eta(stop, dir, t, seq), calendar);
    expect(g.variantId).toBe(variantId);
    expect(g.confidence).toBe(confidence);
  });

  it('冇走法經過嘅站回傳 unknown', () => {
    expect(inferVariant(route, eta('999999', 'O', '09:00', 1), calendar).confidence).toBe('unknown');
  });
});

describe('時間表', () => {
  const tue = new Date('2026-11-03T09:30:00+08:00');
  const sun = new Date('2026-11-08T09:30:00+08:00');
  const v = (id: string) => route.variants.find((x) => x.id === id)!;

  it('不經華富：平日 06:00–09:54，星期日冇班次', () => {
    const w = serviceWindow(v('1540-1'), calendar, tue)!;
    expect([fmtMinutes(w[0]), fmtMinutes(w[1])]).toEqual(['06:00', '09:54']);
    expect(serviceWindow(v('1540-1'), calendar, sun)).toBeNull();
  });

  it('正常路線：平日 10:00 開始，尾班過咗午夜', () => {
    const w = serviceWindow(v('1000304-1'), calendar, tue)!;
    expect([fmtMinutes(w[0]), fmtMinutes(w[1])]).toEqual(['10:00', '00:35']);
    expect(w[1]).toBeGreaterThan(1440);
  });

  it('星期二同星期日用唔同 serviceId', () => {
    expect([...activeServiceIds(calendar, tue)]).not.toEqual([...activeServiceIds(calendar, sun)]);
  });
});
