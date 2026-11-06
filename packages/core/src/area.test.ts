import { describe, expect, it } from 'vitest';
import { pickArea, type Place } from './area';

const p = (n: string, t: string, lat: number, lng: number): Place => ({ n, en: null, t, lat, lng });

describe('pickArea', () => {
  it('揀最近嘅地區；屋苑（neighbourhood）要近好多先贏', () => {
    const places = [p('金鐘', 'suburb', 22.2795, 114.165), p('某屋苑', 'neighbourhood', 22.2795, 114.1662)];
    // 用戶喺兩者中間偏屋苑少少：屋苑權重大，都係揀金鐘
    expect(pickArea(places, 22.2795, 114.1657)?.n).toBe('金鐘');
    // 好近屋苑就揀屋苑
    expect(pickArea(places, 22.2795, 114.1662)?.n).toBe('某屋苑');
  });
  it('2 公里內冇就 null', () => {
    expect(pickArea([p('元朗', 'town', 22.44, 114.03)], 22.28, 114.16)).toBeNull();
  });
});
