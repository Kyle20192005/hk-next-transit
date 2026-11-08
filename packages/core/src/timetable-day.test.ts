import { describe, expect, it } from 'vitest';
import { runMinutes, statusText, timetableDay, timetableMarker, timetablePeriods, variantStatus } from './index';
import type { Calendar, Variant } from './types';

const calendar: Calendar = { D: { days: [true, true, true, true, true, true, true], start: '20200101', end: '20991231', add: [], remove: [] } } as unknown as Calendar;
// A10：06:50–09:50 每 60 分鐘、10:30–24:00 每 30 分鐘、翌日 00:20；全程 50 分鐘
const deps = [410, 470, 530, 590, ...Array.from({ length: 28 }, (_, i) => 630 + i * 30), 1460];
const a10 = { id: 'x', stops: ['A', 'B'], stopDirs: ['O', 'O'], offsets: [0, 3000], schedules: [{ serviceId: 'D', departures: deps }] } as unknown as Variant;
const hkDate = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 9, h - 8, m));

describe('A10 at 00:31 (last trip 00:20 still on the road)', () => {
  it('status: 尾班車已開出', () => {
    const s = variantStatus(a10, calendar, hkDate(0, 31));
    expect(s.state).toBe('lastRunning');
    expect(statusText(s)).toBe('尾班車已開出');
  });
  it('timetable stays on last night: 翌日 00:20 marked lastRunning, not 06:50 next', () => {
    const day = timetableDay({ schedules: a10.schedules, runMin: runMinutes(a10) }, calendar, hkDate(0, 31));
    expect(day.minutes).toBe(1471);
    const periods = timetablePeriods(deps);
    expect(timetableMarker(periods, day.minutes, 50)).toEqual({ index: periods.length - 1, kind: 'lastRunning' });
  });
  it('after the last trip reached the terminus (01:20): today, next = 06:50', () => {
    const day = timetableDay({ schedules: a10.schedules, runMin: runMinutes(a10) }, calendar, hkDate(1, 20));
    expect(day.minutes).toBe(80);
    expect(variantStatus(a10, calendar, hkDate(1, 20)).state).toBe('later');
    const periods = timetablePeriods(deps);
    expect(timetableMarker(periods, day.minutes, 50)).toEqual({ index: 0, kind: 'next' });
  });
  it('daytime: normal running', () => {
    expect(variantStatus(a10, calendar, hkDate(12)).state).toBe('running');
    const periods = timetablePeriods(deps);
    expect(timetableMarker(periods, 720, 50)?.kind).toBe('now');
  });
});
