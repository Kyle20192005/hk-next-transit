import { describe, expect, it } from 'vitest';
import { normalizePlace, placeMatches, searchStopRoutes } from './stop-search';
import type { AnyStopEntry } from './stop-live';

const stops: AnyStopEntry[] = [
  { id: 'A', co: 'ctb', n: '北角碼頭, 渣華道', lat: 0, lng: 0, r: [['ctb', '2', 'O', '筲箕灣'], ['ctb', '2', 'I', '中環']] },
  { id: 'B', co: 'ctb', n: '北角道, 英皇道', lat: 0, lng: 0, r: [['ctb', '2', 'O', '筲箕灣'], ['ctb', '8', 'O', '小西灣']] },
  { id: 'C', co: 'kmb', n: '觀塘 (裕民坊)', lat: 0, lng: 0, r: [['ctb', '101', 'I', '堅尼地城']] },
];

describe('searchStopRoutes', () => {
  it('finds routes through intermediate stops, one per route+dir', () => {
    expect(searchStopRoutes(stops, '北角').map((h) => `${h.route}${h.dir}@${h.stopId}`)).toEqual(['2O@A', '2I@A', '8O@B']);
  });
  it('ignores spaces, brackets and width', () => {
    expect(searchStopRoutes(stops, '觀塘(裕民坊)')).toHaveLength(1);
    expect(searchStopRoutes(stops, ' 渣華 道 ')).toHaveLength(2);
    expect(normalizePlace('ＡＢ （1）')).toBe('ab1');
  });
  it('empty query and limit', () => {
    expect(searchStopRoutes(stops, '  ')).toEqual([]);
    expect(searchStopRoutes(stops, '北角', 1)).toHaveLength(1);
  });
});

describe('placeMatches', () => {
  const routes = [
    { co: 'ctb' as const, route: '8', origTc: '灣仔', destTc: '小西灣' },
    { co: 'ctb' as const, route: '2', origTc: '中環', destTc: '筲箕灣' },
    { co: 'ctb' as const, route: '18', origTc: '北角碼頭', destTc: '堅尼地城' },
  ];
  it('ends first, then routes passing through', () => {
    const hits = searchStopRoutes(stops, '北角');
    const m = placeMatches(routes, '北角', hits);
    expect(m.map((x) => x.r.route)).toEqual(['18', '8', '2']);
    expect(m[2]!.via.O?.stopName).toBe('北角碼頭, 渣華道');
    expect(m[1]!.via.I).toBeUndefined();
  });
  it('no via hint when the matched stop is where that direction starts', () => {
    const r = [{ co: 'ctb' as const, route: '2', origTc: '中環', destTc: '北角碼頭' }];
    const m = placeMatches(r, '北角', searchStopRoutes(stops, '北角'));
    expect(m[0]!.via.O?.stopId).toBe('A');
    expect(m[0]!.via.I).toBeUndefined();
  });
  it('without hits behaves like before', () => {
    expect(placeMatches(routes, '北角', []).map((x) => x.r.route)).toEqual(['18']);
    expect(placeMatches(routes, '', [])).toHaveLength(3);
  });
});
