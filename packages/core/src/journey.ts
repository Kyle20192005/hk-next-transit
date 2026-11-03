import type { Eta, Variant } from './types';

/** 由第一個站開始嘅累計行車秒數（長度 = 站數）；冇行車時間數據回傳 null */
export function cumulativeSeconds(v: Pick<Variant, 'segSeconds'>): number[] | null {
  if (!v.segSeconds) return null;
  const out = [0];
  for (const s of v.segSeconds) out.push(out[out.length - 1]! + s);
  return out;
}

export type BusPosition =
  /** 喺第 from 站同第 from+1 站之間，fraction = 已經行咗幾多（0–1） */
  | { state: 'between'; from: number; fraction: number; secondsAway: number; eta: Eta }
  /** 準時到站／已經到 */
  | { state: 'at'; stop: number; secondsAway: number; eta: Eta }
  /** 未由總站開出 */
  | { state: 'notDeparted'; secondsAway: number; eta: Eta };

/**
 * 由某個站嘅 ETA 倒推每架車而家喺邊。
 * 架車仲要 secondsAway 秒先到第 stopIndex 個站，所以由呢個站向後退，累計行車時間夠 secondsAway 嗰段就係佢而家嘅位置。
 */
export function busPositions(cum: number[], stopIndex: number, etas: Eta[], now: Date): BusPosition[] {
  const base = cum[stopIndex];
  if (base === undefined) return [];
  return etas.flatMap((eta): BusPosition[] => {
    if (!eta.eta) return [];
    const secondsAway = (Date.parse(eta.eta) - now.getTime()) / 1000;
    if (secondsAway <= 0) return [{ state: 'at', stop: stopIndex, secondsAway: 0, eta }];
    const target = base - secondsAway; // 架車而家相當於累計時間嘅邊個位置
    if (target < 0) return [{ state: 'notDeparted', secondsAway, eta }];
    for (let i = stopIndex - 1; i >= 0; i--) {
      const a = cum[i]!;
      const b = cum[i + 1]!;
      if (target >= a) {
        return [{ state: 'between', from: i, fraction: b > a ? (target - a) / (b - a) : 0, secondsAway, eta }];
      }
    }
    return [{ state: 'at', stop: 0, secondsAway, eta }];
  });
}

/** 由第 from 個站去之後每個站要幾多秒（之前嘅站係 null） */
export function secondsFrom(cum: number[], from: number): (number | null)[] {
  const base = cum[from] ?? 0;
  return cum.map((c, i) => (i < from ? null : c - base));
}
