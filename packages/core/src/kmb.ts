import type { Eta } from './types';

export const KMB_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';

interface KmbEtaRaw {
  co: string;
  route: string;
  dir: 'O' | 'I';
  service_type: number;
  seq: number;
  dest_tc: string;
  dest_en: string;
  eta: string | null;
  rmk_tc: string;
  rmk_en: string;
}

/**
 * 九巴某站嘅實時到站。九巴有 service_type 區分特別班，所以唔使推斷走法。
 * 未接駁政府走線同站點配對，留待之後做。
 */
export async function fetchKmbStopEta(stopId: string, fetcher: typeof fetch = fetch): Promise<(Eta & { serviceType: number })[]> {
  const res = await fetcher(`${KMB_BASE}/stop-eta/${encodeURIComponent(stopId)}`);
  if (!res.ok) throw new Error(`九巴 ETA ${res.status}`);
  const body = (await res.json()) as { data: KmbEtaRaw[] };
  return body.data.map((r) => ({
    company: 'KMB',
    route: r.route,
    dir: r.dir,
    stopId,
    eta: r.eta,
    seq: r.seq,
    destTc: r.dest_tc,
    destEn: r.dest_en,
    remarkTc: r.rmk_tc,
    remarkEn: r.rmk_en,
    serviceType: r.service_type,
  }));
}
