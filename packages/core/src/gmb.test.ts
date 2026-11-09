import { describe, expect, it } from 'vitest';
import {
  fetchGmbStopEta,
  GMB_BASE,
  GMB_REGION_NAME,
  GMB_REGIONS,
  gmbEtas,
  gmbKey,
  gmbOptIn,
  lastStopIsTerminus,
  parseGmbKey,
  parseGmbStopEta,
  routeCode,
  routeMode,
  routeHeadDest,
  routeRegion,
  routeTitle,
  vehicleNoun,
  withGmbOptIn,
} from './gmb';
import type { RouteData, Variant } from './types';
import stopEta from '../test/fixtures/gmb-eta-stop.json';
import loopEta from '../test/fixtures/gmb-eta-stop-loop.json';

const HK_ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00$/;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** 假 fetch：記低網址，回傳指定回應 */
function fakeFetch(res: () => Response) {
  const calls: string[] = [];
  const f: typeof fetch = async (input) => {
    calls.push(String(input));
    return res();
  };
  return { f, calls };
}

describe('route keys', () => {
  it('gmbKey / parseGmbKey', () => {
    expect(gmbKey('NT', '2')).toBe('NT-2');
    expect(gmbKey('KLN', '25ms')).toBe('KLN-25MS');
    expect(parseGmbKey('KLN-25MS')).toEqual({ region: 'KLN', code: '25MS' });
    expect(parseGmbKey('nt-2')).toEqual({ region: 'NT', code: '2' });
    expect(parseGmbKey('HKI-116H')).toEqual({ region: 'HKI', code: '116H' });
    for (const bad of ['2', 'XX-2', 'NT-', 'NT-2-3', 'NT-ABCDEF', '-2', '']) expect(parseGmbKey(bad)).toBeNull();
  });
  it('routeCode / routeRegion / routeMode', () => {
    expect(routeCode('gmb', 'KLN-25MS')).toBe('25MS');
    expect(routeCode('gmb', 'NT-2')).toBe('2');
    expect(routeCode('ctb', 'N8P')).toBe('N8P');
    expect(routeCode(undefined, '101')).toBe('101');
    // 唔係專線小巴格式就原樣（唔好食咗）
    expect(routeCode('gmb', 'weird')).toBe('weird');
    expect(routeRegion('gmb', 'HKI-4A')).toBe('HKI');
    expect(routeRegion('ctb', 'HKI-4A')).toBeNull();
    expect(routeRegion('gmb', '4A')).toBeNull();
    expect(routeMode('gmb')).toBe('minibus');
    expect(routeMode('kmb')).toBe('bus');
    expect(routeMode(undefined)).toBe('bus');
  });
  it('regions', () => {
    expect(GMB_REGIONS.map((r) => GMB_REGION_NAME[r])).toEqual(['港島', '九龍', '新界']);
  });
});

describe('route page helpers', () => {
  const data = { origTc: '鰂魚涌(船塢里)', destTc: '鰂魚涌(船塢里)(循環線)' };
  it('routeTitle：專線小巴「號碼（地區）」，其他原樣', () => {
    expect(routeTitle('gmb', 'NT-2')).toBe('2（新界）');
    expect(routeTitle('ctb', '101')).toBe('101');
  });
  it('vehicleNoun', () => {
    expect(vehicleNoun('GMB')).toBe('小巴');
    expect(vehicleNoun('CTB')).toBe('巴士');
    expect(vehicleNoun(undefined)).toBe('巴士');
  });
  it('routeHeadDest：專線小巴用路線起訖點；非循環特別班、其他公司用最後一個站', () => {
    const normal = { special: false, name: 'A - B' };
    expect(routeHeadDest('gmb', data, 'O', normal, '數碼港道')).toBe('鰂魚涌(船塢里)(循環線)');
    expect(routeHeadDest('gmb', data, 'I', normal, '數碼港道')).toBe('鰂魚涌(船塢里)');
    expect(routeHeadDest('gmb', data, 'O', { special: true, name: 'A - C(短程班次)' }, '短程終點')).toBe('短程終點');
    expect(routeHeadDest('gmb', data, 'O', { special: true, name: 'A - A(循環線)(特別班次)' }, '數碼港道')).toBe('鰂魚涌(船塢里)(循環線)');
    expect(routeHeadDest('ctb', data, 'O', normal, '北角碼頭')).toBe('北角碼頭');
    expect(routeHeadDest('gmb', data, 'O', null, '數碼港道')).toBe('數碼港道');
    expect(routeHeadDest('gmb', { origTc: '', destTc: '' }, 'O', normal, '數碼港道')).toBe('數碼港道');
  });
  it('lastStopIsTerminus：專線小巴循環線最後一個站有車費 = 上得車', () => {
    expect(lastStopIsTerminus('gmb', { fares: { s9: 3.5 } }, 's9')).toBe(false);
    expect(lastStopIsTerminus('gmb', { fares: { s1: 3.5 } }, 's9')).toBe(true);
    expect(lastStopIsTerminus('gmb', null, 's9')).toBe(true);
    expect(lastStopIsTerminus('ctb', { fares: { s9: 3.5 } }, 's9')).toBe(true);
  });
});

describe('gmb opt-in (old App compatibility)', () => {
  it('reads gmb=1', () => {
    expect(gmbOptIn(new URLSearchParams('lat=1&gmb=1'))).toBe(true);
    expect(gmbOptIn(new URLSearchParams('lat=1'))).toBe(false);
    expect(gmbOptIn(new URLSearchParams('gmb=0'))).toBe(false);
  });
  it('adds gmb=1 once', () => {
    expect(withGmbOptIn('/api/routes')).toBe('/api/routes?gmb=1');
    expect(withGmbOptIn('/api/here?lat=1&lng=2')).toBe('/api/here?lat=1&lng=2&gmb=1');
    expect(withGmbOptIn('/api/here?gmb=1&lat=1')).toBe('/api/here?gmb=1&lat=1');
    expect(withGmbOptIn('https://rt/api/stop-etas?co=gmb&stop=1#x')).toBe('https://rt/api/stop-etas?co=gmb&stop=1&gmb=1#x');
  });
});

describe('parseGmbStopEta', () => {
  it('parses the real /eta/stop sample', () => {
    const items = parseGmbStopEta(stopEta);
    expect(items).toHaveLength(8);
    const first = items[0]!;
    expect(first).toMatchObject({ routeId: '2006408', routeSeq: 1, stopSeq: 4 });
    expect(first.etas).toHaveLength(3);
    // 「未開出」= 時間表時間
    expect(first.etas[0]).toEqual({ at: '2026-11-09T21:55:06+08:00', remarkTc: '未開出', remarkEn: 'Scheduled', scheduled: true });
    for (const it of items) for (const e of it.etas) expect(e.at).toMatch(HK_ISO);
    expect(items.find((x) => x.routeId === '2006475')!.etas).toEqual([]);
  });

  it('live, delayed, duplicates, UTC timestamps', () => {
    const body = {
      data: [
        {
          route_id: 2000511,
          route_seq: 2,
          stop_seq: 3,
          enabled: true,
          eta: [
            { eta_seq: 1, timestamp: '2026-11-09T21:48:14.679+08:00', remarks_tc: null, remarks_en: null },
            // 3 秒之後又一班：同一架車
            { eta_seq: 2, timestamp: '2026-11-09T21:48:17.317+08:00', remarks_tc: null, remarks_en: null },
            { eta_seq: 3, timestamp: '2026-11-09T13:58:14.839Z', remarks_tc: '行車受阻', remarks_en: 'Delayed' },
          ],
        },
        {
          route_id: 2000819,
          route_seq: 1,
          stop_seq: 4,
          enabled: true,
          eta: [
            // 時間表同實時相差 10 秒：留實時
            { eta_seq: 1, timestamp: '2026-11-09T22:00:00.000+08:00', remarks_tc: '未開出', remarks_en: 'Scheduled' },
            { eta_seq: 2, timestamp: '2026-11-09T22:00:10.000+08:00', remarks_tc: null, remarks_en: null },
            { eta_seq: 3, timestamp: 'bad', remarks_tc: null, remarks_en: null },
          ],
        },
        { route_id: 2000820, route_seq: 1, stop_seq: 4, enabled: false, eta: [{ timestamp: '2026-11-09T22:00:00+08:00' }] },
      ],
    };
    const [a, b, c] = parseGmbStopEta(body);
    expect(a!.etas).toEqual([
      { at: '2026-11-09T21:48:14+08:00', remarkTc: '', remarkEn: '', scheduled: false },
      { at: '2026-11-09T21:58:14+08:00', remarkTc: '行車受阻', remarkEn: 'Delayed', scheduled: false },
    ]);
    expect(b!.etas).toEqual([{ at: '2026-11-09T22:00:10+08:00', remarkTc: '', remarkEn: '', scheduled: false }]);
    // enabled: false = 暫停到站服務
    expect(c!.etas).toEqual([]);
  });

  it('bad bodies give nothing', () => {
    expect(parseGmbStopEta(null)).toEqual([]);
    expect(parseGmbStopEta({ code: 500, message: 'ETA unavailable' })).toEqual([]);
    expect(parseGmbStopEta({ data: { stop_id: 1 } })).toEqual([]);
    expect(parseGmbStopEta({ data: [{ route_seq: 1, stop_seq: 1, eta: [] }] })).toEqual([]);
  });
});

describe('fetchGmbStopEta', () => {
  it('calls /eta/stop/{id}', async () => {
    const { f, calls } = fakeFetch(() => json(stopEta));
    expect(await fetchGmbStopEta('20000024', f)).toHaveLength(8);
    expect(calls).toEqual([`${GMB_BASE}/eta/stop/20000024`]);
  });
  it('"ETA unavailable" and 404 mean no service, not failure', async () => {
    expect(await fetchGmbStopEta('1', fakeFetch(() => json({ code: 500, message: 'ETA unavailable' }, 500)).f)).toEqual([]);
    expect(await fetchGmbStopEta('1', fakeFetch(() => json({ message: 'Not Found' }, 404)).f)).toEqual([]);
  });
  it('other errors throw', async () => {
    await expect(fetchGmbStopEta('1', fakeFetch(() => new Response('bad gateway', { status: 502 })).f)).rejects.toThrow('502');
    await expect(fetchGmbStopEta('1', fakeFetch(() => json({ code: 500, message: 'Internal' }, 500)).f)).rejects.toThrow('500');
  });
});

describe('gmbEtas', () => {
  const STOP = '20000093';
  const variant = (id: string, routeId: string, routeSeq: number, expSeq: Record<string, number>, special = false): Variant => ({
    id,
    govRouteId: routeId,
    govDir: String(routeSeq),
    name: id,
    special,
    stops: [],
    stopDirs: [],
    stopMatch: [],
    offsets: [],
    schedules: [],
    line: null,
    lineAligned: false,
    expSeq,
    gmb: { routeId, routeSeq },
  });
  const route = (key: string, variants: Variant[]): RouteData => ({
    company: 'GMB',
    companies: ['GMB'],
    route: key,
    origTc: `${key} 起點`,
    destTc: `${key} 終點`,
    origEn: 'From',
    destEn: 'To',
    stops: {},
    directions: {},
    ctbOnlyStops: [],
    variants,
  });

  // 2000971、2000968 喺呢個站有 stop_seq 1 同 13／14（循環線第二次經過）
  const a = route('NT-A', [
    variant('2000971-1', '2000971', 1, { [`O:${STOP}`]: 1 }),
    // 特別班反方向：dir 由路線檔決定，唔係 route_seq
    variant('2000967-1', '2000967', 1, { [`I:${STOP}`]: 1 }, true),
  ]);
  // expSeq 對唔到（例如數據舊咗）：用最細嗰個 stop_seq
  const b = route('NT-B', [variant('2000968-1', '2000968', 1, { [`O:${STOP}`]: 99 })]);
  // 經過另一個站：唔關事
  const c = route('NT-C', [variant('2000970-1', '2000970', 1, { 'O:20000001': 1 })]);

  it('one fetch for several routes; maps (routeId, routeSeq) to variant and dir', async () => {
    const { f, calls } = fakeFetch(() => json(loopEta));
    const etas = await gmbEtas(STOP, [a, b, c], f);
    expect(calls).toEqual([`${GMB_BASE}/eta/stop/${STOP}`]);

    const ofA = etas.filter((e) => e.route === 'NT-A' && e.variant?.variantId === '2000971-1');
    // 第一次經過（stop_seq 1）嘅班次；stop_seq 13 嘅（21:43、21:53 實時）唔要
    expect(ofA.map((e) => e.eta)).toEqual(['2026-11-09T21:48:00+08:00', '2026-11-09T22:00:00+08:00', '2026-11-09T22:12:00+08:00']);
    expect(ofA.every((e) => e.seq === 1 && e.dir === 'O' && e.destTc === 'NT-A 終點' && e.scheduled)).toBe(true);
    expect(ofA[0]).toMatchObject({ company: 'GMB', stopId: STOP, variant: { confidence: 'certain', special: false } });

    const special = etas.filter((e) => e.variant?.variantId === '2000967-1');
    expect(special).toHaveLength(3);
    expect(special.every((e) => e.dir === 'I' && e.destTc === 'NT-A 起點' && e.variant?.special)).toBe(true);

    const ofB = etas.filter((e) => e.route === 'NT-B');
    expect(ofB.every((e) => e.seq === 1)).toBe(true);
    expect(ofB).toHaveLength(3);

    // 2000970 唔經呢個站（路線檔講），即使 API 有都唔要
    expect(etas.some((e) => e.route === 'NT-C')).toBe(false);
    // 按時間排
    expect(etas.map((e) => e.eta)).toEqual([...etas.map((e) => e.eta)].sort());
  });

  it('ignores route ids that are not in the route files', async () => {
    const { f } = fakeFetch(() => json(stopEta));
    expect(await gmbEtas('20000024', [route('NT-X', [variant('1-1', '1', 1, { 'O:20000024': 4 })])], f)).toEqual([]);
  });

  it('does not fetch when no variant passes the stop', async () => {
    const { f, calls } = fakeFetch(() => json(loopEta));
    expect(await gmbEtas(STOP, [c], f)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('no ETA service → empty, errors propagate', async () => {
    expect(await gmbEtas(STOP, [a], fakeFetch(() => json({ code: 500, message: 'ETA unavailable' }, 500)).f)).toEqual([]);
    await expect(gmbEtas(STOP, [a], fakeFetch(() => new Response('', { status: 503 })).f)).rejects.toThrow();
  });
});
