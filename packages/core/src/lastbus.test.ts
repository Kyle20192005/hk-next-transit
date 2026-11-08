import { describe, expect, it } from 'vitest';
import { adjustLastBus, lastBusAt, lastBusEtaIndex, lastBusText, minutesToStop } from './schedule';
import type { Calendar, Variant } from './types';

// 每日都有嘅服務
const calendar: Calendar = { D: { days: [true, true, true, true, true, true, true], start: '20200101', end: '20991231', add: [], remove: [] } } as unknown as Calendar;
const v = (departures: number[], offsetSec = 600): Variant =>
  ({ id: 'x', stops: ['A', 'B'], stopDirs: ['O', 'O'], offsets: [0, offsetSec], schedules: [{ serviceId: 'D', departures }] }) as unknown as Variant;
/** 由 from 到 to（分鐘，包埋）每 step 分鐘一班 */
const every = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
// 香港時間 2026-11-09 某個鐘數（毫秒）
const hk = (h: number, m = 0) => Date.UTC(2026, 10, 9, h - 8, m);
const DAY = 86_400_000;
const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace('Z', '+08:00');
const eta = (t: number, company: 'CTB' | 'KMB' = 'CTB') => ({ eta: iso(t), company });

// 一般路線：06:00 至 23:30 每 15 分鐘，去 B 站 10 分鐘 → 06:10 … 23:40
const normal = [v(every(360, 1410, 15))];

describe('lastBusAt', () => {
  it('before last bus', () => {
    const info = lastBusAt(normal, 'B', 'O', calendar, hk(20));
    expect(info).toEqual({ last: hk(23, 40), nextFirst: null, prev: hk(23, 25), offsetMin: 10 });
    expect(lastBusText(info, hk(20))).toEqual({ text: '尾班約 23:40', urgent: false, gone: false });
    expect(lastBusText(info, hk(23, 20))).toEqual({ text: '尾班約 23:40 · 仲有 20 分鐘', urgent: true, gone: false });
  });
  it('after last bus → next bus tomorrow', () => {
    const info = lastBusAt(normal, 'B', 'O', calendar, hk(23, 50));
    expect(info?.last).toBe(hk(23, 40));
    expect(info?.nextFirst).toBe(hk(6, 10) + DAY);
    expect(lastBusText(info, hk(23, 50))?.text).toBe('尾班車已經開走 · 下一班約 聽日 06:10');
  });
  it('after midnight: last night\'s trips still running (departure 1470 = 00:30)', () => {
    const info = lastBusAt([v([...every(360, 1440, 20), 1470])], 'B', 'O', calendar, hk(0, 20));
    expect(info?.last).toBe(hk(0, 40));
  });
  it('null when no timetable or stop not on variant', () => {
    expect(lastBusAt([v([])], 'B', 'O', calendar, hk(12))).toBeNull();
    expect(lastBusAt(normal, 'Z', 'O', calendar, hk(12))).toBeNull();
  });
  it('uses latest across variants (special trips included)', () => {
    const special = v([1380], 300); // 特別班 23:00 開，5 分鐘到 → 23:05；正常班 23:40 仲遲
    expect(lastBusAt([...normal, special], 'B', 'O', calendar, hk(12))?.last).toBe(hk(23, 40));
    const lateSpecial = v([1425], 300); // 特別班 23:45 開 → 23:50，遲過正常班
    expect(lastBusAt([...normal, lateSpecial], 'B', 'O', calendar, hk(12))?.last).toBe(hk(23, 50));
  });
  it('24-hour service (no 3-hour gap) → null', () => {
    expect(lastBusAt([v(every(0, 1439, 30))], 'B', 'O', calendar, hk(12))).toBeNull();
  });
});

describe('overnight route (970X: 00:40–01:30 every 25 min, then 05:30)', () => {
  // 日間 05:30 至 23:50 每 20 分鐘，加通宵 00:40、01:05、01:30；去 B 站 4 分鐘
  const vs = [v([40, 65, 90, ...every(330, 1430, 20)], 240)];
  it('00:25: last bus is the 01:30 departure, not last night\'s', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 25));
    expect(info?.last).toBe(hk(1, 34));
    expect(info?.prev).toBe(hk(1, 9));
    expect(lastBusText(info, hk(0, 25))?.text).toBe('尾班約 01:34');
  });
  it('02:00: gone, next at 05:34', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(2));
    expect(info?.last).toBe(hk(1, 34));
    expect(lastBusText(info, hk(2))?.text).toBe('尾班車已經開走 · 下一班約 05:34');
  });
});

describe('lastBusEtaIndex', () => {
  // 23:40 尾班、23:25 前一班
  const info = lastBusAt(normal, 'B', 'O', calendar, hk(23));
  it('marks the latest real-time bus near the timetable last', () => {
    expect(lastBusEtaIndex([eta(hk(23, 26)), eta(hk(23, 43))], info)).toBe(1);
    // 次序唔重要：揀最遲嗰班
    expect(lastBusEtaIndex([eta(hk(23, 43), 'KMB'), eta(hk(23, 26))], info)).toBe(0);
  });
  it('not when the latest is closer to the previous bus', () => {
    expect(lastBusEtaIndex([eta(hk(23, 12)), eta(hk(23, 28))], info)).toBe(-1);
  });
  it('not when too far from the timetable', () => {
    expect(lastBusEtaIndex([eta(hk(23, 59))], { ...info!, prev: null })).toBe(-1);
    expect(lastBusEtaIndex([], info)).toBe(-1);
    expect(lastBusEtaIndex([eta(hk(23, 40))], null)).toBe(-1);
  });
  it('company already gave 3 buses: later ones may be hidden', () => {
    expect(lastBusEtaIndex([eta(hk(23, 12)), eta(hk(23, 20)), eta(hk(23, 33))], { ...info!, prev: null })).toBe(-1);
    expect(lastBusEtaIndex([eta(hk(23, 12)), eta(hk(23, 20)), eta(hk(23, 39))], { ...info!, prev: null })).toBe(2);
  });
  it('delayed last bus after the estimated time still counts', () => {
    const late = lastBusAt(normal, 'B', 'O', calendar, hk(23, 45));
    expect(lastBusEtaIndex([eta(hk(23, 50))], late)).toBe(0);
    expect(lastBusText(late, hk(23, 45), hk(23, 50))).toEqual({ text: '尾班車 23:50 · 仲有 5 分鐘', urgent: true, gone: false });
  });
});

describe('after midnight (bug 2026-11-09)', () => {
  // 尾班 23:35 開、到 B 站 23:45；頭班 06:00
  const vs = [v([...every(360, 1410, 15), 1415])];
  it('00:03: last night\'s last bus has gone, next 06:10 today', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 3));
    expect(info?.last).toBe(hk(23, 45) - DAY);
    expect(info?.nextFirst).toBe(hk(6, 10));
    expect(lastBusText(info, hk(0, 3))?.text).toBe('尾班車已經開走 · 下一班約 06:10');
  });
  it('00:04: a late last bus still shown in ETAs is recognised', () => {
    // 595 實例：時間表尾班 23:58 到呢個站，實際遲咗，00:04 先到
    const info = lastBusAt([v(every(360, 1428, 12))], 'B', 'O', calendar, hk(0, 4));
    expect(info?.last).toBe(hk(23, 58) - DAY);
    expect(lastBusEtaIndex([eta(hk(0, 4) + 20_000)], info)).toBe(0);
    expect(lastBusText(info, hk(0, 4), hk(0, 4) + 20_000)?.text).toBe('尾班車 00:04 · 即將到站');
    // ETA 啱啱過咗 20 秒：車喺站，仲係尾班
    expect(lastBusText(info, hk(0, 4) + 40_000, hk(0, 4) + 20_000)?.text).toBe('尾班車 00:04 · 即將到站');
  });
  it('daytime: today\'s last', () => {
    expect(lastBusAt(vs, 'B', 'O', calendar, hk(7))?.last).toBe(hk(23, 45));
  });
});

describe('adjustLastBus (107 at night: estimate 00:45, real 00:28)', () => {
  // 每 20 分鐘，尾班 23:55 開，時間表估 50 分鐘到呢個站 → 00:45；前一班 23:35 → 00:25
  const vs = [v(every(355, 1435, 20), 3000)];
  it('scales the estimate by live travel time', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 15) + DAY);
    expect(info?.last).toBe(hk(0, 45) + DAY);
    // 實測而家只要 33 分鐘
    const adj = adjustLastBus(info, 33)!;
    expect(adj.last).toBe(hk(0, 28) + DAY);
    // 冇校正：00:28 近前一班（00:25）多過尾班（00:45）→ 認唔到；校正後認到
    const etas = [eta(hk(0, 28) + DAY)];
    expect(lastBusEtaIndex(etas, info)).toBe(-1);
    expect(lastBusEtaIndex(etas, adj)).toBe(0);
  });
  it('no live data or tiny offsets → unchanged', () => {
    const info = lastBusAt(vs, 'B', 'O', calendar, hk(0, 15) + DAY);
    expect(adjustLastBus(info, null)).toBe(info);
    expect(adjustLastBus({ last: 1, nextFirst: null, offsetMin: 2 }, 1)?.last).toBe(1);
  });
});

describe('minutesToStop: 城巴獨有站', () => {
  it('interpolates between neighbouring government stops by CTB order', () => {
    // 政府站 A(0)、C(600 秒)；城巴獨有站 B 喺中間
    const vv = { id: 'x', stops: ['A', 'C'], stopDirs: ['O', 'O'], offsets: [0, 600], expSeq: { 'O:A': 1, 'O:B': 2, 'O:C': 3 }, schedules: [{ serviceId: 'D', departures: every(360, 1410, 15) }] } as unknown as Variant;
    expect(minutesToStop(vv, 'B', 'O')).toBe(5);
    expect(lastBusAt([vv], 'B', 'O', calendar, hk(20))?.last).toBe(hk(23, 35));
    expect(minutesToStop(vv, 'Z', 'O')).toBeNull();
  });
});
