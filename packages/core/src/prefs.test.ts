import { describe, expect, it } from 'vitest';
import { cleanPrefs, DEFAULT_PREFS, etaParts, etaRest, orderedModes } from './prefs';
import { minutesLabel } from './departures';

describe('prefs', () => {
  it('cleans unknown values', () => {
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(cleanPrefs({ theme: 'dark', nearbyRadius: 999, autoLocate: false })).toEqual({ ...DEFAULT_PREFS, theme: 'dark', autoLocate: false });
  });
  it('orders modes by priority', () => {
    expect(orderedModes('rail')[0]!.id).toBe('rail');
    expect(orderedModes('bus').map((m) => m.id)).toEqual(['bus', 'rail', 'minibus', 'ferry', 'tram']);
  });
  it('formats eta', () => {
    const now = Date.parse('2026-11-06T10:00:00Z'); // 18:00 HK
    expect(etaParts(now + 5 * 60000, now, 'minutes')).toEqual({ main: '5', unit: '分' });
    expect(etaParts(now + 5 * 60000, now, 'clock')).toEqual({ main: '18:05', unit: '' });
    expect(etaParts(now + 10000, now, 'clock')).toEqual({ main: '即將', unit: '' });
    expect(etaRest([now + 12 * 60000, now + 20 * 60000], now, 'minutes')).toBe('12、20 分');
    expect(etaRest([now + 12 * 60000], now, 'clock')).toBe('18:12');
    expect(minutesLabel(now + 7 * 60000, now, 'clock')).toBe('18:07');
  });
});
