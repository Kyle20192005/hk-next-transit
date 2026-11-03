import type { Dir, Eta } from './types';

export const NLB_BASE = 'https://rt.data.gov.hk/v2/transport/nlb';

interface NlbEtaRaw {
  /** 香港時間「2026-11-03 19:33:47」 */
  estimatedArrivalTime: string;
  /** 例如「經: 北大嶼山醫院」 */
  routeVariantName: string;
  /** 1 = 已經由總站開出 */
  departed: number;
  /** 1 = 冇 GPS。新巴大部分車都係 1，開出咗嘅車時間仍然按實際開車計，可以用嚟推算位置 */
  noGPS: number;
}

/** 新大嶼山巴士某走法（routeId）喺某站嘅到站時間 */
export async function fetchNlbEta(
  routeId: string,
  stopId: string,
  dir: Dir,
  route: string,
  fetcher: typeof fetch = fetch,
): Promise<Eta[]> {
  const res = await fetcher(
    `${NLB_BASE}/stop.php?action=estimatedArrivals&routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}&language=zh`,
  );
  if (!res.ok) throw new Error(`新大嶼山巴士 ETA ${res.status}`);
  const body = (await res.json()) as { estimatedArrivals?: NlbEtaRaw[] };
  return (body.estimatedArrivals ?? [])
    .filter((r) => r.estimatedArrivalTime)
    .map((r) => ({
      company: 'NLB',
      route,
      dir,
      stopId,
      eta: `${r.estimatedArrivalTime.replace(' ', 'T')}+08:00`,
      seq: 0,
      destTc: '',
      destEn: '',
      remarkTc: r.routeVariantName ?? '',
      remarkEn: '',
      // 未開出 = 時間表時間（介面標「原定」，唔用嚟推算位置）；開出咗就當實時
      scheduled: r.departed !== 1,
    }));
}
