import { variantStops } from '@hknt/core';
import { getRoute } from './data';

/**
 * 量 data.gov.hk 城巴 ETA API 頂得幾快（docs/realtime-backend.md：開 tracker 之前要知請求上限）。
 * 喺 VPS 上面跑（同 tracker 用同一個 IP）：
 *   docker exec -it <tracker 容器> node dist/probe.js
 * 由每秒 5 個開始，每級 30 秒，逐級加；任何一級出錯率 > 2% 或者有 429／403 即刻停。
 * 預設最多每秒 20 個（PROBE_MAX_RPS 可以改），唔好一嚟就衝太快，免得俾人封 IP。
 */
const LEVELS = [5, 10, 15, 20, 30, 40].filter((r) => r <= Number(process.env.PROBE_MAX_RPS ?? 20));
const SECONDS = Number(process.env.PROBE_SECONDS ?? 30);
const SAMPLE_ROUTES = ['1', '5B', '10', '38', '70', '103', '107', '960', 'A11', 'E23'];

async function targets(): Promise<string[]> {
  const urls: string[] = [];
  for (const r of SAMPLE_ROUTES) {
    const data = await getRoute('ctb', r).catch(() => null);
    const v = data?.variants[0];
    if (!data || !v) continue;
    for (const s of variantStops(v)) urls.push(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${s.stopId}/${data.route}`);
  }
  return urls;
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : 0);

async function run() {
  const urls = await targets();
  if (!urls.length) throw new Error('攞唔到路線數據（檢查 DATA_BASE_URL／DATA_DIR）');
  console.log(`用 ${urls.length} 個站×路線輪流問；每級 ${SECONDS} 秒\n`);
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
