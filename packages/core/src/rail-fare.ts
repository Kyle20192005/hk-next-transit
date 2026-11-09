/**
 * 港鐵、輕鐵車費計算（路綫圖右上角「車費」）：撳站揀起點、終點（一定係一個起點、一個終點），
 * 車費表由伺服器俾（/api/mtr/fare、/api/lrt/fare，港鐵開放數據）。港鐵同輕鐵分開計。
 * 車費陣列次序（tools/mtr-fares.py、lrt-fares.py 一樣）：[八達通成人, 小童, 長者, 殘疾, 學生, 樂悠咭, 單程成人, 單程小童, 單程長者]
 */
export const RAIL_FARE_TYPES: readonly { i: number; group: '八達通' | '單程票'; zh: string }[] = [
  { i: 0, group: '八達通', zh: '成人' },
  { i: 4, group: '八達通', zh: '學生' },
  { i: 1, group: '八達通', zh: '小童' },
  { i: 2, group: '八達通', zh: '長者' },
  { i: 3, group: '八達通', zh: '殘疾人士' },
  { i: 5, group: '八達通', zh: '樂悠咭（60–64 歲）' },
  { i: 6, group: '單程票', zh: '成人' },
  { i: 7, group: '單程票', zh: '小童' },
  { i: 8, group: '單程票', zh: '長者' },
];

/** 機場快綫獨有站（機場、博覽館）：車費表只有同香港、九龍、青衣之間（機場快綫車費，只有成人、小童，其他係 null） */
export const AEL_ONLY_STATIONS: readonly string[] = ['AIR', 'AWE'];

export type FareRole = 'from' | 'to';
export interface FareEnds {
  from: string | null;
  to: string | null;
}
export const NO_FARE_ENDS: FareEnds = { from: null, to: null };

/** 揀一個站做起點／終點：一定係一個起點、一個終點；揀咗另一邊嘅站就將另一邊清走（唔會起點終點同一個站） */
export function setFareEnd(ends: FareEnds, sta: string, role: FareRole): FareEnds {
  return role === 'from' ? { from: sta, to: ends.to === sta ? null : ends.to } : { to: sta, from: ends.from === sta ? null : ends.from };
}

/** 起點終點對調 */
export const swapFareEnds = (ends: FareEnds): FareEnds => ({ from: ends.to, to: ends.from });

/** 錢銀顯示，例如 29.3 → 「$29.3」；冇資料（機場快綫冇長者等）→「—」 */
export const fareMoney = (n: number | null | undefined) => (n == null ? '—' : '$' + n.toFixed(1));
