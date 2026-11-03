import type { Company, Dir, Eta } from './types';

export const KMB_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';

interface KmbEtaRaw {
  co: string;
  route: string;
  dir: Dir;
  service_type: number;
  seq: number;
  dest_tc: string;
  dest_en: string;
  eta: string | null;
  rmk_tc: string;
  rmk_en: string;
}

/** 九巴「原定班次」= 時間表時間，唔係實時 */
const SCHEDULED = /原定/;

function parse(r: KmbEtaRaw, stopId: string, company: Company): Eta & { serviceType: string } {
  return {
    company,
    route: r.route,
    dir: r.dir,
    stopId,
    eta: r.eta,
    seq: r.seq,
    destTc: r.dest_tc,
    destEn: r.dest_en,
    remarkTc: r.rmk_tc,
    remarkEn: r.rmk_en,
    scheduled: SCHEDULED.test(r.rmk_tc),
    serviceType: String(r.service_type),
  };
}

/**
 * 九巴（連龍運）某站某路線某 service_type 嘅到站時間。只有九巴自己嘅車：聯營線要同城巴合併。
 * 冇時間嘅項目（例如「城巴時段」）會過濾走。
 */
export async function fetchKmbEta(
  stopId: string,
  route: string,
  serviceType: string,
  fetcher: typeof fetch = fetch,
  company: Company = 'KMB',
): Promise<(Eta & { serviceType: string })[]> {
  const res = await fetcher(`${KMB_BASE}/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}/${encodeURIComponent(serviceType)}`);
  if (!res.ok) throw new Error(`九巴 ETA ${res.status}`);
  const body = (await res.json()) as { data: KmbEtaRaw[] };
  return body.data.filter((r) => r.eta).map((r) => parse(r, stopId, company));
}

/** 九巴某站所有路線嘅到站時間（一次 call 攞晒，附近車站用） */
export async function fetchKmbStopEta(
  stopId: string,
  fetcher: typeof fetch = fetch,
): Promise<(Eta & { serviceType: string })[]> {
  const res = await fetcher(`${KMB_BASE}/stop-eta/${encodeURIComponent(stopId)}`);
  if (!res.ok) throw new Error(`九巴 ETA ${res.status}`);
  const body = (await res.json()) as { data: KmbEtaRaw[] };
  return body.data.filter((r) => r.eta).map((r) => parse(r, stopId, 'KMB'));
}
