import { describe, expect, it } from 'vitest';
import { BusStabilizer, busDistanceTo, busFraction, hourlySlot, labelEtas, trackBuses, trackLine, type Calendar } from '../src';

const now = Date.parse('2026-11-03T12:00:00+08:00');
const m = (min: number) => now + min * 60_000;
// 5 個站，每段 2 分鐘
const seg = [120, 120, 120, 120];

describe('成條線追蹤巴士', () => {
  it('喺第 2、3 站（index 1、2）之間嘅車：第 3 站有、第 2 站冇', () => {
    const etas = [
      [m(10)],          // 總站：下一班 10 分鐘後開（未開出）
      [m(12)],          // 第 2 站：都係嗰班未開出嘅車
      [m(1), m(14)],    // 第 3 站：1 分鐘後有一架（已經過咗第 2 站）
      [m(3), m(16)],
      [m(5), m(18)],
    ];
    const buses = trackBuses(etas, seg, now);
    expect(buses).toEqual([{ from: 1, nextEta: m(1) }]);
    expect(busFraction(buses[0]!, seg, now)).toBeCloseTo(0.5);
  });

  it('兩架車喺唔同位置', () => {
    const etas = [[m(9)], [m(0.5), m(11)], [m(2.5), m(13)], [m(4.5)], [m(1), m(6.5)]];
    const buses = trackBuses(etas, seg, now);
    expect(buses.map((b) => b.from)).toEqual([3, 0]);
  });

  it('上游站 ETA 有少少誤差都當同一架車', () => {
    const etas = [[m(9)], [m(3.5)], [m(5)]]; // 2 分鐘一段，實際差 1.5 分鐘
    expect(trackBuses(etas, [120, 120], now)).toEqual([{ from: 0, nextEta: m(3.5) }]);
  });

  it('對應打開咗嘅站：近嘅車對第一班，其餘未開出', () => {
    const etas = [[m(9)], [m(0.5), m(11)], [m(2.5), m(13)], [m(4.5)], [m(1), m(6.5), m(15)]];
    const buses = trackBuses(etas, seg, now);
    const labels = labelEtas(buses, 4, [m(1), m(6.5), m(15)]);
    expect(labels.map((l) => (l.kind === 'coming' ? `距離${l.stopsAway}` : l.kind))).toEqual(['arriving', '距離4', 'notDeparted']);
  });
});

it('同一架車喺相鄰兩站嘅 ETA 差做嗰段行車時間', () => {
  // 第 1→2 段：資料話 2 分鐘，但 ETA 顯示 3 分鐘
  const etas = [[m(9)], [m(4), m(12)], [m(7)]];
  const { segSeconds } = trackLine(etas, [120, 120], now);
  expect(segSeconds[0]).toBe(180); // 9 → 12
  expect(segSeconds[1]).toBe(180); // 4 → 7
});

it('架車去某個站仲有幾遠', () => {
  // 4 個站，每站相隔 500 米；車喺第 2、3 站之間行咗四成，去第 4 站
  expect(busDistanceTo({ from: 1, nextEta: now }, 0.4, 3, [0, 500, 1000, 1500])).toBe(800);
});

describe('按時段行車時間', () => {
  const cal: Calendar = { '448': { days: [false, false, false, false, false, false, true], start: '20200101', end: '20991231', add: ['20261225'], remove: [] } };
  it('星期二 08:30 → 2 / 08', () => {
    expect(hourlySlot(new Date('2026-11-03T08:30:00+08:00'), cal)).toEqual({ weekday: 2, hour: '08' });
  });
  it('星期日 → 0', () => {
    expect(hourlySlot(new Date('2026-11-08T23:10:00+08:00'), cal)).toEqual({ weekday: 0, hour: '23' });
  });
  it('公眾假期當星期日', () => {
    expect(hourlySlot(new Date('2026-12-25T10:00:00+08:00'), cal).weekday).toBe(0);
  });
});

describe('巴士只向前唔倒退', () => {
  const seg = [120, 120, 120, 120];

  it('ETA 推遲咗：停喺原位，唔會倒退', () => {
    const st = new BusStabilizer();
    const [a] = st.update([{ from: 1, nextEta: m(0.6) }], seg, now); // 行咗七成
    expect(a!.progress).toBeCloseTo(1.7);
    // 下一次更新：ETA 推遲到 1.8 分鐘後，計出嚟只行咗一成
    const [b] = st.update([{ from: 1, nextEta: m(1.8) }], seg, now);
    expect(b!.id).toBe(a!.id);
    expect(b!.progress).toBeCloseTo(1.7);
  });

  it('正常向前：照郁', () => {
    const st = new BusStabilizer();
    st.update([{ from: 1, nextEta: m(1) }], seg, now);
    const [b] = st.update([{ from: 2, nextEta: m(1.5) }], seg, now);
    expect(b!.progress).toBeCloseTo(2.25);
  });

  it('兩架車各自配對，唔會配錯', () => {
    const st = new BusStabilizer();
    const first = st.update([{ from: 3, nextEta: m(1) }, { from: 0, nextEta: m(1) }], seg, now);
    const second = st.update([{ from: 3, nextEta: m(1.9) }, { from: 0, nextEta: m(0.5) }], seg, now);
    const id = (p: number) => second.find((x) => Math.floor(x.progress) === p)!.id;
    expect(id(3)).toBe(first.find((x) => x.bus.from === 3)!.id);
    expect(id(0)).toBe(first.find((x) => x.bus.from === 0)!.id);
    expect(second.find((x) => Math.floor(x.progress) === 3)!.progress).toBeCloseTo(3.5); // 推遲咗，停喺原位
  });

  it('相差太遠就當係另一架車', () => {
    const st = new BusStabilizer();
    const [a] = st.update([{ from: 3, nextEta: m(1) }], seg, now);
    const [b] = st.update([{ from: 0, nextEta: m(1) }], seg, now);
    expect(b!.id).not.toBe(a!.id);
    expect(b!.progress).toBeCloseTo(0.5);
  });
});
