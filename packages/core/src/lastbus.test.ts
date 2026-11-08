import { describe, expect, it } from 'vitest';
import { adjustLastBus, lastBusAt, lastBusEtaIndex, lastBusText } from './schedule';
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
    expect(info).toEqual({ last: hk(23, 40), nextFirst: null, prev: hk(6, 10), offsetMin: 10 });
    expect(lastBusText(info, hk(20))).toEqual({ text: '尾班約 23:40', urgent: false, gone: false });
    expect(lastBusText(info, hk(23, 20))).toEqual({ text: '尾班約 23:40 · 仲有 20 分鐘', urgent: true, gone: false });
  });
  it('after last bus → next first tomorrow', () => {
    const info = lastBusAt([v([360, 1410])], 'B', 'O', calendar, hk(23, 50));
    expect(info?.nextFirst).toBe(hk(6, 10) + 86_400_000);
    expect(lastBusText(info, hk(23, 50))?.text).toBe('尾班車已經開走 · 下次頭班約 聽日 06:10');
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

describe('after midnight (bug 2026-11-09)', () => {
  // 尾班 23:35 開出、到 B 站 23:45；頭班 06:00
  const vs = [v([360, 1415])];
  it('00:03: last night\'s last bus has gone, next first 06:10 today', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 3));
    expect(info?.last).toBe(hk(23, 45) - 86_400_000);
    expect(info?.nextFirst).toBe(hk(6, 10));
    expect(lastBusText(info, hk(0, 3))?.text).toBe('尾班車已經開走 · 下次頭班約 06:10');
  });
  it('00:04: a late last bus still shown in ETAs is recognised', () => {
    // 595 實例：時間表尾班 23:58 到呢個站，實際遲咗，00:04 先到
    const info = lastBusAt([v([360, 1428])], 'B', 'O', calendar, hk(0, 4));
    const eta = { eta: new Date(hk(0, 4) + 20_000 + 8 * 3600_000).toISOString().replace('Z', '+08:00'), company: 'CTB' as const };
    expect(lastBusEtaIndex([eta], info)).toBe(0);
    expect(lastBusText(info, hk(0, 4), hk(0, 4) + 20_000)?.text).toBe('尾班車 00:04 · 即將到站');
    // ETA 啱啱過咗 20 秒：車喺站，仲係尾班
    expect(lastBusText(info, hk(0, 4) + 40_000, hk(0, 4) + 20_000)?.text).toBe('尾班車 00:04 · 即將到站');
  });
  it('after first bus of the day, today is the service day', () => {
    expect(lastBusAt(vs, 'B', 'O', calendar, hk(7))?.last).toBe(hk(23, 45));
  });
});

describe('adjustLastBus (107 at night: estimate 00:45, real 00:28)', () => {
  // 尾班 23:55 開，時間表估 50 分鐘到呢個站 → 00:45；前一班 23:35 → 00:25
  const vs = [v([360, 1415, 1435], 3000)];
  it('scales the estimate by live travel time', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 15) + 86_400_000);
    expect(info?.last).toBe(hk(0, 45) + 86_400_000);
    // 實測而家只要 33 分鐘
    const adj = adjustLastBus(info, 33)!;
    expect(adj.last).toBe(hk(0, 28) + 86_400_000);
    const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace('Z', '+08:00');
    // 冇校正：00:28 近前一班（00:25）多過尾班（00:45）→ 認唔到；校正後認到
    const etas = [{ eta: iso(hk(0, 28) + 86_400_000), company: 'CTB' as const }];
    expect(lastBusEtaIndex(etas, info)).toBe(-1);
    expect(lastBusEtaIndex(etas, adj)).toBe(0);
  });
  it('no live data or tiny offsets → unchanged', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 15) + 86_400_000);
    expect(adjustLastBus(info, null)).toBe(info);
    expect(adjustLastBus({ last: 1, nextFirst: null, offsetMin: 2 }, 1)?.last).toBe(1);
  });
});
