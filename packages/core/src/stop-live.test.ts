import { describe, expect, it } from 'vitest';
import { GMB_BASE } from './gmb';
import { capStopFamilies, hereRoutes, routesAtStop, stopEtas, type AnyStopEntry, type StopLiveDeps } from './stop-live';
import type { RouteData, RouteIndex, Variant } from './types';
import loopEta from '../test/fixtures/gmb-eta-stop-loop.json';

const LAT = 22.3;
const LNG = 114.17;
/** 向北 n 米嘅緯度 */
const north = (m: number) => LAT + m / 111320;

const STOP = '20000093';

const variant = (id: string, routeId: string, expSeq: Record<string, number>): Variant => ({
  id,
  govRouteId: routeId,
  govDir: '1',
  name: id,
  special: false,
  stops: [],
  stopDirs: [],
  stopMatch: [],
  offsets: [],
  schedules: [],
  line: null,
  lineAligned: false,
  expSeq,
  gmb: { routeId, routeSeq: 1 },
});
const gmbRoute = (key: string, v: Variant): RouteData => ({
  company: 'GMB',
  companies: ['GMB'],
  route: key,
  origTc: '起點',
  destTc: `${key} 終點`,
  origEn: null,
  destEn: null,
  stops: {},
  directions: {},
  ctbOnlyStops: [],
  variants: [v],
});
const ROUTES: Record<string, RouteData> = {
  'gmb/NT-1': gmbRoute('NT-1', variant('2000971-1', '2000971', { [`O:${STOP}`]: 1 })),
  'gmb/NT-2': gmbRoute('NT-2', variant('2000968-1', '2000968', { [`O:${STOP}`]: 1 })),
};

function deps(stops: AnyStopEntry[]) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith(GMB_BASE)) return new Response(JSON.stringify(loopEta));
    // 城巴、九巴：冇車
    return new Response(JSON.stringify({ data: [] }));
  };
  const index: RouteIndex = { generatedAt: 'x', routes: [] };
  const d: StopLiveDeps = {
    getRoute: async (co, route) => ROUTES[`${co}/${route}`] ?? null,
    getIndex: async () => index,
    getAllStops: async () => stops,
    fetcher,
  };
  return { d, calls };
}

const gmbStop: AnyStopEntry = {
  id: STOP,
  co: 'gmb',
  n: '小巴站',
  lat: LAT,
  lng: LNG,
  r: [
    ['gmb', 'NT-1', 'O', 'NT-1 終點'],
    ['gmb', 'NT-2', 'O', 'NT-2 終點'],
  ],
};

describe('routesAtStop（專線小巴站）', () => {
  it('一次 /eta/stop 攞晒所有路線，唔會問城巴', async () => {
    const { d, calls } = deps([gmbStop]);
    const now = Date.parse('2026-11-09T21:40:00+08:00');
    const out = await routesAtStop(gmbStop, d, now);
    expect(calls).toEqual([`${GMB_BASE}/eta/stop/${STOP}`]);
    expect(out.map((r) => [r.co, r.route, r.dir, r.etas.map((e) => e.eta.slice(11, 16))])).toEqual([
      ['gmb', 'NT-1', 'O', ['21:48', '22:00', '22:12']],
      ['gmb', 'NT-2', 'O', ['21:48', '22:00', '22:12']],
    ]);
    expect(out[0]!.etas[0]).toMatchObject({ company: 'GMB', scheduled: true, remark: '未開出' });
  });
});

describe('stopEtas：專線小巴要 gmb=1', () => {
  it('冇講明識專線小巴 → null（404）', async () => {
    const { d, calls } = deps([gmbStop]);
    expect(await stopEtas('gmb', STOP, d)).toBeNull();
    expect(calls).toEqual([]);
    expect((await stopEtas('gmb', STOP, d, { gmb: true }))?.routes).toHaveLength(2);
  });
});

describe('capStopFamilies', () => {
  it('巴士站、小巴站各自限數量，次序不變', () => {
    const xs = ['ctb', 'gmb', 'gmb', 'kmb', 'gmb', 'nlb', 'ctb'].map((co, i) => ({ co: co as AnyStopEntry['co'], i }));
    expect(capStopFamilies(xs, (x) => x.co, { bus: 3, gmb: 2 }).map((x) => x.i)).toEqual([0, 1, 2, 3, 5]);
  });
});

describe('hereRoutes', () => {
  // 10 個巴士站、5 個小巴站，全部 40 米內，小巴站比較近
  const stops: AnyStopEntry[] = [
    ...Array.from({ length: 10 }, (_, i): AnyStopEntry => ({ id: `B${i}`, co: 'kmb', n: `巴士${i}`, lat: north(10 + i), lng: LNG, r: [] })),
    ...Array.from({ length: 5 }, (_, i): AnyStopEntry => ({ id: `2000009${i}`, co: 'gmb', n: `小巴${i}`, lat: north(i), lng: LNG, r: [] })),
  ];

  it('最多 6 個巴士站 + 3 個小巴站（小巴唔逼走巴士）', async () => {
    const { d } = deps(stops);
    const res = await hereRoutes(LAT, LNG, 40, d, { gmb: true });
    expect(res.stops.filter((s) => s.co === 'gmb').map((s) => s.id)).toEqual(['20000090', '20000091', '20000092']);
    expect(res.stops.filter((s) => s.co !== 'gmb')).toHaveLength(6);
    // 按距離排
    expect(res.stops.map((s) => s.distance)).toEqual([...res.stops.map((s) => s.distance)].sort((a, b) => a - b));
  });

  it('冇 gmb=1：冇小巴站、唔會問專線小巴', async () => {
    const { d, calls } = deps([...stops.slice(10), { ...gmbStop, lat: north(1) }]);
    const res = await hereRoutes(LAT, LNG, 40, d);
    expect(res.stops).toEqual([]);
    expect(res.routes).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('有 gmb=1：小巴路線同巴士一齊排', async () => {
    const { d } = deps([gmbStop]);
    const res = await hereRoutes(LAT, LNG, 40, d, { gmb: true, now: Date.parse('2026-11-09T21:40:00+08:00') });
    expect(res.routes.map((r) => [r.co, r.route, r.stopId, r.companies])).toEqual([
      ['gmb', 'NT-1', STOP, []],
      ['gmb', 'NT-2', STOP, []],
    ]);
  });
});
