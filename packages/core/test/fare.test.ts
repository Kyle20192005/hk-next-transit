import { describe, expect, it } from 'vitest';
import { formatFare, joyYouFare, serviceDaysLabel, serviceSummary, timetablePeriods, type Calendar, type RouteData } from '../src';
import route38 from './fixtures/ctb-38.json';
import calendar38 from './fixtures/calendar-38.json';

describe('樂悠咭車費（兩蚊兩折）', () => {
  it('$10 或以下收 $2；低過 $2 收原價', () => {
    expect(joyYouFare(6.6)).toBe(2);
    expect(joyYouFare(10)).toBe(2);
    expect(joyYouFare(1.5)).toBe(1.5);
  });
  it('超過 $10 收兩成，四捨五入至一毫（運輸署例子）', () => {
    expect(joyYouFare(10.8)).toBe(2.2);
    expect(joyYouFare(20.2)).toBe(4);
    expect(joyYouFare(12.9)).toBe(2.6);
    expect(joyYouFare(41.9)).toBe(8.4);
  });
  it('顯示', () => {
    expect(formatFare(2)).toBe('$2');
    expect(formatFare(6.6)).toBe('$6.6');
    expect(formatFare(4)).toBe('$4');
  });
});

describe('服務時間同班次', () => {
  const route = route38 as unknown as RouteData;
  const v = route.variants.find((x) => x.id === '1000304-1')!;
  it('星期二：頭尾班同而家班次', () => {
    const s = serviceSummary(v, calendar38 as Calendar, new Date('2026-11-03T12:00:00+08:00'))!;
    expect(s.first).toBe(600); // 10:00
    expect(s.last).toBeGreaterThan(1440); // 過咗午夜
    expect(s.headwayNow).toBeGreaterThan(0);
    expect(s.headwayMin).toBeLessThanOrEqual(s.headwayNow!);
  });
});

describe('詳細班次', () => {
  it('相隔一樣嘅班次併做一段，段與段首尾相接', () => {
    // 06:00 每 8 分鐘到 06:16，之後每 10 分鐘到 06:46，最後 07:30 一班
    expect(timetablePeriods([360, 368, 376, 386, 396, 406, 450])).toEqual([
      { start: 360, end: 376, headway: 8 },
      { start: 376, end: 406, headway: 10 },
      { start: 450, end: 450, headway: null },
    ]);
  });
  it('單一班次', () => {
    expect(timetablePeriods([1075, 1105])).toEqual([
      { start: 1075, end: 1075, headway: null },
      { start: 1105, end: 1105, headway: null },
    ]);
    expect(timetablePeriods([1075])).toEqual([{ start: 1075, end: 1075, headway: null }]);
  });
  it('日子文字', () => {
    expect(serviceDaysLabel([true, true, true, true, true, false, false])).toBe('星期一至五');
    expect(serviceDaysLabel([false, false, false, false, false, true, false])).toBe('星期六');
    expect(serviceDaysLabel([false, false, false, false, false, false, true])).toBe('星期日及公眾假期');
    expect(serviceDaysLabel([true, true, true, true, true, true, false])).toBe('星期一至六');
  });
});
