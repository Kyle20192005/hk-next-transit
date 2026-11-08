import { describe, expect, it } from 'vitest';
import { lastBusAt, lastBusEtaIndex, lastBusText } from './schedule';
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
    expect(info).toEqual({ last: hk(23, 40), nextFirst: null, prev: hk(6, 10) });
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

describe('lastBusEtaIndex', () => {
  // 時間表：23:00、23:30 開出，去 B 站 10 分鐘 → 23:10、23:40（尾班）
  const info = lastBusAt([v([360, 1380, 1410])], 'B', 'O', calendar, hk(23));
  const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace('Z', '+08:00');
  const eta = (t: number, company: 'CTB' | 'KMB' = 'CTB') => ({ eta: iso(t), company });
  it('marks the latest real-time bus near the timetable last', () => {
    expect(info?.prev).toBe(hk(23, 10));
    expect(lastBusEtaIndex([eta(hk(23, 12)), eta(hk(23, 43))], info)).toBe(1);
    // 次序唔重要：揀最遲嗰班
    expect(lastBusEtaIndex([eta(hk(23, 43), 'KMB'), eta(hk(23, 12))], info)).toBe(0);
  });
  it('not when the latest is closer to the previous bus', () => {
    expect(lastBusEtaIndex([eta(hk(23, 5)), eta(hk(23, 14))], info)).toBe(-1);
  });
  it('not when too far from the timetable', () => {
    expect(lastBusEtaIndex([eta(hk(23, 59))], info)).toBe(-1);
    expect(lastBusEtaIndex([], info)).toBe(-1);
    expect(lastBusEtaIndex([eta(hk(23, 40))], null)).toBe(-1);
  });
  it('company already gave 3 buses: later ones may be hidden', () => {
    const three = [eta(hk(23, 12)), eta(hk(23, 20)), eta(hk(23, 33))];
    expect(lastBusEtaIndex(three, { ...info!, prev: null })).toBe(-1);
    expect(lastBusEtaIndex([eta(hk(23, 12)), eta(hk(23, 20)), eta(hk(23, 39))], { ...info!, prev: null })).toBe(2);
  });
  it('delayed last bus after the estimated time still counts', () => {
    const late = lastBusAt([v([360, 1380, 1410])], 'B', 'O', calendar, hk(23, 45));
    expect(lastBusEtaIndex([eta(hk(23, 50))], late)).toBe(0);
    expect(lastBusText(late, hk(23, 45), hk(23, 50))).toEqual({ text: '尾班車 23:50 · 仲有 5 分鐘', urgent: true, gone: false });
  });
});
