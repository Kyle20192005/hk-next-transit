import { describe, expect, it } from 'vitest';
import { activeFavGroup, cleanFavGroups, favGroupWindowLabel, favsForNow, favsInGroup, type FavGroupDef } from './fav-groups';

const hk = (h: number, m = 0) => Date.UTC(2026, 10, 9, h - 8, m);
const groups: FavGroupDef[] = [
  { id: 'w', name: '返工', from: 360, to: 660 },
  { id: 'h', name: '返屋企', from: 1020, to: 1320 },
  { id: 'n', name: '夜', from: 1320, to: 120 },
  { id: 'x', name: '週末' },
];

describe('fav groups', () => {
  it('active group by HK time, including across midnight', () => {
    expect(activeFavGroup(groups, hk(8))?.id).toBe('w');
    expect(activeFavGroup(groups, hk(18))?.id).toBe('h');
    expect(activeFavGroup(groups, hk(23, 30))?.id).toBe('n');
    expect(activeFavGroup(groups, hk(1))?.id).toBe('n');
    expect(activeFavGroup(groups, hk(13))).toBeNull();
  });
  it('filters and orders', () => {
    const favs = [{ r: 1, group: 'h' }, { r: 2, group: 'w' }, { r: 3 }, { r: 4, group: 'gone' }];
    expect(favsInGroup(favs, 'w', groups).map((f) => f.r)).toEqual([2]);
    expect(favsInGroup(favs, 'none', groups).map((f) => f.r)).toEqual([3, 4]);
    expect(favsInGroup(favs, 'all', groups)).toHaveLength(4);
    const { favs: ordered, active } = favsForNow(favs, groups, hk(8));
    expect(active?.name).toBe('返工');
    expect(ordered.map((f) => f.r)).toEqual([2, 1, 3, 4]);
  });
  it('cleans stored data', () => {
    expect(cleanFavGroups([{ id: 'a', name: ' 返工 ', from: 360, to: 660 }, { id: 'b', name: '' }, { id: 'c', name: 'X', from: 9999, to: 1 }, null])).toEqual([
      { id: 'a', name: '返工', from: 360, to: 660 },
      { id: 'c', name: 'X' },
    ]);
    expect(favGroupWindowLabel({ from: 1320, to: 120 })).toBe('22:00–02:00');
  });
});
