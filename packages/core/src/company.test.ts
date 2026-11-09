import { describe, expect, it } from 'vitest';
import { COMPANIES, companyColor, companyInfo, companyInk, companyNames } from './company';
import { TRANSPORT_MODES } from './transport';

/** WCAG 對比度 */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe('GMB company', () => {
  it('name, colour and readable ink', () => {
    expect(COMPANIES.GMB.name).toBe('專線小巴');
    // 同「小巴」分類色一樣
    expect(COMPANIES.GMB.bg).toBe(TRANSPORT_MODES.find((m) => m.id === 'minibus')!.color);
    expect(contrast(COMPANIES.GMB.bg, COMPANIES.GMB.ink)).toBeGreaterThanOrEqual(4.5);
    expect(companyColor('GMB')).toBe('#1E9E5A');
    expect(companyInk('GMB')).toBe('#0A1F12');
    expect(companyNames(['GMB'])).toBe('專線小巴');
  });
  it('minibus mode is ready', () => {
    expect(TRANSPORT_MODES.find((m) => m.id === 'minibus')!.ready).toBe(true);
  });
});

describe('companyInfo', () => {
  it('known companies', () => {
    expect(companyInfo('CTB')).toBe(COMPANIES.CTB);
    expect(companyInfo('GMB').name).toBe('專線小巴');
  });
  it('unknown companies never throw', () => {
    expect(companyInfo('XYZ')).toEqual({ name: 'XYZ', bg: '#666666', ink: '#ffffff' });
    expect(companyInfo(undefined).name).toBe('');
    expect(companyInfo('toString').name).toBe('toString');
  });
});
