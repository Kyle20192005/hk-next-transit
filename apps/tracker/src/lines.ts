import { computeBuses, variantStops, type BusesResult as BusesSnapshot } from '@hknt/core';
import { hourlyTimesFor } from './segments';
import { config } from './config';
import { getCalendar, getRoute, type Co } from './data';

/**
 * 有人睇緊嘅線（一個走法一條）：
 * - 第一次有人問就計一次，之後喺背景每 `pollMs` 重新計，所有人共用同一份結果（一條線只 poll 一份）
 * - `idleMs` 冇人問就停；淨係問過一次（多數係撳落路線嘅預先 fetch，未必真係入去睇）45 秒冇人再問就停
 * - 定時清走冇 poll 又冇人問嘅線（例如超出上限嗰啲），免得記憶體越嚟越大
 * - 同時 poll 緊嘅線有上限（`maxLines`），超出嘅照即時計，但唔會背景 poll
 */
interface Line {
  key: string;
  co: Co;
  route: string;
  variant: string;
  snapshot: BusesSnapshot | null;
  /** 快照幾時計好（fetchedAt 係開始計嘅時間） */
  storedAt: number;
  computing: Promise<BusesSnapshot> | null;
  lastAsked: number;
  /** 問過幾多次（1 = 只係預先 fetch） */
  asks: number;
  timer: ReturnType<typeof setInterval> | null;
  polls: number;
  lastError: string | null;
}

export class NotFound extends Error {}

export function createLines(fetcher: typeof fetch) {
  const lines = new Map<string, Line>();

  async function compute(line: Line): Promise<BusesSnapshot> {
    if (line.computing) return line.computing;
    line.computing = (async () => {
      const [data, calendar] = await Promise.all([getRoute(line.co, line.route), getCalendar()]);
      if (!data) throw new NotFound(`搵唔到路線 ${line.route}`);
      const v = data.variants.find((x) => x.id === line.variant);
      if (!v) throw new NotFound(`搵唔到走法 ${line.variant}`);
      const now = new Date();
      const snap = await computeBuses(data, v, calendar, fetcher, await hourlyTimesFor(variantStops(v), calendar, now), now);
      line.snapshot = snap;
      line.storedAt = Date.now();
      line.polls++;
      line.lastError = null;
      return snap;
    })();
    try {
      return await line.computing;
    } catch (e) {
      line.lastError = (e as Error).message;
      throw e;
    } finally {
      line.computing = null;
    }
  }

  const WARM_IDLE_MS = 45_000;
  const idleFor = (line: Line) => (line.asks <= 1 ? Math.min(WARM_IDLE_MS, config.idleMs) : config.idleMs);

  // 冇 poll 緊（超出 MAX_LINES）又耐冇人問嘅線：清走
  setInterval(() => {
    for (const [k, l] of lines) if (!l.timer && !l.computing && Date.now() - l.lastAsked > config.idleMs) lines.delete(k);
  }, 60_000).unref();

  function startPolling(line: Line) {
    if (line.timer) return;
    if ([...lines.values()].filter((l) => l.timer).length >= config.maxLines) return;
    line.timer = setInterval(() => {
      if (Date.now() - line.lastAsked > idleFor(line)) {
        clearInterval(line.timer!);
        line.timer = null;
        lines.delete(line.key);
        return;
      }
      compute(line).catch(() => {});
    }, config.pollMs);
  }

  /** 攞一個走法嘅巴士位置：有新鮮嘅快照就即刻俾，冇就計（同時請求共用） */
  async function get(co: Co, route: string, variant: string): Promise<BusesSnapshot> {
    const key = `${co}:${route.toUpperCase()}:${variant}`;
    let line = lines.get(key);
    if (!line) {
      line = { key, co, route, variant, snapshot: null, storedAt: 0, computing: null, lastAsked: 0, asks: 0, timer: null, polls: 0, lastError: null };
      lines.set(key, line);
    }
    line.lastAsked = Date.now();
    line.asks++;
    // 有唔太舊嘅快照（背景 poll 緊）就即刻俾，唔好等緊新一輪計完（計一條長線可以要幾秒）
    const usable = line.snapshot && Date.now() - line.storedAt < config.pollMs * 3;
    try {
      const snap = usable ? line.snapshot! : await compute(line);
      startPolling(line);
      return snap;
    } catch (e) {
      if (!line.timer) lines.delete(key); // 搵唔到路線等：唔好留喺名單
      throw e;
    }
  }

  function status() {
    return [...lines.values()].map((l) => ({
      line: l.key,
      polling: Boolean(l.timer),
      polls: l.polls,
      asks: l.asks,
      buses: l.snapshot?.buses.length ?? null,
      lastAskedSecondsAgo: Math.round((Date.now() - l.lastAsked) / 1000),
      lastError: l.lastError,
    }));
  }

  return { get, status, size: () => lines.size };
}
