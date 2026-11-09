import { describe, expect, it } from 'vitest';
import { fareMoney, NO_FARE_ENDS, RAIL_FARE_TYPES, setFareEnd, swapFareEnds } from './rail-fare';

describe('車費計算', () => {
  it('一個起點、一個終點；同一個站唔可以兩邊都係', () => {
    let e = setFareEnd(NO_FARE_ENDS, 'TIS', 'from');
    expect(e).toEqual({ from: 'TIS', to: null });
    e = setFareEnd(e, 'CEN', 'to');
    expect(e).toEqual({ from: 'TIS', to: 'CEN' });
    // 換起點：舊起點冇咗
    e = setFareEnd(e, 'YUL', 'from');
    expect(e).toEqual({ from: 'YUL', to: 'CEN' });
    // 終點揀咗起點個站：起點清走
    e = setFareEnd(e, 'YUL', 'to');
    expect(e).toEqual({ from: null, to: 'YUL' });
    expect(swapFareEnds({ from: 'A', to: 'B' })).toEqual({ from: 'B', to: 'A' });
  });
  it('車費種類覆蓋晒 9 個欄位', () => {
    expect(RAIL_FARE_TYPES.map((t) => t.i).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fareMoney(29.3)).toBe('$29.3');
    expect(fareMoney(5)).toBe('$5.0');
    expect(fareMoney(null)).toBe('—');
  });
});
