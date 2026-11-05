import 'server-only';
import { etasAtStop, fetchCtbEta, fetchKmbStopEta, type Eta } from '@hknt/core';
import { getIndex, getRoute, type AnyStopEntry } from './data';
import { liveFetch } from './live-fetch';

/**
 * 一個站所有經過嘅路線同下一兩班車（`/api/stop-etas` 同 `/api/here` 共用）。
 * - 九巴站：九巴有「一個站所有路線」嘅 API，一次 call 攞晒
 * - 城巴站：要逐條路線 call；聯營線合併埋九巴嘅車
 * - 新大嶼山、港鐵巴士：逐條路線用路線檔查
 */
export async function routesAtStop(entry: AnyStopEntry, now = Date.now()) {
  const co = entry.co;
  const stop = entry.id;
  let etasFor: (route: string, dir: string) => Eta[];

  if (co === 'nlb' || co === 'mtrb') {
    // 新大嶼山巴士、港鐵巴士：逐條路線用路線檔查（走法明確，唔使時間表）
    const lists = await Promise.all(
      [...new Set(entry.r.map(([, route]) => route))].map(async (route) => {
        const data = await getRoute(co, route);
        return [route, data ? await etasAtStop(data, stop, {}, liveFetch).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  } else if (co === 'kmb') {
    const all = await fetchKmbStopEta(stop, liveFetch).catch(() => []);
    etasFor = (route, dir) => all.filter((e) => e.route === route && e.dir === dir);
  } else {
    const index = await getIndex();
    const joint = new Set(index.routes.filter((r) => (r.co ?? 'ctb') === 'ctb' && (r.companies?.length ?? 1) > 1).map((r) => r.route));
    const lists = await Promise.all(
      [...new Set(entry.r.map(([, route]) => route))].map(async (route) => {
        if (!joint.has(route)) return [route, await fetchCtbEta(stop, route, liveFetch).catch(() => [])] as const;
        const data = await getRoute('ctb', route);
        // 附近列表唔使推斷走法，所以唔使時間表（calendar 傳空）
        return [route, data ? await etasAtStop(data, stop, {}, liveFetch).catch(() => []) : []] as const;
      }),
    );
    const byRoute = new Map<string, Eta[]>(lists);
    etasFor = (route, dir) => (byRoute.get(route) ?? []).filter((e) => e.dir === dir);
  }

  const routes = entry.r.map(([rco, route, dir, dest]) => ({
    co: rco,
    route,
    dir,
    dest,
    etas: etasFor(route, dir)
      .filter((e) => e.eta && Date.parse(e.eta) >= now - 60_000)
      .sort((a, b) => Date.parse(a.eta!) - Date.parse(b.eta!))
      .slice(0, 3)
      .map((e) => ({ eta: e.eta, company: e.company, scheduled: e.scheduled ?? false, remark: e.remarkTc })),
  }));

  return entry.r.map(([rco, route, dir, dest]) => ({
    co: rco,
    route,
    dir,
    dest,
    etas: etasFor(route, dir)
      .filter((e) => e.eta && Date.parse(e.eta) >= now - 60_000)
      .sort((a, b) => Date.parse(a.eta!) - Date.parse(b.eta!))
      .slice(0, 3)
      .map((e) => ({ eta: e.eta!, company: e.company, scheduled: e.scheduled ?? false, remark: e.remarkTc })),
  }));
}
