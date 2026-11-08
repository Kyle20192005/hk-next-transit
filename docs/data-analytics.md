# 數據收集同分析：前後端合作提高準確度

> 狀態：**設計中**（2026-11-08 用戶決定方向）。做嘅時候逐步更新呢份文件；完成後重點搬入根目錄 `CLAUDE.md`。
> 取代 `docs/realtime-backend.md` 原本嘅「階段 2：記憶同過站紀錄」「階段 3：自己嘅行車時間」。

## 1. 目標

前端唔只係顯示：將有用嘅資料傳返後端；後端記低、分析，再用結果令到站時間同巴士位置更準。

- **ETA 準唔準**：巴士公司話「10 分鐘到」，實際幾耐？按路線、時段、站、距離統計，用嚟校正顯示。
- **實際行車時間**：每段路喺每個時段實際要幾耐，取代第三方 hk-bus-time-between-stops。
- **路線準時度**：例如「101 平日 8–9 點，ETA 平均遲 2 分鐘」。
- **熱門程度**：邊啲線、站、時段多人睇 → tracker 優先追蹤、預先準備。
- **之後**：乘客回報、上車 GPS（要同意），補返城巴、九巴冇公開嘅巴士位置。

原則：**先用唔涉及用戶嘅數據**；用戶數據一律匿名、可以喺設定關、原始資料定期刪，只長期留統計。

## 2. 架構

```
 網頁 / App ──（D2、D3、D5：匿名事件，幾條一齊送）──▶ tracker POST /api/events
                                                         │
 巴士公司 ◀── tracker（每輪 poll）──（D1：ETA 樣本）──────┤ 每 5 秒批量寫入
                                                         ▼
                                     Postgres（Dokploy，只聽內網，每晚備份去 VPS 以外）
                                                         │ 每晚分析（SQL）
                                                         ▼
                                     統計表（stats_*）──▶ tracker：校正 ETA、行車時間、追蹤優先次序
                                                      └─▶ 前端：準時度、「通常遲 N 分鐘」
```

- 寫入失敗（數據庫死咗、太慢）**唔影響實時功能**：tracker 丟咗嗰批，照計巴士位置。
- 原始數據 → 每晚分析 → 統計表。分析用 SQL，可以隨時改計法重新計（原始數據留 14 日）。

## 3. 階段

### D1：記錄巴士公司嘅 ETA（唔涉及用戶資料）← **先做**

tracker 每輪 poll 已經攞到每個站嘅 ETA，而家用完就掉。改為記低：

```sql
-- 原始樣本：每次問一個站（一條線一個方向），記低嗰刻佢報嘅幾班 ETA
create table eta_samples (
  observed_at timestamptz not null,   -- 幾時問
  co text not null,                   -- CTB / KMB / NLB / MTRB
  route text not null,
  dir char(1) not null,               -- O / I（城巴方向；九巴已經轉做呢條走法嘅方向）
  stop_id text not null,
  etas timestamptz[] not null,        -- 報嘅到站時間（由近到遠，最多 3 班）
  scheduled boolean[] not null,       -- 每班係咪「原定」（時間表，唔係實時）
  seqs smallint[],                    -- 巴士公司嘅站序（城巴 seq，用嚟分走法）
  source text not null                -- 'poll'（追蹤）／'eta'（有人打開站）
) partition by range (observed_at);   -- 每日一個分區，保留 14 日，舊分區直接 drop
create index on eta_samples (co, route, dir, stop_id, observed_at);
```

容量：追蹤 10–15 條線、每條約 30 個站、每 20 秒一輪 ≈ 每秒 20 行，一日約 170 萬行、約 150MB；14 日約 2GB。

每晚分析（由原始樣本計）：

```sql
-- 實際到站：一班 ETA 喺某個站「消失」（下一輪冇咗、而且嗰陣已經過咗 ETA 減 1 分鐘）= 到咗
create table arrivals (
  co text, route text, dir char(1), stop_id text,
  service_date date,                  -- 服務日（過咗午夜嘅班次算前一日）
  arrived_at timestamptz,             -- 估計到站時間（最後一次見到嘅 ETA，同消失嗰刻取早嗰個）
  primary key (co, route, dir, stop_id, arrived_at)
);

-- ETA 誤差：到站前 N 分鐘（1、3、5、10、15、20）佢報幾時到，實際幾時到
create table eta_errors (
  co text, route text, dir char(1), stop_id text,
  arrived_at timestamptz, horizon_min smallint,
  predicted_at timestamptz, error_s int   -- 正數 = 實際遲過預測
);

-- 統計（長期保留）
create table stats_eta_bias (           -- 按路線、星期類型、鐘數、距離：誤差中位數、p80
  co text, route text, dir char(1), day_type smallint, hour smallint, horizon_min smallint,
  median_error_s int, p80_error_s int, samples int, updated_at timestamptz,
  primary key (co, route, dir, day_type, hour, horizon_min)
);
create table stats_segment_times (      -- 相鄰兩站實際行車時間（同一班車喺兩站嘅到站時間差）
  co text, from_stop text, to_stop text, day_type smallint, hour smallint,
  median_s int, p80_s int, samples int, updated_at timestamptz,
  primary key (co, from_stop, to_stop, day_type, hour)
);
```

「同一班車喺兩站嘅到站時間差」唔使虛擬車輛 ID：同一條線，上一站到站之後、下一站最早嗰次到站就係同一班（按次序配對，巴士唔會互相超越）。

驗收：
- 選 5 條線跑一星期，人手對幾班（例如喺站睇住架車到）確認 `arrivals` 準到 1 分鐘內。
- `stats_eta_bias` 有足夠樣本（每格 ≥ 20）先用。

### D2：匿名使用紀錄（要喺設定開關）

```sql
create table usage_events (
  at timestamptz not null,
  anon_id uuid not null,              -- 部機隨機產生，每 30 日換一個；唔連帳戶、唔存 IP
  kind text not null,                 -- 'route_open' | 'stop_open' | 'fav_add' | 'here_open' ...
  co text, route text, dir char(1), stop_id text,
  app text,                           -- 'web' | 'ios' | 'android'
  version text
) partition by range (at);            -- 原始保留 90 日；統計（每條線每個鐘幾多人睇）長期保留
```

- 前端幾條一齊送（每 30 秒或者離開頁面），`POST /api/events`，每批最多 50 條；tracker 按 IP 限速，唔存 IP。
- 用途：熱門線優先追蹤、預先準備；冷門線更新疏啲（`docs/realtime-backend.md` 嘅容量問題）。
- 設定新增「協助改善準確度」開關（預設開，要喺私隱政策講明；關咗就唔送）。

### D3：乘客回報（匿名）

打開站之後兩個掣：「巴士到咗」「等咗好耐都冇車」。

```sql
create table reports (
  at timestamptz, anon_id uuid, co text, route text, dir char(1), stop_id text,
  kind text,                          -- 'arrived' | 'no_show'
  shown_eta timestamptz               -- 當時畫面顯示嘅下一班
);
```

用途：補 D1 偵測唔到嘅情況（例如 ETA 突然跳走、班次取消），校驗 `arrivals`。

### D4：用統計結果改善顯示

- **校正 ETA**：`stats_eta_bias` 樣本夠，就喺到站時間旁邊細字寫「通常遲 2 分鐘」；確認有改善先考慮直接調整數字。
- **路線準時度**：路線頁顯示「呢個時段準時率 N%」。
- **行車時間**：`stats_segment_times` 樣本夠就優先用，唔夠先用 hk-bus-time-between-stops（tracker、pipeline 都改）。

### D5：「我上咗車」GPS（要用戶明確同意）

- 用戶喺路線頁撳「我喺呢架車」先開始，落車（離開路線、或者 30 分鐘）自動停。
- 每 10 秒送一次位置，隨機行程 ID（唔連 `anon_id`、唔連帳戶）。
- 用途：城巴、九巴冇公開 GPS → 有乘客位置就知架車真係去到邊；同時校驗推算位置。
- 原始位置保留 30 日，之後只留統計。
- 上架前：私隱政策、App Store／Google Play 私隱標籤（「位置：用於 App 功能、唔連身份」）。

## 4. 私隱規則（全部階段適用）

- 唔使登入照用得；所有數據匿名（隨機 ID，定期換），唔存 IP、唔連帳戶。
- 設定有開關（「協助改善準確度」；GPS 另外每次問）。關咗即刻停止傳送。
- 原始數據定期刪（ETA 樣本 14 日、使用紀錄 90 日、GPS 30 日），只長期保留統計。
- 私隱政策寫明收集咩、點用、保留幾耐、點樣停止（香港《個人資料（私隱）條例》）。
- `docs/realtime-backend.md` 帳戶部分原本寫「唔存位置」：帳戶仍然唔存位置；D5 嘅 GPS 唔連帳戶，另外處理。

## 5. 數據庫

- Dokploy 內置 **PostgreSQL 17**（Create Service → Database），名 `nextleg-db`，**只聽內網，唔開外部 port**。
- tracker 用環境變數 `DATABASE_URL`（Dokploy 嘅 Internal Connection URL）連；冇設定就唔記錄（功能照舊）。
- 備份：Dokploy 嘅 Backups 每晚去 S3 相容儲存（例如 Cloudflare R2、Backblaze B2），VPS 以外。
- 分區同清理：tracker 每日自動開新分區、drop 過期分區。
- 記憶體：4GB VPS 上面 Postgres 用 `shared_buffers` 256MB 就夠。

## 6. 進度

- [ ] D1：Dokploy 開 Postgres；tracker 批量寫入 `eta_samples`（冇 `DATABASE_URL` 就跳過）；分區自動開／清
- [ ] D1：每晚分析 → `arrivals`、`eta_errors`、`stats_eta_bias`、`stats_segment_times`；`/api/stats` 俾前端睇
- [ ] D1 驗收：5 條線一星期，人手對到站時間
- [ ] D2：匿名使用紀錄 + 設定開關 + 私隱政策頁
- [ ] D3：乘客回報掣
- [ ] D4：用統計改善顯示
- [ ] D5：上車 GPS（要同意）
