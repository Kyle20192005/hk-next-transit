import { describe, expect, it } from 'vitest';
import { pickArea, type Place } from './area';

const p = (n: string, t: string, lat: number, lng: number): Place => ({ n, en: null, t, lat, lng });

describe('pickArea', () => {
  it('揀最近嘅地區；屋苑（neighbourhood）要近好多先贏', () => {
    const places = [p('金鐘', 'suburb', 22.2795, 114.165), p('某屋苑', 'neighbourhood', 22.2795, 114.1662)];
    // 用戶喺兩者中間偏屋苑：屋苑權重大，都係揀金鐘
    expect(pickArea(places, 22.2795, 114.1659)?.n).toBe('金鐘');
    // 企喺屋苑就揀屋苑
    expect(pickArea(places, 22.2795, 114.1662)?.n).toBe('某屋苑');
  });
  it('村名只喺冇其他地區名先用', () => {
    const places = [p('青衣南', 'suburb', 22.35, 114.1), p('涌美老屋村', 'village', 22.3505, 114.1045)];
    expect(pickArea(places, 22.3505, 114.1042)?.n).toBe('青衣南');
    expect(pickArea([places[1]!], 22.3505, 114.1042)?.n).toBe('涌美老屋村');
  });
  it('2 公里內冇就 null', () => {
    expect(pickArea([p('元朗', 'town', 22.44, 114.03)], 22.28, 114.16)).toBeNull();
  });
});
