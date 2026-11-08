import { describe, expect, it } from 'vitest';
import { lastBusAt, lastBusText } from './schedule';
import type { Calendar, Variant } from './types';

// 每日都有嘅服務
const calendar: Calendar = { D: { days: [true, true, true, true, true, true, true], start: '20200101', end: '20991231', add: [], remove: [] } } as unknown as Calendar;
const v = (departures: number[], offsetSec = 600): Variant =>
  ({ id: 'x', stops: ['A', 'B'], stopDirs: ['O', 'O'], offsets: [0, offsetSec], schedules: [{ serviceId: 'D', departures }] }) as unknown as Variant;
// 香港時間 2026-11-09 某個鐘數（毫秒）
const hk = (h: number, m = 0) => Date.UTC(2026, 10, 9, h - 8, m);

describe('lastBusAt', () => {
  it('before last bus', () => {
    // 尾班 23:30 由總站開，去 B 站要 10 分鐘 → 23:40
    const info = lastBusAt([v([360, 1410])], 'B', 'O', calendar, hk(20));
    expect(info).toEqual({ last: hk(23, 40), nextFirst: null });
    expect(lastBusText(info, hk(20))).toEqual({ text: '尾班約 23:40', urgent: false, gone: false });
    expect(lastBusText(info, hk(23, 20))).toEqual({ text: '尾班約 23:40 · 仲有 20 分鐘', urgent: true, gone: false });
  });
  it('after last bus → next first tomorrow', () => {
    const info = lastBusAt([v([360, 1410])], 'B', 'O', calendar, hk(23, 50));
    expect(info?.nextFirst).toBe(hk(6, 10) + 86_400_000);
    expect(lastBusText(info, hk(23, 50))?.text).toBe('今日已經冇車 · 下次頭班約 聽日 06:10');
  });
  it('after midnight still yesterday service (departure 1470 = 00:30)', () => {
    const info = lastBusAt([v([360, 1470])], 'B', 'O', calendar, hk(0, 20));
    expect(info?.last).toBe(hk(0, 40));
  });
  it('null when no timetable or stop not on variant', () => {
    expect(lastBusAt([v([])], 'B', 'O', calendar, hk(12))).toBeNull();
    expect(lastBusAt([v([360])], 'Z', 'O', calendar, hk(12))).toBeNull();
  });
  it('uses latest across variants', () => {
    const info = lastBusAt([v([360, 1300]), v([400, 1380], 300)], 'B', 'O', calendar, hk(12));
    expect(info?.last).toBe(hk(23, 5));
  });
});
