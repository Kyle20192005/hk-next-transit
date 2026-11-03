import { describe, expect, it } from 'vitest';
import { variantLabel, sortVariants, statusText, variantStatus, variantStops, variantsForDir, shortName, type Calendar, type RouteData } from '../src';
import route38 from './fixtures/ctb-38.json';
import calendar38 from './fixtures/calendar-38.json';

const route = route38 as unknown as RouteData;
const calendar = calendar38 as Calendar;
const at = (iso: string) => new Date(`${iso}+08:00`);
const order = (dir: 'O' | 'I', iso: string) =>
  sortVariants(variantsForDir(route, dir), calendar, at(iso)).map((x) => `${x.variant.id} ${statusText(x.status)}`);

describe('走法狀態同排序（同城巴 App 一致）', () => {
  it('星期二 09:28 往北角：兩個走法都現正服務，不經華富排先', () => {
    expect(order('O', '2026-11-03T09:28:00')).toEqual(['1540-1 現正服務', '1000304-1 現正服務']);
  });

  it('星期二 11:00 往北角：正常路線排先，不經華富未來60分鐘冇班次', () => {
    expect(order('O', '2026-11-03T11:00:00')).toEqual([
      '1000304-1 現正服務',
      '1540-1 今日服務已結束',
    ]);
  });

  it('星期日 09:30：不經華富今日冇班次', () => {
    expect(order('O', '2026-11-08T09:30:00')).toEqual(['1000304-1 現正服務', '1540-1 今日沒有班次']);
  });

  it('星期二 06:00 往置富：銅鑼灣特別班 17:55 先開，未來60分鐘冇班次', () => {
    const o = order('I', '2026-11-03T06:00:00');
    expect(o[0]).toBe('1540-2 現正服務');
    expect(o).toContain('1000305-1 未來60分鐘沒有班次由總站開出');
  });
});

it('收埋時用簡短狀態', () => {
  const [, special] = sortVariants(variantsForDir(route, 'I'), calendar, at('2026-11-03T11:00:00'));
  expect(special!.variant.id).toBe('1000305-1');
  expect(statusText(special!.status)).toBe('未來60分鐘沒有班次由總站開出');
  expect(statusText(special!.status, true)).toBe('60分鐘內冇班次');
});

describe('走法站點', () => {
  const v = (id: string) => route.variants.find((x) => x.id === id)!;

  it('不經華富往北角：19 個站，包埋城巴獨有嘅黃竹坑醫院', () => {
    const s = variantStops(v('1540-1'));
    expect(s).toHaveLength(19);
    expect(s.map((x) => x.seq)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(s.find((x) => x.stopId === '002347')?.seq).toBe(8);
    expect(s.find((x) => x.stopId === '003969')?.seq).toBe(9);
    expect(s[s.length - 1]!.stopId).toBe('001249');
  });

  it('簡稱', () => {
    expect(shortName(v('1540-1'))).toBe('不經華富');
    expect(shortName(v('1000305-1'))).toBe('銅鑼灣(中央圖書館) - 置富');
  });

  it('顯示名稱：正常路線只加走法描述，唔加目的地', () => {
    expect(variantLabel(v('1000304-1'))).toBe('正常路線（經華富）');
    expect(variantLabel(v('1540-1'))).toBe('不經華富');
    expect(variantLabel({ name: '華貴 - 中環(交易廣場)', special: false })).toBe('正常路線');
  });
});

describe('冇時間表嘅走法', () => {
  it('狀態係 unknown，唔好話今日冇班次', () => {
    const v = { schedules: [], offsets: [0] } as unknown as RouteData['variants'][number];
    const s = variantStatus(v, {}, new Date());
    expect(s).toEqual({ state: 'unknown' });
    expect(statusText(s)).toBe('冇時間表資料');
  });
});
