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

import { MTR_MAP_BEND, MTR_MAP_LINES, mtrMapStations } from './mtr-map';
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
          expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-9, `${l.line} segment ${i}`).toBe(true);
        }
  });
  it('interchanges have all their lines', () => {
    const adm = mtrMapStations().find((s) => s.code === 'ADM')!;
    expect(adm.lines.sort()).toEqual(['EAL', 'ISL', 'SIL', 'TWL']);
  });
});

describe('mtr map geometry', () => {
  const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
  it('every station sits on its own line, away from corners (so bends can be rounded)', () => {
    for (const l of MTR_MAP_LINES) {
      for (const [code, p] of Object.entries(l.stations)) {
        const segs = l.paths.flatMap((path) => path.slice(1).map((b, i) => [path[i]!, b] as const));
        const on = segs.some(([a, b]) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < 0.01);
        expect(on, `${l.line} ${code} on line`).toBe(true);
        for (const path of l.paths)
          for (let i = 1; i < path.length - 1; i++) {
            // 支綫起點（例如上水）喺主綫中間，唔當轉角
            const d = dist(path[i]!, p);
            expect(d === 0 || d >= 0.6 - 1e-6, `${l.line} ${code} too close to corner ${path[i]}`).toBe(true);
          }
      }
    }
  });
  it('every turn is exactly 45° (no 90° corners) and bends have room for the same radius', () => {
    for (const l of MTR_MAP_LINES)
      for (const path of l.paths)
        for (let i = 1; i < path.length - 1; i++) {
          const [a, p, b] = [path[i - 1]!, path[i]!, path[i + 1]!];
          const v1 = [p[0] - a[0], p[1] - a[1]];
          const v2 = [b[0] - p[0], b[1] - p[1]];
          const cos = (v1[0]! * v2[0]! + v1[1]! * v2[1]!) / (Math.hypot(v1[0]!, v1[1]!) * Math.hypot(v2[0]!, v2[1]!));
          expect(Math.abs((Math.acos(cos) * 180) / Math.PI - 45), `${l.line} corner ${p}`).toBeLessThan(0.5);
          expect(dist(a, p), `${l.line} before ${p}`).toBeGreaterThanOrEqual(MTR_MAP_BEND - 1e-6);
          expect(dist(p, b), `${l.line} after ${p}`).toBeGreaterThanOrEqual(MTR_MAP_BEND - 1e-6);
        }
  });
  it('interchange points line up horizontally or vertically', () => {
    for (const s of mtrMapStations()) {
      if (s.pts.length < 2) continue;
      const sameX = s.pts.every((p) => Math.abs(p[0] - s.pts[0]![0]) < 1e-9);
      const sameY = s.pts.every((p) => Math.abs(p[1] - s.pts[0]![1]) < 1e-9);
      expect(sameX || sameY, `${s.code} ${JSON.stringify(s.pts)}`).toBe(true);
    }
  });
});
