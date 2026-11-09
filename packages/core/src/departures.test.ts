import { describe, expect, it } from 'vitest';
import { busDepartureRows, favDepartureRows, groupFavorites, groupStopHeads, minutesLabel } from './departures';

describe('groupStopHeads', () => {
  it('40 米內嘅站併做一個站頭，遠啲嘅另開', () => {
    const s = (id: string, lat: number, distance: number) => ({ id, co: 'ctb', name: id, lat, lng: 114.16, distance });
    const heads = groupStopHeads([s('a', 22.28, 10), s('b', 22.2802, 30), s('c', 22.282, 200)]);
    expect(heads.map((h) => h.stops.map((x) => x.id))).toEqual([['a', 'b'], ['c']]);
    expect(heads[0]!.distance).toBe(10);
  });
});

describe('busDepartureRows', () => {
  const now = Date.parse('2026-11-06T09:00:00+08:00');
  const r = (route: string, mins: number[], company: 'CTB' | 'KMB' = 'CTB') => ({
    co: 'ctb',
    route,
    dir: 'O' as const,
    dest: 'X',
    companies: [company],
    stopId: 's',
    etas: mins.map((m) => ({ eta: new Date(now + m * 60000).toISOString(), company, scheduled: false })),
  });
  it('每條線最快一班，按時間排，最多 4 行，冇班次唔出', () => {
    const rows = busDepartureRows([r('1', [9, 20]), r('2', [3]), r('3', []), r('4', [1]), r('5', [5]), r('6', [7])], now);
    expect(rows.map((x) => x.badge.text)).toEqual(['4', '2', '5', '6']);
  });
  it('已經開走好耐嘅班次跳過，用下一班', () => {
    const rows = busDepartureRows([r('1', [-5, 8])], now);
    expect(Math.round((rows[0]!.at! - now) / 60000)).toBe(8);
  });
  it('標籤用公司色', () => {
    expect(busDepartureRows([r('1', [2], 'KMB')], now)[0]!.badge.bg).toBe('#D01A1E');
  });
});

describe('minutesLabel', () => {
  it('0 分鐘寫即將', () => {
    expect(minutesLabel(1000, 0)).toBe('即將');
    expect(minutesLabel(5 * 60000, 0)).toBe('5 分鐘');
  });
});

describe('groupFavorites', () => {
  const f = (route: string, stopId?: string) => ({ co: 'ctb', route, dir: 'O' as const, dest: 'X', companies: ['CTB' as const], stopId, stopName: stopId ? `站${stopId}` : undefined });
  it('按站分組，淨係路線嘅放最後一組', () => {
    const g = groupFavorites([f('1', 'a'), f('2'), f('3', 'b'), f('4', 'a')]);
    expect(g.map((x) => [x.name, x.favs.map((y) => y.route)])).toEqual([
      ['站a', ['1', '4']],
      ['站b', ['3']],
      ['收藏路線', ['2']],
    ]);
  });
});

describe('favDepartureRows', () => {
  it('有時間嘅排先，冇時間（淨係路線）排最後', () => {
    const now = 0;
    const fav = (route: string) => ({ co: 'ctb', route, dir: 'O' as const, dest: 'X', companies: ['CTB' as const] });
    const rows = favDepartureRows(
      [
        { fav: fav('A'), etas: null },
        { fav: fav('B'), etas: [{ eta: new Date(5 * 60000).toISOString(), company: 'CTB' }] },
        { fav: fav('C'), etas: [{ eta: new Date(2 * 60000).toISOString(), company: 'CTB' }] },
      ],
      now,
    );
    expect(rows.map((r) => r.badge.text)).toEqual(['C', 'B', 'A']);
    expect(minutesLabel(rows[2]!.at, now)).toBe('');
  });
});

describe('orderNearCards', () => {
  it('puts MTR first for rail priority, after bus for bus priority, always keeping MTR cards', async () => {
    const { orderNearCards } = await import('./departures');
    const m = ['m1', 'm2'];
    const b = ['b1', 'b2', 'b3', 'b4', 'b5'];
    expect(orderNearCards(m, b, 'rail', 5)).toEqual(['m1', 'm2', 'b1', 'b2', 'b3']);
    expect(orderNearCards(m, b, 'bus', 5)).toEqual(['b1', 'b2', 'b3', 'm1', 'm2']);
    expect(orderNearCards([], b, 'rail', 5)).toEqual(b);
  });
});
