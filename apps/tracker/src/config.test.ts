import { describe, expect, it } from 'vitest';
import { DEFAULT_RPS_BY_HOST, parseRpsByHost } from './config';

describe('parseRpsByHost', () => {
  it('冇環境變數：用內置上限（專線小巴 8）', () => {
    expect(parseRpsByHost(undefined)).toEqual({ 'data.etagmb.gov.hk': 8 });
    expect(parseRpsByHost('')).toEqual(DEFAULT_RPS_BY_HOST);
  });
  it('舊環境變數（冇寫小巴）：照加內置小巴上限', () => {
    expect(parseRpsByHost('rt.data.gov.hk=20, data.etabus.gov.hk=10')).toEqual({
      'data.etagmb.gov.hk': 8,
      'rt.data.gov.hk': 20,
      'data.etabus.gov.hk': 10,
    });
  });
  it('環境變數蓋過內置；壞咗嘅項目唔理', () => {
    expect(parseRpsByHost('data.etagmb.gov.hk=5,bad,x=0,y=abc')).toEqual({ 'data.etagmb.gov.hk': 5 });
  });
});
