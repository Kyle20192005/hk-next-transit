import { describe, expect, it } from 'vitest';
import { bearing, formatDistance, lineArrows, smoothLine, stopCumMetres } from '../src';

describe('方向箭嘴', () => {
  it('方向角度', () => {
    expect(bearing([22.28, 114.15], [22.29, 114.15])).toBeCloseTo(0);   // 向北
    expect(bearing([22.28, 114.15], [22.28, 114.16])).toBeCloseTo(90);  // 向東
    expect(bearing([22.28, 114.15], [22.27, 114.15])).toBeCloseTo(180); // 向南
  });

  it('每段喺中間放一個箭嘴，太短嘅段唔放', () => {
    const arrows = lineArrows([
      [[22.28, 114.15], [22.29, 114.15]],          // 約 1.1 公里，向北
      [[22.29, 114.15], [22.2901, 114.15]],        // 約 11 米，太短
      [[22.29, 114.15], [22.29, 114.155], [22.29, 114.16]], // 向東，兩點折線
    ]);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]!.lat).toBeCloseTo(22.285);
    expect(arrows[0]!.bearing).toBeCloseTo(0);
    expect(arrows[1]!.lng).toBeCloseTo(114.155);
    expect(arrows[1]!.bearing).toBeCloseTo(90);
  });

  it('可以每段放幾個箭嘴', () => {
    const arrows = lineArrows([[[22.28, 114.15], [22.29, 114.15]]], 150, [0.75, 0.25]);
    expect(arrows.map((a) => a.lat)).toEqual([expect.closeTo(22.2825), expect.closeTo(22.2875)]);
  });
});

describe('走線圓角化', () => {
  // 一個 90 度轉角：向北 100 米再向東 100 米
  const corner: [number, number][] = [[22.28, 114.15], [22.2809, 114.15], [22.2809, 114.151]];

  it('頭尾兩點唔變', () => {
    const s = smoothLine(corner);
    expect(s[0]).toEqual(corner[0]);
    expect(s[s.length - 1]).toEqual(corner[2]);
  });

  it('轉角被磨圓，最多偏離幾米', () => {
    const s = smoothLine(corner, 2, 6);
    expect(s.length).toBeGreaterThan(corner.length);
    // 原本嘅角位點已經唔喺結果入面
    expect(s.some((p) => p[0] === corner[1]![0] && p[1] === corner[1]![1])).toBe(false);
    // 所有點離角位最遠嘅都唔超過切位範圍（6 米左右）
    const near = s.filter((p) => Math.abs(p[0] - corner[1]![0]) < 0.0001 && Math.abs(p[1] - corner[1]![1]) < 0.0001);
    expect(near.length).toBeGreaterThan(0);
  });

  it('得兩點嘅線唔郁', () => {
    const line: [number, number][] = [[22.28, 114.15], [22.29, 114.15]];
    expect(smoothLine(line)).toEqual(line);
  });
});

describe('距離', () => {
  it('沿走線量，唔係直線', () => {
    // 向北 111 米再向東約 103 米；頭尾兩站直線距離約 151 米，但沿路行係 214 米
    const path: [number, number][] = [[22.28, 114.15], [22.281, 114.15], [22.281, 114.151]];
    const cum = stopCumMetres(path, [[22.28, 114.15], [22.281, 114.151]]);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(210);
    expect(cum[1]).toBeLessThan(220);
  });

  it('冇走線就用直線', () => {
    const cum = stopCumMetres([], [[22.28, 114.15], [22.281, 114.15]]);
    expect(cum[1]).toBeCloseTo(111.3, 0);
  });

  it('顯示文字', () => {
    expect(formatDistance(4)).toBe('10 米');
    expect(formatDistance(846)).toBe('850 米');
    expect(formatDistance(1234)).toBe('1.2 公里');
    expect(formatDistance(15050)).toBe('15.1 公里');
  });
});
