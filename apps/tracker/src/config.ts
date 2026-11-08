/** 設定全部由環境變數讀（Dokploy 嘅 Environment 填），冇就用預設 */
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

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
  /** 全局限流：所有去營辦商嘅請求，每秒最多幾多個 */
  upstreamRps: num('UPSTREAM_RPS', 20),
  /** 同時最多幾多條線 poll 緊（超出嘅照計，但唔會背景 poll） */
  maxLines: num('MAX_LINES', 60),
  /** CORS：准邊啲網站 call（逗號分隔）；冇設定就全部准 */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};
