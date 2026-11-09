import { describe, expect, it } from 'vitest';
import { CO_LIST, isCo, SAFE_ROUTE, SAFE_STOP } from './ids';

describe('isCo', () => {
  it('knows gmb', () => {
    expect(CO_LIST).toContain('gmb');
    expect(isCo('gmb')).toBe(true);
    expect(isCo('ctb')).toBe(true);
    expect(isCo('GMB')).toBe(false);
    expect(isCo('xyz')).toBe(false);
  });
});

describe('SAFE_ROUTE', () => {
  it('bus numbers still pass', () => {
    for (const r of ['1', '101', 'A11', 'N8P', '1a', 'ABCDEF']) expect(SAFE_ROUTE.test(r), r).toBe(true);
  });
  it('minibus keys: region + code', () => {
    for (const r of ['NT-2', 'KLN-25MS', 'HKI-116H', 'nt-2', 'HKI-4A']) expect(SAFE_ROUTE.test(r), r).toBe(true);
  });
  it('rejects anything else', () => {
    for (const r of ['', 'ABCDEFG', 'XX-2', 'NT-', 'NT-2-3', 'NT-ABCDEF', '-2', '1 1', '../x', 'NT_2']) expect(SAFE_ROUTE.test(r), r).toBe(false);
  });
});

describe('SAFE_STOP', () => {
  it('accepts every company', () => {
    for (const s of ['001234', '20003337', '0123456789ABCDEF', 'K76-U010', 'K52-nD010', '506-D010']) expect(SAFE_STOP.test(s), s).toBe(true);
  });
  it('minibus stop ids are exactly 8 digits', () => {
    expect(SAFE_STOP.test('2000333')).toBe(false);
    expect(SAFE_STOP.test('200033377')).toBe(false);
  });
});
