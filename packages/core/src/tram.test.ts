import { describe, expect, it } from 'vitest';
import {
  nearestTramStations,
  oppositeTramStation,
  parseTramEta,
  searchTramStations,
  tramDepartureRows,
  tramRecent,
  tramStationLabel,
  tramStopTitle,
  tramStationByCode,
  tramStopSchedule,
  type TramTimetable,
} from './tram';
import { TRAM_ORDER, TRAM_ROUTES, TRAM_STATIONS } from './tram-data';
import { TRAM_MAP_LABELS, TRAM_MAP_STOPS, TRAM_MAP_TERMS } from './tram-map';
import type { Calendar } from './types';

describe('電車數據', () => {
  it('路線嘅站全部存在、地圖每個站都有點同站名', () => {
    const ids = new Set(TRAM_STATIONS.map((s) => s.id));
    for (const r of TRAM_ROUTES) for (const seq of Object.values(r.dirs)) for (const s of seq) expect(ids.has(s)).toBe(true);
    const drawn = new Set([...TRAM_MAP_STOPS, ...TRAM_MAP_TERMS].map((s) => s.id));
    const labelled = new Set(TRAM_MAP_LABELS.map((l) => l.id));
    for (const id of ids) {
      expect(drawn.has(id)).toBe(true);
      expect(labelled.has(id)).toBe(true);
    }
    expect(TRAM_ORDER.W[0]).toBe('SKT');
    expect(TRAM_ORDER.E[0]).toBe('KTT');
  });
  it('支綫站同總站：直通車唔經（春秧街只有去北角嘅車、北角總站只有開去石塘咀）', () => {
    for (const r of TRAM_ROUTES)
      for (const seq of Object.values(r.dirs)) {
        if (seq.includes('67E')) expect(seq[seq.length - 1]).toBe('NPT');
        if (seq.slice(1, -1).includes('NPT') || seq.slice(1, -1).includes('CBT')) throw new Error(`${r.id} 經過總站`);
      }
    // 電車廠站只插入直通車
    expect(TRAM_ROUTES.some((r) => Object.values(r.dirs).some((s) => s.includes('94W')))).toBe(true);
  });
  it('總站有兩個到站代號', () => {
    expect(tramStationByCode('HVT_K')?.id).toBe('HVT');
    expect(tramStationByCode('HVT_B')?.id).toBe('HVT');
    expect(tramStationByCode('WM')?.id).toBe('WMT');
  });
});

describe('搜尋、附近、對面', () => {
  it('中英文搜尋，東西行同名站都出', () => {
    const hits = searchTramStations('銀行街');
    expect(hits).toEqual(expect.arrayContaining(['68W', '31E']));
    expect(searchTramStations('happy valley')[0]).toBe('HVT');
    expect(searchTramStations('跑馬地站')[0]).toBe('HVT');
    expect(searchTramStations('')).toEqual([]);
  });
  it('附近：近到遠、唔計只落客嘅站', () => {
    const s = TRAM_STATIONS.find((x) => x.id === '68W')!;
    const near = nearestTramStations(s.lat, s.lng, 300);
    expect(near[0]!.sta).toBe('68W');
    expect(near.every((x, i) => i === 0 || x.distance >= near[i - 1]!.distance)).toBe(true);
    const depot = TRAM_STATIONS.find((x) => x.id === '94W')!;
    expect(nearestTramStations(depot.lat, depot.lng, 50).map((x) => x.sta)).not.toContain('94W');
  });
  it('對面方向嘅站', () => {
    expect(oppositeTramStation('68W')).toBe('31E');
    expect(oppositeTramStation('HVT')).toBeNull();
  });
});

describe('最近睇過、站名', () => {
  it('tramRecent、tramStationLabel', () => {
    expect(tramRecent('68W')).toMatchObject({ co: 'tram', route: '68W', dest: '銀行街' });
    expect(tramStationLabel('68W')).toBe('銀行街（西行）');
    expect(tramStationLabel('31E')).toBe('銀行街（東行）');
    expect(tramStationLabel('HVT')).toBe('跑馬地');
    expect(tramStationLabel('105')).toBe('富明街');
    expect(tramStopTitle('68W')).toBe('銀行街站（西行）');
    expect(tramStopTitle('64W')).toBe('金鐘港鐵站（西行）');
    expect(tramStopTitle('SKT')).toBe('筲箕灣站');
  });
});

describe('實時（電車公司網站 XML）', () => {
  it('解析下一班電車', () => {
    const now = Date.UTC(2026, 10, 9, 9, 0, 0);
    const xml = `<?xml version="1.0" encoding="utf-8"?><root><metadata stop_code="68W" tram_id="120" tram_dest_tc="堅尼地城總站" tram_dest_en="Kennedy Town Terminus" arrive_in_minute="3" arrive_in_second="190" is_arrived="0" dest_stop_code="KTT"/><metadata stop_code="68W" tram_dest_tc="跑馬地總站" arrive_in_minute="0" arrive_in_second="20" is_arrived="1" dest_stop_code="HVT_K"/></root>`;
    const e = parseTramEta(xml, now)!;
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ dest: 'HVT', destZh: '跑馬地', arrived: true, at: now + 20_000 });
    expect(e[1]).toMatchObject({ dest: 'KTT', destZh: '堅尼地城', at: now + 190_000 });
    expect(parseTramEta('<?xml version="1.0" encoding="utf-8"?>\n<root/>')).toEqual([]);
    expect(parseTramEta('Not found')).toBeNull();
  });
});

describe('時間表推算', () => {
  // 一條假路線：總站 A → B → C，每 5 分鐘一班 08:00–08:30，去到 B 要 2 分鐘
  const tt: TramTimetable = {
    fare: 3.3,
    routes: [
      { id: '4001', zh: 'X', dirs: { '1': { stops: ['SKT', '02W', 'WMT'], offsets: [0, 120, 600], minutes: 10, schedules: [{ serviceId: 'D', departures: [480, 485, 490, 495, 500, 505, 510] }] } } },
      { id: '4002', zh: 'Y', dirs: { '1': { stops: ['SKT', '02W', 'HVT'], offsets: [0, 120, 600], minutes: 10, schedules: [{ serviceId: 'D', departures: [482, 492, 502] }] } } },
    ],
  };
  const cal: Calendar = { D: { days: [true, true, true, true, true, true, true], start: '20200101', end: '20991231', add: [], remove: [] } };
  // 2026-11-09 08:10 香港時間 = 00:10 UTC
  const at = new Date(Date.UTC(2026, 10, 9, 0, 10));
  it('每個目的地下幾班、幾多分鐘一班、頭尾班', () => {
    const s = tramStopSchedule(tt, cal, '02W', at);
    expect(s.map((d) => d.dest)).toEqual(['WMT', 'HVT']);
    const wm = s[0]!;
    // 08:12、08:17、08:22
    expect(wm.next.map((t) => new Date(t).toISOString().slice(11, 16))).toEqual(['00:12', '00:17', '00:22']);
    expect(wm.headway).toBe(5);
    expect(new Date(wm.first!).toISOString().slice(11, 16)).toBe('00:02');
    expect(new Date(wm.last!).toISOString().slice(11, 16)).toBe('00:32');
    expect(s[1]!.headway).toBe(10);
    // 尾站唔當開出
    expect(tramStopSchedule(tt, cal, 'WMT', at)).toEqual([]);
  });
  it('卡：冇實時就用時間表（標原定）', () => {
    const rows = tramDepartureRows('02W', null, tramStopSchedule(tt, cal, '02W', at));
    expect(rows[0]).toMatchObject({ dest: '上環（西港城）', scheduled: true, link: { co: 'tram', stop: '02W' } });
    const live = parseTramEta('<root><metadata arrive_in_second="60" is_arrived="0" dest_stop_code="KTT" tram_dest_tc="堅尼地城總站"/></root>', 0)!;
    expect(tramDepartureRows('02W', live, [])[0]).toMatchObject({ dest: '堅尼地城', at: 60_000 });
  });
});
