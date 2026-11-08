import { describe, expect, it } from 'vitest';
import { NEARBY_FRESH_MS, NEARBY_KEEP_MS, nearbyCacheUse, nearbyMoved, parseNearbyCache } from './nearby-cache';

const c = { at: 1_000_000, radius: 600, lat: 22.3, lng: 114.2, stops: [], area: null };

describe('nearby cache', () => {
  it('fresh / stale / expired', () => {
    expect(nearbyCacheUse(c, c.at + 10_000, 600)).toBe('fresh');
    expect(nearbyCacheUse(c, c.at + NEARBY_FRESH_MS + 1, 600)).toBe('stale');
    expect(nearbyCacheUse(c, c.at + NEARBY_KEEP_MS + 1, 600)).toBeNull();
  });
  it('radius changed → not used', () => {
    expect(nearbyCacheUse(c, c.at, 300)).toBeNull();
    expect(nearbyCacheUse(null, c.at, 600)).toBeNull();
  });
  it('parse rejects junk', () => {
    expect(parseNearbyCache('{')).toBeNull();
    expect(parseNearbyCache('{"at":1}')).toBeNull();
    expect(parseNearbyCache(JSON.stringify(c))).toEqual(c);
  });
  it('moved', () => {
    expect(nearbyMoved(c, { lat: 22.3001, lng: 114.2 })).toBe(false); // 約 11 米
    expect(nearbyMoved(c, { lat: 22.301, lng: 114.2 })).toBe(true); // 約 111 米
  });
});
