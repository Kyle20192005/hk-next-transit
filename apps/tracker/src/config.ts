/** 設定全部由環境變數讀（Dokploy 嘅 Environment 填），冇就用預設 */
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

/**
 * 內置嘅個別伺服器上限（UPSTREAM_RPS_BY_HOST 有寫就用環境變數嗰個）：
 * data.etagmb.gov.hk（專線小巴）未量，重新部署時忘記改環境變數都唔好用 UPSTREAM_RPS（例如 14）去問。
 */
export const DEFAULT_RPS_BY_HOST: Readonly<Record<string, number>> = { 'data.etagmb.gov.hk': 8 };

/** 「host=數字,host=數字」→ { host: 數字 }，蓋過內置上限 */
export function parseRpsByHost(env: string | undefined, defaults: Readonly<Record<string, number>> = DEFAULT_RPS_BY_HOST): Record<string, number> {
  const fromEnv = (env ?? '')
    .split(',')
    .map((x) => x.split('=').map((y) => y.trim()))
    .filter(([h, n]) => h && Number(n) > 0)
    .map(([h, n]) => [h!, Number(n)] as const);
  return { ...defaults, ...Object.fromEntries(fromEnv) };
}

export const config = {
  port: num('PORT', 8080),
  /** 路線數據：同網頁一樣嘅 DATA_BASE_URL（GitHub data 分支）；冇就讀 DATA_DIR（本地 pipeline/out） */
  dataBaseUrl: process.env.DATA_BASE_URL?.replace(/\/+$/, '') || null,
  dataToken: process.env.DATA_TOKEN || null,
  dataDir: process.env.DATA_DIR || '../../pipeline/out',
  /** 每條有人睇嘅線幾耐重新計一次（毫秒） */
  pollMs: num('POLL_MS', 15_000),
  /** 冇人問幾耐就停 poll（毫秒） */
  idleMs: num('IDLE_MS', 180_000),
  /** 營辦商回應 cache 幾耐（毫秒）；跟來源更新節奏（城巴約 20 秒、九巴約 25 秒） */
  upstreamTtlMs: num('UPSTREAM_TTL_MS', 10_000),
  /** 限流：去每個營辦商伺服器（例如 rt.data.gov.hk）嘅請求，每秒最多幾多個 */
  upstreamRps: num('UPSTREAM_RPS', 10),
  /**
   * 個別伺服器嘅上限（蓋過 UPSTREAM_RPS），格式「host=數字,host=數字」。
   * 2026-11-08 實測：data.etabus.gov.hk（九巴）每秒 20 個開始超時、15 個冇事；rt.data.gov.hk 35 個冇事、40 個即刻 403 封 IP。
   * data.etagmb.gov.hk（專線小巴）未量（PROBE_ONLY=gmb），內置 8（DEFAULT_RPS_BY_HOST），環境變數有寫就蓋過。
   * 例如 UPSTREAM_RPS_BY_HOST=rt.data.gov.hk=20,data.etabus.gov.hk=10,data.etagmb.gov.hk=8
   */
  upstreamRpsByHost: parseRpsByHost(process.env.UPSTREAM_RPS_BY_HOST),
  /** 同時最多幾多條線 poll 緊（超出嘅照計，但唔會背景 poll） */
  maxLines: num('MAX_LINES', 60),
  /** CORS：准邊啲網站 call（逗號分隔）；冇設定就全部准 */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};
