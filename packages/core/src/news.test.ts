import { describe, expect, it } from 'vitest';
import { mentionsAny, newsTitle, placeTokens } from './news';

describe('placeTokens', () => {
  it('拆站名、拎走括號同普通字', () => {
    expect(placeTokens(['海富中心, 夏慤道', '金鐘站 (A1)', '巴士總站', '中環 (交易廣場)'])).toEqual(['海富中心', '夏慤道', '金鐘站', '中環']);
  });
});

describe('mentionsAny', () => {
  it('內文有提到其中一個地方名', () => {
    expect(mentionsAny('因水管爆裂，夏慤道(往中環方向)的慢線現已封閉。', ['海富中心', '夏慤道'])).toBe(true);
    expect(mentionsAny('錦田公路封閉', ['夏慤道'])).toBe(false);
  });
});

describe('newsTitle', () => {
  it('第一句', () => {
    expect(newsTitle('因交通意外，錦田公路部份行車線現已封閉。 \n駕駛人士只可使用餘下行車線行車。')).toBe('因交通意外，錦田公路部份行車線現已封閉');
  });
});

describe('toggleTool', () => {
  it('最多 4 個、最少 1 個，加嘅放最後', async () => {
    const { toggleTool, cleanTools, swapTools } = await import('./news');
    expect(swapTools(['routes', 'nearby', 'favs'], 'routes', 'favs')).toEqual(['favs', 'nearby', 'routes']);
    expect(toggleTool(['routes', 'nearby', 'favs', 'news'], 'nav')).toEqual(['routes', 'nearby', 'favs', 'news']);
    expect(toggleTool(['routes', 'nearby'], 'nav')).toEqual(['routes', 'nearby', 'nav']);
    expect(toggleTool(['routes'], 'routes')).toEqual(['routes']);
    expect(cleanTools(['bogus', 'favs'])).toEqual(['favs']);
    expect(cleanTools(['favs', 'favs', 'rail'])).toEqual(['favs', 'rail']);
    expect(cleanTools(null)).toEqual(['routes', 'nearby', 'favs', 'news']);
  });
});
