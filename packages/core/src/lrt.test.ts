import { describe, expect, it } from 'vitest';
import { isLrtStop, lrtRoute, lrtStopName, lrtStopRoutes, lrtTrainEta, nearestLrtStops, parseLrtSchedule, searchLrtStops } from './lrt';
import { LRT_ROUTE_STOPS, LRT_STOPS } from './lrt-data';
import { LRT_MAP_CAPS, LRT_MAP_LANES, LRT_MAP_STATIONS } from './lrt-map';

describe('lrt', () => {
  it('has routes and stops from the CSV', () => {
    expect(lrtStopName('1')).toBe('屯門碼頭');
    expect(isLrtStop('600')).toBe(true);
    expect(isLrtStop('ADM')).toBe(false);
    expect(lrtStopRoutes('600')).toEqual(['610', '614', '615', '761P']);
    // 總站掉頭重複嘅站只留一次
    expect(LRT_ROUTE_STOPS['507']!['2']![0]).toBe('140');
    expect(LRT_ROUTE_STOPS['507']!['2']![1]).not.toBe('140');
  });
  it('parses platforms, minutes, arriving/departing, cars', () => {
    const p = parseLrtSchedule({
      status: 1,
      platform_list: [
        { platform_id: 1, route_list: [{ route_no: '615P', dest_ch: '兆康', dest_en: 'Siu Hong', time_en: '6 mins', train_length: 1 }, { route_no: '505', dest_ch: '兆康', time_en: '1 min', train_length: 2 }] },
        { platform_id: 2, route_list: [{ route_no: '761P', dest_ch: '元朗', time_en: 'Departing', train_length: 2 }, { route_no: '507', dest_ch: '屯門碼頭', time_en: 'Arriving', train_length: 2 }, { route_no: '615P', dest_ch: '屯門碼頭', time_en: '-', train_length: 2 }] },
      ],
    })!;
    expect(p[0]).toEqual({ platform: '1', trains: [{ route: '615P', dest: '兆康', destEn: 'Siu Hong', mins: 6, cars: 1 }, { route: '505', dest: '兆康', destEn: '', mins: 1, cars: 2 }] });
    expect(p[1]!.trains.map((t) => [t.mins, t.status])).toEqual([[0, 'departing'], [0, 'arriving'], [null, undefined]]);
    expect(parseLrtSchedule({ status: 0 })).toBeNull();
  });
  it('searches stops', () => {
    expect(searchLrtStops('元朗')[0]).toBe('600');
    expect(lrtStopName(searchLrtStops('tin shui wai')[0]!)).toBe('天水圍');
    expect(searchLrtStops('zzz')).toEqual([]);
  });
});

describe('lrtTrainEta', () => {
  it('正在離開、即將到站、分鐘、鐘數、冇時間', () => {
    expect(lrtTrainEta({ mins: 0, status: 'departing' }, 'minutes').main).toBe('正在離開');
    expect(lrtTrainEta({ mins: 0, status: 'arriving' }, 'minutes').main).toBe('即將到站');
    expect(lrtTrainEta({ mins: 6 }, 'minutes')).toEqual({ main: '6', unit: '分鐘', now: false });
    expect(lrtTrainEta({ mins: 6 }, 'clock', Date.parse('2026-11-09T10:00:00+08:00')).main).toBe('10:06');
    expect(lrtTrainEta({ mins: null }, 'minutes').main).toBe('—');
  });
});

describe('LRT_MAP', () => {
  it('每個站都有畫、號碼都係終點站嘅路線', () => {
    expect(LRT_MAP_STATIONS.length).toBe(Object.keys(LRT_STOPS).length);
    for (const c of LRT_MAP_CAPS) expect(lrtRoute(c.r)).toBeTruthy();
    for (const l of LRT_MAP_LANES) expect(l.d.startsWith('M')).toBe(true);
  });
});

describe('nearestLrtStops', () => {
  it('元朗站附近搵到元朗輕鐵站', () => {
    const n = nearestLrtStops(22.4455, 114.0346, 800, 3);
    expect(n.length).toBeGreaterThan(0);
    expect(n.map((x) => lrtStopName(x.sta))).toContain('元朗');
  });
});
