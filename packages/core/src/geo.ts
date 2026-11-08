/** [lat, lng] */
export type LatLng = [number, number];

export interface Arrow {
  lat: number;
  lng: number;
  /** 方向角度：0 = 向北，90 = 向東（順時針） */
  bearing: number;
}

/** 兩點直線距離（米，近似；香港範圍夠準） */
export function metresBetween(a: LatLng, b: LatLng): number {
  return metres(a, b);
}

function metres(a: LatLng, b: LatLng): number {
  const dy = (a[0] - b[0]) * 111320;
  const dx = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export function bearing(a: LatLng, b: LatLng): number {
  const dy = b[0] - a[0];
  const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/**
 * 地圖方向箭嘴：每段站到站嘅走線，喺 fractions 指定嘅位置（預設一半長度）各放一個箭嘴，
 * 按走線次序排列。短過 minLength 米嘅段唔放，避免站與站好近時箭嘴擠埋一齊。
 * 地圖可以再按縮放程度篩選（例如箭嘴之間最少相隔幾多 px）。
 */
export function lineArrows(segments: LatLng[][], minLength = 150, fractions: number[] = [0.5]): Arrow[] {
  const out: Arrow[] = [];
  for (const seg of segments) {
    if (seg.length < 2) continue;
    const lens = seg.slice(1).map((p, i) => metres(seg[i]!, p));
    const total = lens.reduce((a, b) => a + b, 0);
    if (total < minLength) continue;
    for (const fr of [...fractions].sort((a, b) => a - b)) {
      const p = pointAt(seg, lens, total * fr);
      if (p) out.push(p);
    }
  }
  return out;
}

/** 沿住折線行 dist 米嘅位置同方向 */
function pointAt(seg: LatLng[], lens: number[], dist: number): Arrow | null {
  let left = dist;
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (left <= len || i === lens.length - 1) {
      const a = seg[i]!;
      const b = seg[i + 1]!;
      const f = len ? Math.min(1, left / len) : 0;
      return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, bearing: bearing(a, b) };
    }
    left -= len;
  }
  return null;
}

/**
 * 將折線轉角磨圓（Chaikin corner cutting）。頭尾兩點保持不變，所以每段仍然由站開始、喺站結束。
 * 每次喺每個轉角前後各切一刀：切 1/4 線段長度，但最多 maxCut 米，
 * 避免長直路喺路口轉彎時條線偏離馬路太多。
 */
export function smoothLine(points: LatLng[], iterations = 2, maxCut = 6): LatLng[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: LatLng[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = metres(a, b);
      const f = len > 0 ? Math.min(0.25, maxCut / len) : 0;
      // 第一段唔使切起點，最後一段唔使切終點（保持頭尾）
      if (i > 0) out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      if (i < pts.length - 2) out.push([b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f]);
    }
    out.push(pts[pts.length - 1]!);
    pts = out;
  }
  return pts;
}

/**
 * 每個站喺走線（一條連續折線）上最近嘅點 index。按次序向前搵，所以來回同一條路嘅走線都唔會搵錯方向。
 */
export function stopPathIndices(path: LatLng[], stops: LatLng[]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const s of stops) {
    let best = from;
    let bestD = Infinity;
    // 只喺前面一段範圍入面搵，避免跳去遠處同名嘅路
    for (let i = from; i < path.length; i++) {
      const d = metres(path[i]!, s);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      if (bestD < 30 && d > bestD + 400) break;
    }
    out.push(best);
    from = best;
  }
  return out;
}

/** 走線上第 i0 點到第 i1 點之間，按距離行到 fraction（0–1）嘅位置同方向 */
export function pointOnPath(path: LatLng[], i0: number, i1: number, fraction: number): Arrow | null {
  if (i1 <= i0) {
    const p = path[i0];
    return p ? { lat: p[0], lng: p[1], bearing: 0 } : null;
  }
  const seg = path.slice(i0, i1 + 1);
  const lens = seg.slice(1).map((p, i) => metres(seg[i]!, p));
  const total = lens.reduce((a, b) => a + b, 0);
  let left = total * Math.min(1, Math.max(0, fraction));
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (left <= len || i === lens.length - 1) {
      const a = seg[i]!;
      const b = seg[i + 1]!;
      const f = len ? Math.min(1, left / len) : 0;
      return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, bearing: bearing(a, b) };
    }
    left -= len;
  }
  return null;
}

/**
 * 每個站沿走線由第一個站起計嘅累計距離（米）。
 * 有走線就沿走線量；冇走線（path 少過 2 點）就用站與站之間嘅直線距離。
 */
export function stopCumMetres(path: LatLng[], stops: LatLng[]): number[] {
  if (path.length < 2) {
    const out = [0];
    for (let i = 1; i < stops.length; i++) out.push(out[i - 1]! + metres(stops[i - 1]!, stops[i]!));
    return out;
  }
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1]! + metres(path[i - 1]!, path[i]!));
  const idx = stopPathIndices(path, stops);
  return idx.map((i) => along[i]! - along[idx[0]!]!);
}

/** 距離文字：一公里以下用「米」（取十位），以上用「公里」（一位小數） */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} 米`;
  return `${(m / 1000).toFixed(1)} 公里`;
}
