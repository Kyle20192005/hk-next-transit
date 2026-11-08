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

import { MTR_MAP_LINES, mtrMapStations } from './mtr-map';
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
