import type { Calendar, Eta, RouteData, Variant, VariantGuess } from './types';
import { departuresAround } from './schedule';
import { hkParts } from './time';

/** 時間表推斷容許嘅最大誤差（分鐘） */
const MAX_GAP_MIN = 15;

/**
 * 推斷一班城巴 ETA 屬於邊個政府走法。
 *
 * 城巴 API 每個方向只有一個合併站點列表，ETA 唔講係邊個走法。用兩個線索：
 * 1. ETA 嘅 seq = 嗰班車實際走法入面嘅站序 → 對 variant.expSeq
 * 2. ETA 減行車時間 = 總站開出時間 → 對 GTFS 時間表
 */
export function inferVariant(route: RouteData, eta: Eta, calendar: Calendar): VariantGuess {
  const key = `${eta.dir}:${eta.stopId}`;
  const cands = route.variants.filter((v) => key in v.expSeq);
  if (cands.length === 0) return guess(null, 'unknown', '政府數據冇走法經過呢個站');
  if (cands.length === 1) return guess(cands[0]!, 'certain', '只有一個走法經過呢個站');
  if (!eta.eta) return guess(null, 'unknown', '冇到站時間');

  const etaDate = new Date(eta.eta);
  const etaMin = hkParts(etaDate).minutes;
  const scored = cands.map((v) => {
    const seqOk = v.expSeq[key] === eta.seq;
    const idx = v.stops.findIndex((s, i) => s === eta.stopId && v.stopDirs[i] === eta.dir);
    const offsetMin = idx >= 0 ? (v.offsets[idx] ?? 0) / 60 : 0;
    const dep = etaMin - offsetMin;
    const deps = departuresAround(v, calendar, etaDate);
    const gap = deps.length ? Math.min(...deps.map((x) => Math.abs(x - dep))) : Infinity;
    return { v, seqOk, gap };
  });

  const seqMatches = scored.filter((s) => s.seqOk);
  // seq 只吻合一個走法：肯定
  if (seqMatches.length === 1) return guess(seqMatches[0]!.v, 'certain', `ETA seq ${eta.seq} 只吻合呢個走法`);

  // seq 分唔到（例如總站全部都係 seq 1）：用時間表
  const pool = (seqMatches.length ? seqMatches : scored).sort((a, b) => a.gap - b.gap);
  const best = pool[0]!;
  if (best.gap > MAX_GAP_MIN) return guess(null, 'unknown', '時間表搵唔到對應班次');
  const second = pool[1];
  if (second && second.gap - best.gap < 2) {
    return guess(null, 'unknown', `兩個走法都有接近嘅班次（${best.v.name} / ${second.v.name}）`);
  }
  return guess(best.v, 'likely', `按時間表推斷，約 ${Math.round(best.gap)} 分鐘內有呢個走法嘅班次`);
}

export function inferAll(route: RouteData, etas: Eta[], calendar: Calendar): Eta[] {
  return etas.map((e) => ({ ...e, variant: inferVariant(route, e, calendar) }));
}

function guess(v: Variant | null, confidence: VariantGuess['confidence'], reason: string): VariantGuess {
  return { variantId: v?.id ?? null, name: v?.name ?? null, special: v?.special ?? false, confidence, reason };
}
