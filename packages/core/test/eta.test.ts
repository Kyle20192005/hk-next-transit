import { describe, expect, it } from 'vitest';
import { etasAtStop, etasAtStopDetailed, type RouteData } from '../src';

// 聯營線：城巴路線檔，站 S1 嘅九巴站 ID 係 K1；九巴嘅 bound 同城巴相反（城巴 O = 九巴 I）
const route = {
  company: 'CTB',
  companies: ['CTB', 'KMB'],
  route: '101',
  origTc: 'A', destTc: 'B', origEn: null, destEn: null,
  stops: { S1: { nameTc: '站', nameEn: '', lat: 22.3, lng: 114.17, kmb: 'K1' } },
  directions: { O: ['S1'] },
  ctbOnlyStops: [],
  variants: [
    {
      id: '1482-2', govRouteId: '1482', govDir: '2', name: '堅尼地城 - 觀塘', special: false,
      stops: ['S1'], stopDirs: ['O'], stopMatch: ['A'], offsets: [0], schedules: [], line: null, lineAligned: false,
      expSeq: { 'O:S1': 1 }, kmb: { bound: 'I', serviceType: '1' },
    },
  ],
} as unknown as RouteData;

const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

const fakeFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('citybus')) {
    return json([
      { co: 'CTB', route: '101', dir: 'O', seq: 1, stop: 'S1', dest_tc: '觀塘', dest_en: '', eta: '2026-11-03T10:05:00+08:00', rmk_tc: '', rmk_en: '' },
      { co: 'CTB', route: '101', dir: 'O', seq: 1, stop: 'S1', dest_tc: '觀塘', dest_en: '', eta: '', rmk_tc: '九巴時段', rmk_en: '' },
    ]);
  }
  if (url.includes('etabus')) {
    expect(url).toContain('/eta/K1/101/1');
    return json([
      { co: 'KMB', route: '101', dir: 'I', service_type: 1, seq: 5, dest_tc: '觀塘', dest_en: '', eta: '2026-11-03T10:02:00+08:00', rmk_tc: '原定班次', rmk_en: '' },
      { co: 'KMB', route: '101', dir: 'O', service_type: 1, seq: 9, dest_tc: '堅尼地城', dest_en: '', eta: '2026-11-03T10:03:00+08:00', rmk_tc: '', rmk_en: '' },
    ]);
  }
  throw new Error(url);
}) as typeof fetch;

describe('聯營線合併兩間公司嘅到站時間', () => {
  it('九巴同城巴按時間排，九巴方向轉做城巴方向，冇時間嘅佔位項目過濾走', async () => {
    const etas = await etasAtStop(route, 'S1', {}, fakeFetch);
    expect(etas.map((e) => [e.company, e.eta?.slice(11, 16), e.dir, e.scheduled ?? false])).toEqual([
      ['KMB', '10:02', 'O', true],
      ['CTB', '10:05', 'O', false],
    ]);
    expect(etas[0]!.variant).toMatchObject({ variantId: '1482-2', confidence: 'certain' });
  });
});

describe('九巴做主幹嘅聯營線（例如 101R）', () => {
  const kroute = {
    company: 'KMB', companies: ['CTB', 'KMB'], route: '101R',
    origTc: 'A', destTc: 'B', origEn: null, destEn: null,
    stops: { K1: { nameTc: '站', nameEn: '', lat: 22.3, lng: 114.17, ctb: 'C1' } },
    directions: { O: ['K1'] }, ctbOnlyStops: [],
    variants: [
      {
        id: 'O1', govRouteId: null, govDir: null, name: 'A - B', special: false,
        stops: ['K1'], stopDirs: ['O'], stopMatch: ['A'], offsets: [0], schedules: [], line: null, lineAligned: false,
        expSeq: { 'O:K1': 1 }, kmb: { bound: 'O', serviceType: '1' }, ctb: { dir: 'I' },
      },
    ],
  } as unknown as RouteData;

  it('城巴嘅車按方向對應九巴走法，方向轉做九巴嘅', async () => {
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('citybus')) {
        expect(url).toContain('/eta/CTB/C1/101R');
        return json([
          { co: 'CTB', route: '101R', dir: 'I', seq: 3, stop: 'C1', dest_tc: 'B', dest_en: '', eta: '2026-11-03T18:10:00+08:00', rmk_tc: '', rmk_en: '' },
          { co: 'CTB', route: '101R', dir: 'O', seq: 3, stop: 'C1', dest_tc: 'A', dest_en: '', eta: '2026-11-03T18:11:00+08:00', rmk_tc: '', rmk_en: '' },
        ]);
      }
      return json([{ co: 'KMB', route: '101R', dir: 'O', service_type: 1, seq: 1, dest_tc: 'B', dest_en: '', eta: '2026-11-03T18:05:00+08:00', rmk_tc: '', rmk_en: '' }]);
    }) as typeof fetch;
    const etas = await etasAtStop(kroute, 'K1', {}, f);
    expect(etas.map((e) => [e.company, e.eta?.slice(11, 16), e.dir])).toEqual([
      ['KMB', '18:05', 'O'],
      ['CTB', '18:10', 'O'],
    ]);
  });
});

describe('九巴唔同 service_type 回傳同一批車（例如 107）', () => {
  const r107 = {
    company: 'CTB', companies: ['CTB', 'KMB'], route: '107',
    origTc: 'A', destTc: 'B', origEn: null, destEn: null,
    stops: { S1: { nameTc: '華貴邨', nameEn: '', lat: 22.25, lng: 114.13, kmb: 'K1' } },
    directions: { O: ['S1'] }, ctbOnlyStops: [],
    variants: [
      { id: '1491-1', govRouteId: '1491', govDir: '1', name: '九龍灣 - 華貴', special: false, stops: ['S1'], stopDirs: ['O'], stopMatch: ['A'], offsets: [0], schedules: [], line: null, lineAligned: false, expSeq: { 'O:S1': 1 }, kmb: { bound: 'I', serviceType: '1' } },
      { id: '8468-1', govRouteId: '8468', govDir: '1', name: '九龍灣 - 華貴(經海洋公園)', special: true, stops: ['S1'], stopDirs: ['O'], stopMatch: ['A'], offsets: [0], schedules: [], line: null, lineAligned: false, expSeq: { 'O:S1': 1 }, kmb: { bound: 'I', serviceType: '2' } },
    ],
  } as unknown as RouteData;

  it('同一班車只出一次，當正常路線', async () => {
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('citybus')) return json([]);
      const st = Number(url.split('/').pop());
      return json([{ co: 'KMB', route: '107', dir: 'I', service_type: st, seq: 1, dest_tc: '', dest_en: '', eta: '2026-11-03T16:00:00+08:00', rmk_tc: '原定班次', rmk_en: '' }]);
    }) as typeof fetch;
    const etas = await etasAtStop(r107, 'S1', {}, f);
    expect(etas).toHaveLength(1);
    expect(etas[0]!.variant?.variantId).toBe('1491-1');
  });
});

describe('營辦商 API 出錯', () => {
  it('重試一次', async () => {
    let calls = 0;
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('citybus')) {
        calls++;
        if (calls === 1) return new Response('err', { status: 500 });
        return json([{ co: 'CTB', route: '101', dir: 'O', seq: 1, stop: 'S1', dest_tc: '', dest_en: '', eta: '2026-11-03T10:05:00+08:00', rmk_tc: '', rmk_en: '' }]);
      }
      return json([]);
    }) as typeof fetch;
    const r = await etasAtStopDetailed(route, 'S1', {}, f);
    expect(calls).toBe(2);
    expect(r.failed).toEqual([]);
    expect(r.etas.map((e) => e.company)).toEqual(['CTB']);
  });

  it('重試都唔得：記低邊間公司攞唔到，其他公司照出', async () => {
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('citybus')) return new Response('err', { status: 500 });
      return json([{ co: 'KMB', route: '101', dir: 'I', service_type: 1, seq: 5, dest_tc: '', dest_en: '', eta: '2026-11-03T10:02:00+08:00', rmk_tc: '', rmk_en: '' }]);
    }) as typeof fetch;
    const r = await etasAtStopDetailed(route, 'S1', {}, f);
    expect(r.failed).toEqual(['CTB']);
    expect(r.etas.map((e) => e.company)).toEqual(['KMB']);
  });
});
