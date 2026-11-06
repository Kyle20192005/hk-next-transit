/**
 * 地區名（首頁大字，好似港鐵 App 嘅「青衣 Tsing Yi」）：由 OSM place 節點（pipeline `places.py` → places.json）
 * 揀離用戶最近嘅。細嘅地方（屋苑、村）要近好多先揀，避免喺市區顯示一個屋苑名。
 */
export interface Place {
  n: string;
  en: string | null;
  /** suburb、quarter、neighbourhood、town、village */
  t: string;
  lat: number;
  lng: number;
}

/** 種類權重：距離乘呢個數再比較（越大越要近先揀）；最遠幾多米 */
const WEIGHT: Record<string, number> = { suburb: 1, town: 1, quarter: 1.15, neighbourhood: 1.6, village: 1.8 };
const MAX_M = 2000;

const metres = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

export function pickArea(places: Place[], lat: number, lng: number): { n: string; en: string | null } | null {
  let best: Place | null = null;
  let bestScore = Infinity;
  for (const p of places) {
    const d = metres(lat, lng, p.lat, p.lng);
    if (d > MAX_M) continue;
    const score = d * (WEIGHT[p.t] ?? 2);
    if (score < bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ? { n: best.n, en: best.en } : null;
}
