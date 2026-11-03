import { describe, expect, it } from 'vitest';
import { bearing, lineArrows } from '../src';

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
