import { formatDistance, metresBetween } from './geo';
import { normalizePlace } from './stop-search';

/**
 * 路線頁小功能（網頁同 App 共用）：落車站摘要、轉方向搵返對面最近嘅站、全程時間、「幾耐前更新」、站名搜尋、分享文字。
 */

const hhmm = (t: number) => {
  const d = new Date(t + 8 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * 落車站摘要，例如「約 00:42 到 · 12 個站 · 5.2 公里 · 車程約 25 分鐘」。
 * nextAt = 下一班車到上車站嘅時間（冇就唔講幾點到）。
 */
export function alightSummary(o: { nextAt: number | null; travelSeconds: number | null; stops: number; metres: number | null }): string {
  const parts: string[] = [];
  if (o.nextAt !== null && o.travelSeconds !== null) parts.push(`約 ${hhmm(o.nextAt + o.travelSeconds * 1000)} 到`);
  parts.push(`${o.stops} 個站`);
  if (o.metres !== null && o.metres >= 50) parts.push(formatDistance(o.metres));
  if (o.travelSeconds !== null) parts.push(`車程約 ${Math.max(1, Math.round(o.travelSeconds / 60))} 分鐘`);
  return parts.join(' · ');
}

/** 轉方向：對面方向離而家打開咗嘅站最近嘅站（maxM 米內；終點站唔要，唔會喺度上車） */
export function nearestStopIndex(target: { lat?: number; lng?: number } | undefined, list: readonly { lat?: number; lng?: number }[], maxM = 500): number {
  if (target?.lat === undefined || target.lng === undefined) return -1;
  let best = -1;
  let bestM = Infinity;
  list.forEach((s, i) => {
    if (s.lat === undefined || s.lng === undefined || i === list.length - 1) return;
    const m = metresBetween([target.lat!, target.lng!], [s.lat, s.lng]);
    if (m < bestM) {
      bestM = m;
      best = i;
    }
  });
  return bestM <= maxM ? best : -1;
}

/** 全程大約幾多分鐘：有實測行車時間就用（加埋），冇就用時間表估算（offsets 最尾） */
export function routeMinutes(v: { segSeconds?: number[] | null; offsets?: number[] }): number | null {
  const seg = v.segSeconds?.length ? v.segSeconds.reduce((a, b) => a + b, 0) : null;
  const sec = seg ?? (v.offsets?.length ? v.offsets[v.offsets.length - 1]! : null);
  return sec && sec > 0 ? Math.max(1, Math.round(sec / 60)) : null;
}

/** 「幾耐前更新」：10 秒內「啱啱更新」，之後「N 秒前」「N 分鐘前」 */
export function updatedAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return '啱啱更新';
  if (s < 60) return `${s} 秒前更新`;
  return `${Math.round(s / 60)} 分鐘前更新`;
}

/** 站名搜尋（路線頁）：撞中嘅站 index（唔理空格、標點、全半形），最多 limit 個 */
export function matchStops(names: readonly string[], q: string, limit = 6): number[] {
  const nq = normalizePlace(q);
  if (!nq) return [];
  const out: number[] = [];
  names.forEach((n, i) => {
    if (out.length < limit && normalizePlace(n).includes(nq)) out.push(i);
  });
  return out;
}

/** 分享文字，例如「城巴 107 往華貴邨｜田灣商場：下一班 5 分鐘（00:28）」 */
export function shareText(o: { company: string; route: string; dest: string; stop: string; nextAt: number | null; now: number }): string {
  const head = `${o.company} ${o.route} 往 ${o.dest}｜${o.stop}`;
  if (o.nextAt === null) return head;
  const mins = Math.max(0, Math.round((o.nextAt - o.now) / 60_000));
  return `${head}：下一班 ${mins === 0 ? '即將到站' : `${mins} 分鐘`}（${hhmm(o.nextAt)}）`;
}
