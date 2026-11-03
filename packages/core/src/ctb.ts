import type { Dir, Eta } from './types';

export const CTB_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

interface CtbEtaRaw {
  co: string;
  route: string;
  dir: Dir;
  seq: number;
  stop: string;
  dest_tc: string;
  dest_en: string;
  eta: string;
  rmk_tc: string;
  rmk_en: string;
}

/** 城巴某站某路線嘅實時到站（兩個方向都會回傳） */
export async function fetchCtbEta(stopId: string, route: string, fetcher: typeof fetch = fetch): Promise<Eta[]> {
  const res = await fetcher(`${CTB_BASE}/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`);
  if (!res.ok) throw new Error(`城巴 ETA ${res.status}`);
  const body = (await res.json()) as { data: CtbEtaRaw[] };
  return body.data.map(parseCtbEta);
}

export function parseCtbEta(r: CtbEtaRaw): Eta {
  return {
    company: 'CTB',
    route: r.route,
    dir: r.dir,
    stopId: r.stop,
    eta: r.eta || null,
    seq: r.seq,
    destTc: r.dest_tc,
    destEn: r.dest_en,
    remarkTc: r.rmk_tc,
    remarkEn: r.rmk_en,
  };
}
