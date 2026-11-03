import { describe, expect, it } from 'vitest';
import { busPositions, cumulativeSeconds, pointOnPath, secondsFrom, stopPathIndices, variantStops, type Eta, type RouteData } from '../src';
import route38 from './fixtures/ctb-38.json';

const route = route38 as unknown as RouteData;
const v = route.variants.find((x) => x.id === '1540-1')!;
const now = new Date('2026-11-03T09:30:00+08:00');
const eta = (min: number): Eta => ({
  company: 'CTB', route: '38', dir: 'O', stopId: '', seq: 0,
  eta: new Date(now.getTime() + min * 60000).toISOString(),
  destTc: '', destEn: '', remarkTc: '', remarkEn: '',
});

describe('行車時間', () => {
  it('每段一個數，同站數對應', () => {
    expect(v.segSeconds).toHaveLength(variantStops(v).length - 1);
    const cum = cumulativeSeconds(v)!;
    expect(cum[0]).toBe(0);
    expect(cum).toHaveLength(variantStops(v).length);
    expect(cum.every((c, i) => i === 0 || c >= cum[i - 1]!)).toBe(true);
  });

  it('由某站去之後各站嘅時間', () => {
    const cum = [0, 60, 180, 300];
    expect(secondsFrom(cum, 1)).toEqual([null, 0, 120, 240]);
  });
});

describe('推算車嘅位置', () => {
  const cum = [0, 60, 180, 300]; // 4 個站，每段 60、120、120 秒

  it('仲有 1 分鐘到第 3 站（index 2）→ 喺第 2、3 站之間行咗一半', () => {
    const [p] = busPositions(cum, 2, [eta(1)], now);
    expect(p).toMatchObject({ state: 'between', from: 1 });
    expect(p!.state === 'between' && p!.fraction).toBeCloseTo(0.5);
  });

  it('仲有 2.5 分鐘 → 喺第 1、2 站之間', () => {
    const [p] = busPositions(cum, 2, [eta(2.5)], now);
    expect(p).toMatchObject({ state: 'between', from: 0 });
    expect(p!.state === 'between' && p!.fraction).toBeCloseTo(0.5);
  });

  it('仲有 10 分鐘，但由總站開出都唔使咁耐 → 未開出', () => {
    expect(busPositions(cum, 2, [eta(10)], now)[0]!.state).toBe('notDeparted');
  });

  it('已經到站', () => {
    expect(busPositions(cum, 2, [eta(-0.5)], now)[0]!.state).toBe('at');
  });
});

describe('走線上嘅位置', () => {
  const path: [number, number][] = [[22.28, 114.15], [22.281, 114.15], [22.282, 114.15], [22.282, 114.151]];

  it('站對應到走線上最近嘅點', () => {
    expect(stopPathIndices(path, [[22.28, 114.15], [22.2821, 114.15], [22.282, 114.1511]])).toEqual([0, 2, 3]);
  });

  it('兩點之間按距離行到一半', () => {
    const p = pointOnPath(path, 0, 2, 0.5)!;
    expect(p.lat).toBeCloseTo(22.281);
    expect(p.bearing).toBeCloseTo(0);
  });
});
