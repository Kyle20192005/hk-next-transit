import { describe, expect, it } from 'vitest';
import { isLrtStop, lrtRoute, lrtStopName, lrtStopRoutes, lrtTrainEta, nearestLrtStops, parseLrtSchedule, searchLrtStops, lrtByRoute, lrtDepartureRows, lrtRecent, lrtRouteName, lrtRouteStopIds, nearestRailStation, railCardStations, type LrtTrain } from './lrt';
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

describe('lrtByRoute', () => {
  it('按路線、目的地分組，記住月台，按路線次序同時間排', () => {
    const tr = (route: string, dest: string, mins: number | null, extra: Partial<LrtTrain> = {}): LrtTrain => ({ route, dest, destEn: '', mins, cars: 1, ...extra });
    const groups = lrtByRoute([
      { platform: '1', trains: [tr('761P', '天逸', 6), tr('761P', '天逸', 13)] },
      { platform: '3', trains: [tr('610', '屯門碼頭', 19), tr('610', '屯門碼頭', 7)] },
      { platform: '4', trains: [tr('615', '屯門碼頭', 11), tr('610', '屯門碼頭', null), tr('610', '元朗', 0, { status: 'arriving' })] },
    ]);
    expect(groups.map((g) => `${g.route}${g.dest}`)).toEqual(['610元朗', '610屯門碼頭', '615屯門碼頭', '761P天逸']);
    const g610 = groups[1]!;
    expect(g610.trains.map((t) => [t.platform, t.mins])).toEqual([
      ['3', 7],
      ['3', 19],
      ['4', null],
    ]);
  });
});

describe('輕鐵首頁卡、最近、最近鐵路站', () => {
  const tr = (route: string, dest: string, mins: number | null, extra: Partial<LrtTrain> = {}): LrtTrain => ({ route, dest, destEn: '', mins, cars: 1, ...extra });
  it('lrtDepartureRows：每條路線每個目的地一行，按時間排，有月台同正在離開', () => {
    const now = 1_000_000;
    const rows = lrtDepartureRows('600', [
      { platform: '2', trains: [tr('614', '屯門碼頭', 8)] },
      { platform: '3', trains: [tr('610', '屯門碼頭', 3), tr('610', '屯門碼頭', 15)] },
      { platform: '5', trains: [tr('761P', '天逸', 0, { status: 'departing' })] },
    ], now);
    expect(rows.map((r) => [r.badge.text, r.platform, r.at === null ? null : (r.at - now) / 60000, r.nowText ?? ''])).toEqual([
      ['761P', '5', 0, '正在離開'],
      ['610', '3', 3, ''],
      ['614', '2', 8, ''],
    ]);
    expect(rows[0]!.link).toEqual({ co: 'lrt', route: '761P', dir: 'O', stop: '600' });
  });
  it('lrtRecent', () => {
    expect(lrtRecent('600')).toMatchObject({ co: 'lrt', route: '600', dest: '元朗' });
  });
  it('nearestRailStation：港鐵同輕鐵邊個近出邊個', () => {
    // 天水圍輕鐵站附近（LRT_STOP_LL 430）
    const [lat, lng] = [22.4481, 114.0049];
    const r = nearestRailStation([{ sta: 'TIS', distance: 5000 }], lat, lng);
    expect(r?.kind).toBe('lrt');
    expect(nearestRailStation([{ sta: 'TIS', distance: 10 }], lat, lng)?.kind).toBe('mtr');
    // 市區（旺角）冇輕鐵
    expect(nearestRailStation([{ sta: 'MOK', distance: 200 }], 22.3193, 114.1694)).toEqual({ kind: 'mtr', sta: 'MOK', distance: 200 });
    expect(nearestRailStation([], 22.3193, 114.1694)).toBeNull();
  });
  it('railCardStations：港鐵卡加 800 米內輕鐵站，按距離排', () => {
    const cards = railCardStations([{ sta: 'TIS', distance: 300 }], 22.4481, 114.0049);
    expect(cards.some((c) => c.kind === 'lrt')).toBe(true);
    expect(cards.map((c) => c.distance)).toEqual([...cards.map((c) => c.distance)].sort((a, b) => a - b));
    expect(railCardStations([{ sta: 'MOK', distance: 200 }], 22.3193, 114.1694)).toEqual([{ kind: 'mtr', sta: 'MOK', distance: 200 }]);
  });
});

describe('路線標示', () => {
  it('lrtRouteStopIds、lrtRouteName', () => {
    const ids = lrtRouteStopIds('610').map(lrtStopName);
    expect(ids).toContain('屯門碼頭');
    expect(ids).toContain('元朗');
    expect(new Set(ids).size).toBe(ids.length);
    expect(lrtRouteName('610')).toBe('屯門碼頭 ↔ 元朗');
    expect(lrtRouteName('705')).toBe('天水圍循環綫');
    expect(lrtRouteStopIds('999')).toEqual([]);
  });
});

