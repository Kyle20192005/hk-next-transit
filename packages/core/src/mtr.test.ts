import { describe, expect, it } from 'vitest';
import { mtrStationLines, mtrTermini, parseMtrSchedule } from './mtr';

describe('mtr', () => {
  it('station lines', () => {
    expect(mtrStationLines('ADM')).toEqual(['ISL', 'TWL', 'EAL', 'SIL']);
    expect(mtrStationLines('TKO')).toEqual(['TKL']);
  });
  it('termini include branches', () => {
    expect(mtrTermini('EAL').up.sort()).toEqual(['LMC', 'LOW']);
    expect(mtrTermini('TKL').up.sort()).toEqual(['LHP', 'POA']);
  });
  it('parses schedule', () => {
    const body = {
      status: 1,
      isdelay: 'N',
      data: {
        'TWL-TST': {
          UP: [{ seq: '1', dest: 'TSW', plat: '2', time: '2026-11-09 08:01:00', ttnt: '2', valid: 'Y' }],
          DOWN: [{ seq: '1', dest: 'CEN', plat: '1', time: '2026-11-09 08:03:00', ttnt: '4', valid: 'Y' }],
        },
      },
    };
    const r = parseMtrSchedule(body, 'TWL', 'TST')!;
    expect(r.dirs[0]).toEqual({ dir: 'UP', label: '往 荃灣', trains: [{ dest: 'TSW', destName: '荃灣', plat: '2', time: '2026-11-09T08:01:00+08:00', mins: 2 }] });
    expect(r.dirs[1]!.label).toBe('往 中環');
  });
  it('terminus: no empty direction, no-service shows termini', () => {
    const r = parseMtrSchedule({ status: 1, data: { 'TWL-TSW': { UP: [], DOWN: [] } } }, 'TWL', 'TSW')!;
    expect(r.dirs.map((d) => d.label)).toEqual(['往 中環']);
    expect(parseMtrSchedule({ status: 0 }, 'TWL', 'TSW')).toBeNull();
    // 收車後 API 俾聽日嘅班次：唔要
    const late = parseMtrSchedule({ status: 1, data: { 'ISL-ADM': { DOWN: [{ dest: 'KET', plat: '2', time: '2026-11-10 01:21:46', ttnt: '1432', valid: 'Y' }] } } }, 'ISL', 'ADM')!;
    expect(late.dirs.find((d) => d.dir === 'DOWN')!.trains).toEqual([]);
  });
});

import { MTR_MAP_DOT_R, MTR_MAP_GAP, MTR_MAP_LINES, MTR_MAP_RADIUS, MTR_MAP_VIEW, MTR_MAP_WATER, mtrLinePathD, mtrMapStations } from './mtr-map';
import { MTR_LINE_STATIONS } from './mtr-data';

describe('mtr map', () => {
  it('every station of every line is on the map, on its line', () => {
    for (const [key, list] of Object.entries(MTR_LINE_STATIONS)) {
      const line = MTR_MAP_LINES.find((l) => l.line === key.split(':')[0])!;
      for (const c of list) expect(line.stations[c], `${key} ${c}`).toBeDefined();
    }
  });
  it('lines only go horizontal, vertical or 45°', () => {
    for (const l of MTR_MAP_LINES)
      for (const p of l.paths)
        for (let i = 1; i < p.length; i++) {
          const dx = Math.abs(p[i]![0] - p[i - 1]![0]);
          const dy = Math.abs(p[i]![1] - p[i - 1]![1]);
          expect(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-3, `${l.line} segment ${i}`).toBe(true);
        }
  });
  it('interchanges have all their lines', () => {
    const adm = mtrMapStations().find((s) => s.code === 'ADM')!;
    expect(adm.lines.sort()).toEqual(['EAL', 'ISL', 'SIL', 'TWL']);
  });
});

describe('mtr map geometry', () => {
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
  // 轉角：角度、半徑、彎位由轉角起計幾長
  const turn = (path: readonly (readonly number[])[], i: number) => {
    const [a, p, b] = [path[i - 1]!, path[i]!, path[i + 1]!];
    const v1 = [p[0]! - a[0]!, p[1]! - a[1]!];
    const v2 = [b[0]! - p[0]!, b[1]! - p[1]!];
    const cos = (v1[0]! * v2[0]! + v1[1]! * v2[1]!) / (Math.hypot(v1[0]!, v1[1]!) * Math.hypot(v2[0]!, v2[1]!));
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    const r = p[2] ?? MTR_MAP_RADIUS;
    return { deg, t: r * Math.tan((deg * Math.PI) / 360) };
  };
  it('every station sits on its own line, on the straight part (not inside a bend)', () => {
    for (const l of MTR_MAP_LINES) {
      for (const [code, p] of Object.entries(l.stations)) {
        const segs = l.paths.flatMap((path) => path.slice(1).map((b, i) => [path[i]!, b] as const));
        const on = segs.some(([a, b]) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < 0.01);
        expect(on, `${l.line} ${code} on line`).toBe(true);
        for (const path of l.paths)
          for (let i = 1; i < path.length - 1; i++) {
            const d = dist(path[i]!, p);
            const near = [path[i - 1]!, path[i + 1]!].some((q) => Math.abs(dist(q, p) + dist(p, path[i]!) - dist(q, path[i]!)) < 0.01);
            if (near && d > 0) expect(d, `${l.line} ${code} too close to corner ${path[i]}`).toBeGreaterThanOrEqual(turn(path, i).t + 0.15 - 1e-6);
          }
      }
    }
  });
  it('every turn is 45°, 90° or 135° (Disneyland) and every segment has room for its bends', () => {
    for (const l of MTR_MAP_LINES)
      for (const path of l.paths) {
        const t = path.map((_, i) => (i === 0 || i === path.length - 1 ? 0 : turn(path, i).t));
        for (let i = 1; i < path.length - 1; i++) {
          const { deg } = turn(path, i);
          expect(Math.min(Math.abs(deg - 45), Math.abs(deg - 90), Math.abs(deg - 135)), `${l.line} corner ${path[i]}`).toBeLessThan(0.5);
        }
        for (let i = 1; i < path.length; i++) expect(dist(path[i - 1]!, path[i]!), `${l.line} ${path[i - 1]}→${path[i]}`).toBeGreaterThanOrEqual(t[i - 1]! + t[i]! - 1e-6);
      }
  });
  it('line paths render as arcs', () => {
    const d = mtrLinePathD([
      [0, 0],
      [5, 0],
      [5, 5],
    ]);
    expect(d).toContain(`A${MTR_MAP_RADIUS} ${MTR_MAP_RADIUS} 0 0 1`);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d.endsWith('L5 5')).toBe(true);
  });
  it('branch stations (Sheung Shui, Tseung Kwan O): main line top circle, branch starts at the bottom circle', () => {
    for (const [code, branchEnd] of [
      ['SHS', 'LMC'],
      ['TKO', 'LHP'],
    ] as const) {
      const s = mtrMapStations().find((x) => x.code === code)!;
      expect(s.pts.length, code).toBe(2);
      expect(s.lines.length, code).toBe(1);
      // 支綫 path 由下面個圈出發，去支綫總站
      const line = MTR_MAP_LINES.find((l) => l.line === s.lines[0])!;
      const branch = line.paths.find((p) => p[0]![0] === s.pts[1]![0] && p[0]![1] === s.pts[1]![1])!;
      expect(branch, code).toBeDefined();
      const end = branch[branch.length - 1]!;
      expect([end[0], end[1]]).toEqual([...line.stations[branchEnd]!]);
      expect(s.pts[1]![1]).toBeGreaterThan(s.pts[0]![1]);
    }
  });
  it('Racecourse is on a dashed East Rail path; Hong Kong sits right above Central', () => {
    const eal = MTR_MAP_LINES.find((l) => l.line === 'EAL')!;
    expect(eal.dashed?.length).toBe(1);
    const dashed = eal.paths[eal.dashed![0]!]!;
    const rac = eal.stations.RAC!;
    expect(dashed.some((p, i) => i > 0 && Math.abs(Math.hypot(rac[0] - p[0], rac[1] - p[1]) + Math.hypot(rac[0] - dashed[i - 1]![0], rac[1] - dashed[i - 1]![1]) - Math.hypot(p[0] - dashed[i - 1]![0], p[1] - dashed[i - 1]![1])) < 0.01)).toBe(true);
    const st = mtrMapStations();
    const hok = st.find((s) => s.code === 'HOK')!;
    const cen = st.find((s) => s.code === 'CEN')!;
    expect(hok.pts.every((p) => p[0] === cen.pts[0]![0])).toBe(true);
    expect(Math.max(...hok.pts.map((p) => p[1]))).toBeLessThan(Math.min(...cen.pts.map((p) => p[1])));
  });
  it('Hung Hom interchange is tilted 45°; at Ho Man Tin the Tuen Ma and Kwun Tong lines run side by side horizontally', () => {
    const st = mtrMapStations();
    const huh = st.find((s) => s.code === 'HUH')!;
    expect(Math.abs(huh.pts[0]![0] - huh.pts[1]![0])).toBeCloseTo(Math.abs(huh.pts[0]![1] - huh.pts[1]![1]), 4);
    const hom = st.find((s) => s.code === 'HOM')!;
    expect(hom.pts[0]![0]).toBe(hom.pts[1]![0]);
    // 兩條綫喺何文田都係橫行
    for (const code of ['KTL', 'TML']) {
      const l = MTR_MAP_LINES.find((x) => x.line === code)!;
      const p = l.stations.HOM!;
      const seg = l.paths.flatMap((path) => path.slice(1).map((b, i) => [path[i]!, b] as const)).find(([a, b]) => Math.abs(Math.hypot(p[0] - a[0], p[1] - a[1]) + Math.hypot(b[0] - p[0], b[1] - p[1]) - Math.hypot(b[0] - a[0], b[1] - a[1])) < 0.01)!;
      expect(seg[0][1], code).toBe(seg[1][1]);
    }
  });
  it('interchange points line up horizontally, vertically or at 45°, circles touching (G apart)', () => {
    for (const s of mtrMapStations()) {
      if (s.pts.length < 2) continue;
      const a = s.pts[0]!;
      const b = s.pts.reduce((m, p) => (Math.hypot(p[0] - a[0], p[1] - a[1]) > Math.hypot(m[0] - a[0], m[1] - a[1]) ? p : m), a);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const ok = Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-3;
      expect(ok, `${s.code} ${JSON.stringify(s.pts)}`).toBe(true);
      for (const p of s.pts) expect(Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx), `${s.code} ${p}`).toBeLessThan(1e-3);
      // 相鄰兩個圈中心相隔 G（貼住，唔會疊埋一個）
      const sorted = [...s.pts].sort((p, q) => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy - ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy));
      for (let i = 1; i < sorted.length; i++) {
        const d = Math.hypot(sorted[i]![0] - sorted[i - 1]![0], sorted[i]![1] - sorted[i - 1]![1]);
        expect(d, s.code).toBeGreaterThan(MTR_MAP_GAP - 0.01);
        expect(d, s.code).toBeLessThan(2 * MTR_MAP_DOT_R + 0.01);
      }
    }
  });

  it('water: first ring frames the whole map, and every station is on land (evenodd)', () => {
    const [frame, ...rest] = MTR_MAP_WATER;
    const xs = frame!.map((p) => p[0]);
    const ys = frame!.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(MTR_MAP_VIEW.minX);
    expect(Math.max(...xs)).toBeGreaterThan(MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width);
    expect(Math.min(...ys)).toBeLessThan(MTR_MAP_VIEW.minY);
    expect(Math.max(...ys)).toBeGreaterThan(MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height);
    expect(rest.length).toBeGreaterThan(5);
    const inside = (ring: readonly (readonly [number, number])[], x: number, y: number) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (const s of mtrMapStations()) {
      const x = s.box.x + s.box.w / 2;
      const y = s.box.y + s.box.h / 2;
      const water = MTR_MAP_WATER.filter((r) => inside(r, x, y)).length % 2 === 1;
      expect(water, `${s.code} 喺海度`).toBe(false);
    }
  });
});

describe('mtr search + eta text', () => {
  it('finds stations by Chinese, English, code', async () => {
    const { searchMtrStations } = await import('./mtr');
    expect(searchMtrStations('旺角')[0]).toBe('MOK');
    expect(searchMtrStations('旺角站')[0]).toBe('MOK');
    expect(searchMtrStations('mong kok')[0]).toBe('MOK');
    expect(searchMtrStations('MongKok')[0]).toBe('MOK');
    expect(searchMtrStations('tko')[0]).toBe('TKO');
    expect(searchMtrStations('茘景')[0]).toBe('LAK');
    expect(searchMtrStations('kok')).toContain('MOK');
    expect(searchMtrStations('馬場')[0]).toBe('RAC');
    expect(searchMtrStations('  ')).toEqual([]);
    expect(searchMtrStations('zzzz')).toEqual([]);
  });
  it('formats train times like station displays', async () => {
    const { mtrTrainEta } = await import('./mtr');
    const time = '2026-11-09T09:05:00+08:00';
    expect(mtrTrainEta({ mins: 0, time }, 'minutes').main).toBe('正在離開');
    expect(mtrTrainEta({ mins: 1, time }, 'minutes').main).toBe('即將到站');
    expect(mtrTrainEta({ mins: 4, time }, 'minutes')).toEqual({ main: '4', unit: '分鐘', now: false });
    expect(mtrTrainEta({ mins: 4, time }, 'clock').main).toBe('09:05');
  });
});

describe('mtr no data', () => {
  it('marks a line with no schedule data (curr_time "-") as noData, not empty', () => {
    const r = parseMtrSchedule({ sys_time: '-', curr_time: '-', data: { 'KTL-KOT': { curr_time: '-', sys_time: '-' } }, isdelay: 'N', status: 1 }, 'KTL', 'KOT');
    expect(r).toEqual({ line: 'KTL', dirs: [], delayed: false, noData: true });
  });
});

describe('mtr nearby + departure rows', () => {
  it('finds nearest stations by real position (no Racecourse)', async () => {
    const { nearestMtrStations } = await import('./mtr');
    // 旺角道／彌敦道交界附近
    const near = nearestMtrStations(22.3193, 114.1694, 800);
    expect(near[0]?.sta).toBe('MOK');
    expect(near[0]!.distance).toBeLessThan(80);
    expect(near.map((s) => s.sta)).toContain('PRE');
    // 火炭／大學附近都唔會出馬場
    expect(nearestMtrStations(22.4003, 114.2029, 2000).map((s) => s.sta)).not.toContain('RAC');
    // 海中間冇站
    expect(nearestMtrStations(22.2, 114.3, 800)).toEqual([]);
  });
  it('builds card rows: one per line-direction, soonest first, line colour + platform', async () => {
    const { mtrDepartureRows, mtrLineShort } = await import('./mtr');
    const t = (m: number) => `2026-11-09T09:${String(m).padStart(2, '0')}:00+08:00`;
    const rows = mtrDepartureRows('ADM', [
      { line: 'TWL', delayed: false, dirs: [{ dir: 'UP', label: '往 荃灣', trains: [{ dest: 'TSW', destName: '荃灣', plat: '3', time: t(5), mins: 4 }, { dest: 'TSW', destName: '荃灣', plat: '3', time: t(8), mins: 7 }] }] },
      { line: 'ISL', delayed: false, dirs: [{ dir: 'DOWN', label: '往 堅尼地城', trains: [{ dest: 'KET', destName: '堅尼地城', plat: '2', time: t(1), mins: 0 }] }] },
      { line: 'KTL', delayed: false, dirs: [], noData: true },
    ]);
    expect(rows.map((r) => r.badge.text)).toEqual(['港島', '荃灣']);
    expect(rows[0]).toMatchObject({ dest: '堅尼地城', platform: '2', nowText: '正在離開', link: { co: 'mtr', stop: 'ADM', dir: 'I' } });
    expect(rows[1]?.badge.bg).toBe('#E2231A');
    expect(mtrLineShort('AEL')).toBe('機鐵');
    // 只要收藏咗嘅綫
    expect(
      mtrDepartureRows('ADM', [
        { line: 'TWL', delayed: false, dirs: [{ dir: 'UP', label: '往 荃灣', trains: [{ dest: 'TSW', destName: '荃灣', plat: '3', time: t(5), mins: 4 }] }] },
        { line: 'ISL', delayed: false, dirs: [{ dir: 'DOWN', label: '往 堅尼地城', trains: [{ dest: 'KET', destName: '堅尼地城', plat: '2', time: t(1), mins: 0 }] }] },
      ], 4, ['TWL']).map((r) => r.badge.text),
    ).toEqual(['荃灣']);
  });
});
