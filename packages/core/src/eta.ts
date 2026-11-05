import type { Calendar, Company, Dir, Eta, RouteData, Variant } from './types';
import { fetchCtbEta } from './ctb';
import { fetchKmbEta } from './kmb';
import { inferAll } from './infer';
import { fetchNlbEta } from './nlb';
import { fetchMtrbEta } from './mtrb';

/**
 * 某條路線喺某個站嘅到站時間：聯營線合併城巴同九巴兩間公司嘅車，按時間排。
 *
 * - 城巴路線檔（站 ID 係城巴）：城巴 ETA 用 seq 推斷走法；聯營線再用站嘅 kmb ID 攞九巴 ETA。
 * - 九巴路線檔（站 ID 係九巴）：九巴 ETA 按 service_type 查，走法係確定嘅；
 *   九巴做主幹嘅聯營線（例如 101R）再用站嘅 ctb ID 攞城巴嘅車。
 * - 九巴嘅方向（bound）同城巴可以相反，所以九巴班次嘅 dir 改做呢個走法喺呢個站用嘅方向，
 *   等前端照用 e.dir 篩選。
 * - 城巴「九巴時段」、九巴「城巴時段」呢類冇時間嘅佔位項目會過濾走。
 */
export async function etasAtStop(
  route: RouteData,
  stopId: string,
  calendar: Calendar,
  fetcher: typeof fetch = fetch,
): Promise<Eta[]> {
  return (await etasAtStopDetailed(route, stopId, calendar, fetcher)).etas;
}

/** 同 etasAtStop，另外回傳邊間公司攞唔到數據（出錯重試一次都唔得），等介面可以話畀用戶知 */
export async function etasAtStopDetailed(
  route: RouteData,
  stopId: string,
  calendar: Calendar,
  fetcher: typeof fetch = fetch,
): Promise<{ etas: Eta[]; failed: Company[] }> {
  const companies = route.companies ?? [route.company];
  const parts: Promise<Eta[]>[] = [];
  const failed = new Set<Company>();
  // 營辦商 API 間中會出錯：重試一次；再唔得就記低邊間公司，唔好靜靜雞當佢冇車
  const retry = <T,>(f: () => Promise<T>) => f().catch(() => f());
  const fail = (co: Company) => () => {
    failed.add(co);
    return [] as Eta[];
  };

  // 新大嶼山巴士、港鐵巴士：走法已經明確（NLB routeId、MTRB lineRef），唔使推斷
  if (route.company === 'NLB' || route.company === 'MTRB') {
    const passing = route.variants
      .map((v) => ({ v, key: Object.keys(v.expSeq).find((k) => k.slice(2) === stopId) }))
      .filter((x): x is { v: Variant; key: string } => Boolean(x.key));
    const tag = (v: Variant, dir: Eta['dir']) => (e: Eta): Eta => ({
      ...e,
      dir,
      stopId,
      variant: { variantId: v.id, name: v.name, special: v.special, confidence: 'certain', reason: '營辦商資料指明走法' },
    });
    if (route.company === 'NLB') {
      // 一個 routeId 可以拆咗做幾個走法（例如 11 號經／唔經懲教所）：每個 routeId 只問一次，
      // 再用 ETA 嘅「經: …」對走法；對唔到就當正常走法（likely）
      const byRid = new Map<string, { v: Variant; key: string }[]>();
      for (const p of passing) if (p.v.nlb) byRid.set(p.v.nlb.routeId, [...(byRid.get(p.v.nlb.routeId) ?? []), p]);
      for (const [rid, group] of byRid) {
        const dir = group[0]!.key[0] as Eta['dir'];
        parts.push(
          retry(() => fetchNlbEta(rid, stopId, dir, route.route, fetcher))
            .then((etas) =>
              etas.map((e) => {
                const { hit, sure } = pickNlbVariant(group.map((g) => g.v), e.remarkTc);
                const tagged = tag(hit, group.find((g) => g.v === hit)!.key[0] as Eta['dir'])(e);
                return sure ? tagged : { ...tagged, variant: { ...tagged.variant!, confidence: 'likely' as const, reason: '按 ETA 備註估計走法' } };
              }),
            )
            .catch(fail('NLB')),
        );
      }
    } else {
      parts.push(
        retry(() => fetchMtrbEta(route.route, stopId, fetcher))
          .then((etas) =>
            etas.flatMap((e) => {
              const hit = passing.find((p) => p.v.mtrb?.lineRef === e.lineRef) ?? passing.find((p) => p.key[0] === e.dir);
              if (!hit) return [];
              const { lineRef: _lr, ...rest } = e;
              void _lr;
              return [tag(hit.v, hit.key[0] as Eta['dir'])(rest)];
            }),
          )
          .catch(fail('MTRB')),
      );
    }
  }

  if (route.company === 'CTB' && companies.includes('CTB')) {
    parts.push(
      retry(() => fetchCtbEta(stopId, route.route, fetcher))
        .then((etas) => inferAll(route, etas.filter((e) => e.eta).map((e) => fixCtbDir(route, e)), calendar))
        .catch(fail('CTB')),
    );
  }

  // 九巴做主幹嘅聯營線（例如 101R）：用站嘅 ctb ID 攞城巴嘅車；城巴 seq 對唔到九巴走法，按方向配
  const ctbStop = route.company === 'KMB' ? route.stops[stopId]?.ctb : undefined;
  if (ctbStop && companies.includes('CTB')) {
    const byDir = new Map<string, { v: Variant; dir: Eta['dir'] }[]>();
    for (const v of route.variants) {
      if (!v.ctb) continue;
      const key = Object.keys(v.expSeq).find((k) => k.slice(2) === stopId);
      if (key) byDir.set(v.ctb.dir, [...(byDir.get(v.ctb.dir) ?? []), { v, dir: key[0] as Eta['dir'] }]);
    }
    parts.push(
      retry(() => fetchCtbEta(ctbStop, route.route, fetcher))
        .then((etas) =>
          etas.flatMap((e): Eta[] => {
            const members = byDir.get(e.dir);
            if (!e.eta || !members) return [];
            const main = members.find((m) => !m.v.special) ?? members[0]!;
            return [
              {
                ...e,
                dir: main.dir,
                stopId,
                variant: {
                  variantId: main.v.id,
                  name: main.v.name,
                  special: main.v.special,
                  confidence: members.length === 1 ? 'certain' : 'likely',
                  reason: '城巴班次按方向對應九巴走法',
                },
              },
            ];
          }),
        )
        .catch(fail('CTB')),
    );
  }

  const kmbCo: Company | undefined = companies.find((c) => c === 'KMB' || c === 'LWB');
  const kmbStop = route.company === 'KMB' ? stopId : route.stops[stopId]?.kmb;
  if (kmbCo && kmbStop) {
    // 經過呢個站、有九巴查詢參數嘅走法，按 (bound, service_type) 分組：每組只 call 一次
    const groups = new Map<string, { v: Variant; dir: Eta['dir'] }[]>();
    for (const v of route.variants) {
      if (!v.kmb) continue;
      const key = Object.keys(v.expSeq).find((k) => k.slice(2) === stopId);
      if (!key) continue;
      const g = `${v.kmb.bound}:${v.kmb.serviceType}`;
      groups.set(g, [...(groups.get(g) ?? []), { v, dir: key[0] as Eta['dir'] }]);
    }
    for (const [g, members] of groups) {
      const [bound, st] = g.split(':') as [Eta['dir'], string];
      // 同一組有幾個政府走法（例如九巴冇分開嘅短途特別班）：當係正常嗰個，可信度降做 likely
      const main = members.find((m) => !m.v.special) ?? members[0]!;
      parts.push(
        retry(() => fetchKmbEta(kmbStop, route.route, st, fetcher, kmbCo))
          .then((etas) =>
            etas
              .filter((e) => e.dir === bound)
              .map(
                (e): Eta => ({
                  ...e,
                  dir: main.dir,
                  stopId,
                  variant: {
                    variantId: main.v.id,
                    name: main.v.name,
                    special: main.v.special,
                    confidence: members.length === 1 ? 'certain' : 'likely',
                    reason: members.length === 1 ? '九巴 service_type 對應呢個走法' : '九巴冇分開呢幾個走法，當係正常走法',
                  },
                }),
              ),
          )
          .catch(fail(kmbCo)),
      );
    }
  }

  const all = (await Promise.all(parts)).flat();
  return { etas: dedupe(all).sort((a, b) => Date.parse(a.eta ?? '') - Date.parse(b.eta ?? '')), failed: [...failed] };
}

/**
 * 去除重複班次：九巴就算要求唔同 service_type，都會回傳同一批車（只係改咗 service_type 欄），
 * 例如 107 嘅「經海洋公園」（service_type 2）同正常路線（1）會出一樣嘅 16:00、16:30。
 * 同公司、同方向、同到站時間當係同一班車，保留正常走法嗰個。特別班真係有自己嘅車，時間會唔同，唔受影響。
 */
function dedupe(etas: Eta[]): Eta[] {
  const best = new Map<string, Eta>();
  for (const e of etas) {
    const key = `${e.company}|${e.dir}|${e.eta}`;
    const cur = best.get(key);
    if (!cur || (cur.variant?.special && !e.variant?.special)) best.set(key, e);
  }
  return [...best.values()];
}

/** 「經: 北大嶼山醫院」-> 北大嶼山醫院（拎走空格同標點，方便比較） */
const viaKey = (x: string) => x.replace(/^經[:：]?/, '').replace(/[\s:：、及和]/g, '');

/** 新大嶼山巴士：按 ETA 備註（routeVariantName）揀走法 */
export function pickNlbVariant(vs: Variant[], remark: string): { hit: Variant; sure: boolean } {
  const normal = vs.find((v) => !v.nlb?.via) ?? vs[0]!;
  if (vs.length === 1) return { hit: vs[0]!, sure: true };
  const via = viaKey(remark ?? '');
  if (!via) return { hit: normal, sure: Boolean(vs.find((v) => !v.nlb?.via)) };
  const exact = vs.find((v) => v.nlb?.via && viaKey(v.nlb.via) === via);
  if (exact) return { hit: exact, sure: true };
  const part = vs.find((v) => v.nlb?.via && (viaKey(v.nlb.via).includes(via) || via.includes(viaKey(v.nlb.via))));
  return { hit: part ?? normal, sure: false };
}

/**
 * 城巴循環線嘅站點列表同到站時間方向唔一致（例如 78：站點列表話華貴邨至田灣商場屬去程 O，
 * 到站時間就標回程 I，站序照計落去）。班次方向嘅站點列表冇呢個站、另一個方向有，就改做另一個方向，
 * 唔係介面按方向過濾會將班次全部篩走。
 */
export function fixCtbDir(route: RouteData, e: Eta): Eta {
  const own = route.directions[e.dir];
  const other: Dir = e.dir === 'O' ? 'I' : 'O';
  if (own?.includes(e.stopId) || !route.directions[other]?.includes(e.stopId)) return e;
  return { ...e, dir: other };
}
