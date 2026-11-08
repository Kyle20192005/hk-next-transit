import { describe, expect, it } from 'vitest';
import { alightSummary, matchStops, nearestStopIndex, routeMinutes, shareText, updatedAgo } from './route-extras';

const hk = (h: number, m = 0) => Date.UTC(2026, 10, 9, h - 8, m);

describe('route extras', () => {
  it('alightSummary', () => {
    expect(alightSummary({ nextAt: hk(0, 17), travelSeconds: 25 * 60, stops: 12, metres: 5200 })).toBe('約 00:42 到 · 12 個站 · 5.2 公里 · 車程約 25 分鐘');
    expect(alightSummary({ nextAt: null, travelSeconds: 90, stops: 1, metres: 20 })).toBe('1 個站 · 車程約 2 分鐘');
  });
  it('nearestStopIndex skips the terminus and far stops', () => {
    const list = [{ lat: 22.3, lng: 114.2 }, { lat: 22.301, lng: 114.2 }, { lat: 22.3, lng: 114.2001 }];
    expect(nearestStopIndex({ lat: 22.3, lng: 114.2 }, list)).toBe(0);
    expect(nearestStopIndex({ lat: 22.4, lng: 114.2 }, list)).toBe(-1);
    expect(nearestStopIndex(undefined, list)).toBe(-1);
  });
  it('routeMinutes', () => {
    expect(routeMinutes({ segSeconds: [600, 900], offsets: [0, 9999] })).toBe(25);
    expect(routeMinutes({ offsets: [0, 1800] })).toBe(30);
    expect(routeMinutes({})).toBeNull();
  });
  it('updatedAgo', () => {
    expect(updatedAgo(0, 5_000)).toBe('啱啱更新');
    expect(updatedAgo(0, 15_000)).toBe('15 秒前更新');
    expect(updatedAgo(0, 125_000)).toBe('2 分鐘前更新');
  });
  it('matchStops', () => {
    expect(matchStops(['黃竹坑醫院, 香港仔隧道', '田灣商場', '黃竹坑站'], '黃竹坑')).toEqual([0, 2]);
    expect(matchStops(['A'], ' ')).toEqual([]);
  });
  it('shareText', () => {
    expect(shareText({ company: '城巴', route: '107', dest: '華貴邨', stop: '田灣商場', nextAt: hk(0, 28), now: hk(0, 23) })).toBe('城巴 107 往 華貴邨｜田灣商場：下一班 5 分鐘（00:28）');
  });
});
