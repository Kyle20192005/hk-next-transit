import { variantStops } from '@hknt/core';
import { getIndex, getRoute } from './data';

/**
 * 量 data.gov.hk 城巴 ETA API 頂得幾快（docs/realtime-backend.md：開 tracker 之前要知請求上限）。
 * 喺 VPS 上面跑（同 tracker 用同一個 IP）：
 *   docker exec -it <tracker 容器> node dist/probe.js
 * 由每秒 5 個開始，每級 30 秒，逐級加；任何一級出錯率 > 2% 或者有 429／403 即刻停。
 * 預設最多每秒 20 個（PROBE_MAX_RPS 可以改，最多試到 50），唔好一嚟就衝太快，免得俾人封 IP。
 * 用 PROBE_ROUTES 條城巴線（預設 120）嘅所有站、打亂次序：網址夠多先唔會撞中 data.gov.hk 嘅 cache（2026-11-08 第一次只用 10 條線，
 * 每秒 10、20 嗰兩級中位數得 8–11 毫秒，即係 cache 頂咗，量唔到真正上限）。
 * 中位數由幾百毫秒跌到十幾毫秒 = 撞中 cache；由幾百毫秒升到一秒幾 = 佢開始頂唔順。
 */
const LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 50].filter((r) => r <= Number(process.env.PROBE_MAX_RPS ?? 20));
const SECONDS = Number(process.env.PROBE_SECONDS ?? 30);
/** 用幾多條城巴線（越多網址越唔會撞中 data.gov.hk 嘅 cache，量到嘅先係真正上限） */
const ROUTE_COUNT = Number(process.env.PROBE_ROUTES ?? 120);

async function targets(): Promise<string[]> {
  const idx = (await getIndex()).routes.filter((r) => (r.co ?? 'ctb') === 'ctb');
  // 平均揀散啲（唔好淨係頭幾條）
  const step = Math.max(1, Math.floor(idx.length / ROUTE_COUNT));
  const picked = idx.filter((_, i) => i % step === 0).slice(0, ROUTE_COUNT);
  const urls: string[] = [];
  for (const r of picked) {
    const data = await getRoute('ctb', r.route).catch(() => null);
    const v = data?.variants[0];
    if (!data || !v) continue;
    for (const s of variantStops(v)) urls.push(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${s.stopId}/${data.route}`);
  }
  // 打亂次序：相鄰請求唔好係同一條線
  for (let i = urls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [urls[i], urls[j]] = [urls[j]!, urls[i]!];
  }
  return urls;
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : 0);

async function run() {
  const urls = await targets();
  if (!urls.length) throw new Error('攞唔到路線數據（檢查 DATA_BASE_URL／DATA_DIR）');
  const total = LEVELS.reduce((n, r) => n + r * SECONDS, 0);
  console.log(`用 ${urls.length} 個站×路線（${ROUTE_COUNT} 條城巴線）輪流問；每級 ${SECONDS} 秒`);
  console.log(`每個網址大約問 ${(total / urls.length).toFixed(1)} 次（越接近 1 越少撞中 cache，量到嘅越真）\n`);
  console.log('每秒請求 | 成功 | 出錯 | 狀態碼 | 中位數 ms | p95 ms');
  let i = 0;
  for (const rps of LEVELS) {
    const ms: number[] = [];
    const codes = new Map<string, number>();
    let ok = 0;
    let bad = 0;
    const jobs: Promise<void>[] = [];
    const end = Date.now() + SECONDS * 1000;
    while (Date.now() < end) {
      const url = urls[i++ % urls.length]!;
      const t0 = Date.now();
      jobs.push(
        fetch(url, { signal: AbortSignal.timeout(8000) })
          .then(async (r) => {
            await r.arrayBuffer();
            codes.set(String(r.status), (codes.get(String(r.status)) ?? 0) + 1);
            if (r.ok) ok++;
            else bad++;
            ms.push(Date.now() - t0);
          })
          .catch((e: Error) => {
            bad++;
            codes.set(e.name, (codes.get(e.name) ?? 0) + 1);
          }),
      );
      await new Promise((r) => setTimeout(r, 1000 / rps));
    }
    await Promise.all(jobs);
    const codeText = [...codes].map(([c, n]) => `${c}×${n}`).join(' ');
    console.log(`${String(rps).padStart(8)} | ${String(ok).padStart(4)} | ${String(bad).padStart(4)} | ${codeText} | ${pct(ms, 0.5)} | ${pct(ms, 0.95)}`);
    if (bad / Math.max(1, ok + bad) > 0.02 || codes.has('429') || codes.has('403')) {
      console.log(`\n每秒 ${rps} 個開始出錯：UPSTREAM_RPS 設低過上一級（例如上一級嘅 70%）。`);
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000)); // 每級之間休息
  }
  console.log(`\n全部級別都冇出錯：UPSTREAM_RPS 可以設 ${Math.round(LEVELS.at(-1)! * 0.7)}（最高一級嘅 70%）。`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
