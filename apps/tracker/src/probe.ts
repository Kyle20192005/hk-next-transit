import { CTB_BASE, KMB_BASE, MTRB_URL, NLB_BASE } from '@hknt/core';
import { getAllStops, getRoute } from './data';

/**
 * 量巴士公司 API 頂得幾快（docs/realtime-backend.md：tracker 嘅 UPSTREAM_RPS 要知上限）。喺 VPS 上面跑（同 tracker 同一個 IP）：
 *   docker exec -it <tracker 容器> sh -c 'PROBE_MAX_RPS=40 node dist/probe.js'
 *
 * - 四間公司一齊試，按**伺服器**分開計（同 tracker 限速一樣）：
 *   rt.data.gov.hk = 城巴 + 新大嶼山 + 港鐵巴士（混埋打亂）；data.etabus.gov.hk = 九巴。
 *   每一級兩部伺服器**同時**問，各自用嗰個速度。
 * - 每個網址**只問一次**（全部站×路線打亂）：重複問會撞中 data.gov.hk 嘅 cache，回應快得唔真，量唔到真正上限
 *  （2026-11-08 第一次只用 10 條線輪流問，每秒 10、20 嗰兩級中位數得 8–11 毫秒，即係 cache 頂咗）。
 * - 由每秒 5 個開始，每級 30 秒逐級加；任何一部伺服器出錯率 > 2% 或者有 429／403 即刻停。
 * - 睇中位數：一路幾百毫秒 = 正常；升到一秒幾 = 開始頂唔順；跌到十幾毫秒 = 撞中 cache（嗰級唔準）。
 * 預設最多每秒 20 個（PROBE_MAX_RPS 可以改，最多 50），揀夜晚人少先試高。邊部伺服器出錯就淨係停邊部，另一部繼續；
 * PROBE_ONLY=rt（或 kmb）淨係試一部。
 */
// 2026-11-08 已經量過：rt.data.gov.hk 每秒 40 個即刻 403 封 IP。最多 35，除非 PROBE_FORCE=1
const MAX = Math.min(Number(process.env.PROBE_MAX_RPS ?? 20), process.env.PROBE_FORCE === '1' ? 50 : 35);
const LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 50].filter((r) => r <= MAX);
const SECONDS = Number(process.env.PROBE_SECONDS ?? 30);

type Req = { co: string; url: string; init?: RequestInit };

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

async function targets(): Promise<{ rt: Req[]; kmb: Req[] }> {
  const stops = await getAllStops();
  const rt: Req[] = [];
  const kmb: Req[] = [];
  const seen = new Set<string>();
  const add = (list: Req[], r: Req) => {
    const key = r.url + (r.init?.body ?? '');
    if (!seen.has(key)) (seen.add(key), list.push(r));
  };
  const nlbRoutes = new Set<string>();
  const mtrbRoutes = new Set<string>();
  for (const s of stops) {
    for (const [co, route] of s.r) {
      if (co === 'ctb' && s.co === 'ctb') add(rt, { co: '城巴', url: `${CTB_BASE}/eta/CTB/${s.id}/${route}` });
      else if (co === 'kmb' && s.co === 'kmb') add(kmb, { co: '九巴', url: `${KMB_BASE}/eta/${s.id}/${route}/1` });
      else if (co === 'nlb') nlbRoutes.add(route);
      else if (co === 'mtrb') mtrbRoutes.add(route);
    }
    if (s.co === 'kmb') add(kmb, { co: '九巴', url: `${KMB_BASE}/stop-eta/${s.id}` });
  }
  // 新大嶼山：要 routeId（喺路線檔），每個 routeId × 站
  for (const route of nlbRoutes) {
    const data = await getRoute('nlb', route).catch(() => null);
    for (const v of data?.variants ?? []) {
      const routeId = (v as { nlb?: { routeId?: string | number } }).nlb?.routeId;
      if (routeId === undefined) continue;
      for (const k of Object.keys(v.expSeq ?? {}))
        add(rt, { co: '新大嶼山', url: `${NLB_BASE}/stop.php?action=estimatedArrivals&routeId=${routeId}&stopId=${k.slice(2)}&language=zh` });
    }
  }
  // 港鐵巴士：一條線一個請求（只有二十幾條）
  for (const route of mtrbRoutes)
    add(rt, { co: '港鐵巴士', url: MTRB_URL, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'zh', routeName: route }) } });
  return { rt: shuffle(rt), kmb: shuffle(kmb) };
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : 0);

interface Level {
  ok: number;
  bad: number;
  ms: number[];
  codes: Map<string, number>;
  byCo: Map<string, number>;
  ranOut: boolean;
}

/** 一部伺服器：rps 速度問 SECONDS 秒，用 list 由 start 開始（唔重複） */
async function runHost(list: Req[], start: number, rps: number): Promise<{ level: Level; next: number }> {
  const level: Level = { ok: 0, bad: 0, ms: [], codes: new Map(), byCo: new Map(), ranOut: false };
  const jobs: Promise<void>[] = [];
  const end = Date.now() + SECONDS * 1000;
  let i = start;
  while (Date.now() < end) {
    if (i >= list.length) {
      level.ranOut = true; // 用晒：唔好重複問（會撞 cache）
      break;
    }
    const r = list[i++]!;
    level.byCo.set(r.co, (level.byCo.get(r.co) ?? 0) + 1);
    const t0 = Date.now();
    jobs.push(
      fetch(r.url, { ...r.init, signal: AbortSignal.timeout(8000) })
        .then(async (res) => {
          await res.arrayBuffer();
          level.codes.set(String(res.status), (level.codes.get(String(res.status)) ?? 0) + 1);
          if (res.ok) level.ok++;
          else level.bad++;
          level.ms.push(Date.now() - t0);
        })
        .catch((e: Error) => {
          level.bad++;
          level.codes.set(e.name, (level.codes.get(e.name) ?? 0) + 1);
        }),
    );
    await new Promise((res) => setTimeout(res, 1000 / rps));
  }
  await Promise.all(jobs);
  return { level, next: i };
}

const line = (host: string, rps: number, l: Level) =>
  `${String(rps).padStart(4)} | ${host.padEnd(18)} | ${String(l.ok).padStart(4)} | ${String(l.bad).padStart(3)} | ${String(pct(l.ms, 0.5)).padStart(5)} | ${String(pct(l.ms, 0.95)).padStart(5)} | ${[...l.codes].map(([c, n]) => `${c}×${n}`).join(' ')} | ${[...l.byCo].map(([c, n]) => `${c} ${n}`).join('、')}${l.ranOut ? ' | ⚠️ 網址用晒' : ''}`;

const failed = (l: Level) => l.bad / Math.max(1, l.ok + l.bad) > 0.02 || l.codes.has('429') || l.codes.has('403');

async function run() {
  const { rt, kmb } = await targets();
  if (!rt.length || !kmb.length) throw new Error('攞唔到站點數據（檢查 DATA_BASE_URL／DATA_DIR）');
  const need = LEVELS.reduce((n, r) => n + r * SECONDS, 0);
  console.log(`rt.data.gov.hk（城巴＋新大嶼山＋港鐵巴士）：${rt.length} 個唔同網址；data.etabus.gov.hk（九巴）：${kmb.length} 個`);
  console.log(`每個網址只問一次；每部伺服器今次最多用 ${need} 個（每級 ${SECONDS} 秒，兩部同時問）\n`);
  console.log('每秒 | 伺服器             | 成功 | 錯 | 中位ms | p95ms | 狀態碼 | 問咗邊間');
  // 每部伺服器各自計：邊部出錯就淨係停邊部，另一部繼續加（PROBE_ONLY=rt 或 kmb 可以淨係試一部）
  const only = process.env.PROBE_ONLY;
  const hosts = [
    { key: 'rt', name: 'rt.data.gov.hk', list: rt, i: 0, safe: 0, stopped: only === 'kmb', note: '' },
    { key: 'kmb', name: 'data.etabus.gov.hk', list: kmb, i: 0, safe: 0, stopped: only === 'rt', note: '' },
  ];
  for (const rps of LEVELS) {
    const active = hosts.filter((h) => !h.stopped);
    if (!active.length) break;
    const results = await Promise.all(active.map((h) => runHost(h.list, h.i, rps)));
    active.forEach((h, k) => {
      const { level, next } = results[k]!;
      h.i = next;
      console.log(line(h.name, rps, level));
      if (failed(level)) {
        h.stopped = true;
        h.note = `每秒 ${rps} 個開始出錯`;
      } else {
        h.safe = rps;
        if (level.ranOut) (h.stopped = true), (h.note = '網址用晒');
      }
    });
    await new Promise((r) => setTimeout(r, 10_000)); // 每級之間休息
  }
  console.log('');
  const byHost: string[] = [];
  for (const h of hosts) {
    if (only && h.key !== only) continue;
    const top = h.note.includes('出錯') ? '' : '（未試到頂）';
    console.log(`${h.name}：冇出錯嘅最高一級每秒 ${h.safe} 個${top}${h.note ? `；${h.note}` : ''}`);
    if (h.safe) byHost.push(`${h.name}=${Math.max(1, Math.round(h.safe * 0.7))}`);
  }
  console.log(`\n建議（每部伺服器用佢自己嘅 70%）：UPSTREAM_RPS_BY_HOST=${byHost.join(',')}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
