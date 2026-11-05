# 實時後端計劃：常駐 tracker + Supabase

> 狀態：**計劃中**（2026-11）。未開始實作。
> 做嘅時候逐步更新呢份文件（每個階段完成就喺「階段」嗰度打剔，改咗設計就改返呢度），
> 完成後將重點搬入根目錄 `CLAUDE.md`。

## 1. 目標

- **前端只負責顯示**：巴士位置、到站時間全部由後端計好，網頁同 App 收到就畫。
- **一條線只 poll 一份**：唔理幾多人睇緊同一條線，巴士公司都只會被 call 一次，計好再推俾所有人。
- **伺服器放香港**：巴士公司 API 全部喺香港，減少跨太平洋來回。
- **後端有記憶**：記住每架車過去幾分鐘嘅 ETA，用實際車速同過站時間計位置，唔再每次由零開始。
- **自己量行車時間**：由過站紀錄計每段路實際行車時間，取代第三方 hk-bus-time-between-stops（實驗性質、有異常值）。
- **順帶**：每日數據更新改喺自己伺服器排程跑，唔再靠 GitHub Actions（而家因為 GitHub 收費問題行唔到）。

唔係目標：將網頁搬離 Vercel（網頁可以繼續用 Vercel 香港機房 hkg1 同 CDN）。

## 2. 而家點做（改之前）

| 部分 | 做法 |
|---|---|
| 路線、站、時間表 | `pipeline/` 生成 JSON，推去 GitHub `data` 分支；網頁經 GitHub Contents API 讀 |
| 到站時間 | 前端打開站 → `/api/eta`（Vercel function）即時 call 巴士公司 |
| 巴士位置 | 前端每 20 秒 call `/api/buses` → function call 成條線每個站嘅 ETA（每站 cache 10 秒）→ `trackLine` 計位置；前端每 5 秒按時間推前 |
| 每段行車時間 | pipeline 用 hk-bus-time-between-stops 平均值；runtime 用佢嘅按時段實測 |
| 每日更新 | GitHub Actions（因為帳戶收費問題，暫時行唔到） |

問題：位置計算按用戶數重複做；每次計位置都冇歷史；依賴第三方行車時間；Vercel function 唔可以維持長連線或者喺背景一路 poll。

## 3. 實測依據（2026-11-06）

連續 3 分鐘、每 5 秒問一次：

| 來源 | 數據實際更新頻率 | 一次攞到幾多 |
|---|---|---|
| 城巴 `eta/CTB/{stop}/{route}` | 約每 20 秒（唔規則） | 一個站一條線；**冇成條線 API** |
| 九巴 `route-eta/{route}/{service_type}` | 約每 25 秒 | **成條線一次**（1A：137 行） |
| 港鐵巴士 `getSchedule` | 時間戳只到分鐘，判斷唔到 | 成條線一次（行緊嘅車有 GPS） |
| 新大嶼山 `stop.php?action=estimatedArrivals` | 未量 | 一個站一個 routeId |

結論：
- **每秒 poll 冇意義**，跟來源節奏每 10–15 秒一次就夠。
- **全網預先 poll 唔可行**：城巴大約 400 條線、逐站問，一輪二萬幾次請求。只可以「有人睇先 poll」。
- data.gov.hk 冇公開請求上限，全部請求由同一個 IP 發出，要控制頻率同退避，避免被封。

## 4. 目標架構

```
              is*hosting 香港 VPS（Dokploy 管理）
 ┌───────────────────────────────────────────────────────┐
 │ tracker（Node 22 + TypeScript，用 @hknt/core）          │
 │   ├ Presence 知道邊條線有人睇 → 只 poll 呢啲線          │
 │   ├ 每條線每 10–15 秒 poll 一次（按公司 API 特性）     │
 │   ├ 每架車維持狀態（歷史 ETA、上次位置、實測車速）     │
 │   ├ 計位置 → Supabase Realtime Broadcast              │──► 網頁 / App 訂閱
 │   ├ 偵測過站 → 批量寫入 Postgres（stop_passages）       │
 │   └ HTTP：/health、/snapshot（後備同首次載入用）        │
 │ pipeline（Python，Dokploy 每日排程 04:17）             │
 │   └ 路線、站、走法、時間表 → Postgres（同時照出 JSON）  │
 │ aggregator（SQL／排程）                                │
 │   └ stop_passages → segment_times（按星期、時段）       │
 │ Supabase 自架（Postgres + PostGIS + Realtime + Kong）   │
 └───────────────────────────────────────────────────────┘
 Vercel（網頁，hkg1）──讀 Postgres（或者暫時照讀 GitHub JSON）
```

### 4.1 tracker

- 語言：TypeScript（同網頁、App 共用 `packages/core`：`etasAtStop`、`trackLine`、`BusStabilizer`、`mergeScheduleBuses` 等）。
- 部署：Dokploy Docker app，一個 instance 就夠（記憶體狀態唔使分散）。重啟後由下一輪 poll 重新建立狀態。
- **lazy poll**：
  - 用 Realtime Presence：客戶端訂閱頻道時 `track()` 自己；tracker 監聽 Presence，頻道有人就開 poller。
  - 冇人睇 **3 分鐘**先停（避免轉頁、轉方向時重複開關）。
  - 預熱名單（可選）：收藏最多、繁忙時段熱門線常駐。
- **每間公司點 poll**：

  | 公司 | 方法 | 每輪請求數 |
  |---|---|---|
  | 九巴（連聯營九巴部分） | `route-eta/{route}/{service_type}` 成條線 | 1 |
  | 港鐵巴士 | `getSchedule` 成條線 | 1 |
  | 城巴 | 逐站 `eta/CTB/{stop}/{route}`，並發上限 6 | 約 20–40 |
  | 新大嶼山 | 逐站逐 routeId | 約 10–40 |

  - 頻率：預設 15 秒；城巴、新巴請求多，可以按線長度調到 15–20 秒。
  - **全局限流**：所有 poller 共用一個 token bucket（例如每秒最多 30 個請求去 data.gov.hk），超出就排隊、拉長間隔。
  - 出錯：沿用 `failed` 概念，連續失敗用指數退避（15 → 30 → 60 秒），推送時標明邊間公司攞唔到數據。
- **每架車嘅狀態（記憶）**：
  - 用連續幾輪 ETA 嘅配對（同一架車喺下游站嘅 ETA 逐輪遞減）建立「虛擬車輛 ID」；港鐵巴士有真 `busId`。
  - 記錄每架車每輪嘅位置估算，得出實際車速。塞車時用實際車速，唔使靠平均行車時間。
  - **過站偵測**：一架車喺某站嘅 ETA 消失（而下一個站仍然有佢）＝ 已經過咗呢個站，記錄過站時間。
  - 位置只准向前（`BusStabilizer` 搬去後端做），前端唔使再做。
- **推送內容**：只喺有新數據時推（約每 15 秒），唔使每秒推；前端自己每秒沿路線推前，畫面順滑。

### 4.2 Realtime 頻道格式

頻道名：`route:{co}:{route}:{variantId}`，例如 `route:ctb:38:1000304-1`。

Broadcast 事件 `buses`：

```jsonc
{
  "v": 1,                          // 格式版本
  "at": "2026-11-06T00:19:42+08:00", // 計算時間
  "dataAt": { "CTB": "2026-11-06T00:19:30+08:00" }, // 各公司數據時間戳
  "segSeconds": [84, 197, 132],    // 而家每段行車時間（實測／記憶）
  "buses": [
    {
      "id": "ctb-38-a1",           // 虛擬車輛 ID（港鐵巴士用真 busId）
      "from": 5,                   // 喺第 5、6 個站之間（index 對應 variantStops）
      "nextEta": "2026-11-06T00:21:10+08:00",
      "company": "CTB",
      "gps": null,                 // 港鐵巴士／新巴有 GPS 先有
      "schedule": false,           // 按時間表推算（半透明）
      "speed": 6.2                 // 米／秒（實測，可選）
    }
  ],
  "failed": []                     // 攞唔到數據嘅公司
}
```

另外 `etas` 事件（按站）：前端打開一個站時，用同一個頻道收該站 ETA，唔使再自己 call `/api/eta`。
第一階段可以照用 `/api/eta`，之後先搬。

### 4.3 數據庫表（Postgres + PostGIS）

靜態數據（pipeline 每日寫入；用 `version` 標記，換版時一個 transaction 切換）：

```sql
create table routes (
  co text, route text, companies text[], orig_tc text, dest_tc text,
  joy_you boolean, data jsonb,              -- 成個路線檔（同而家 JSON 一樣），網頁照用
  version text, primary key (co, route)
);
create table stops (
  co text, stop_id text, name_tc text, name_en text,
  geom geography(point, 4326),             -- 「附近」用 ST_DWithin
  routes jsonb, primary key (co, stop_id)
);
create index on stops using gist (geom);
create table calendar (service_id text primary key, days boolean[], start_date date, end_date date, add_dates date[], remove_dates date[]);
create table data_versions (version text primary key, generated_at timestamptz, stats jsonb, published boolean);
```

實時衍生數據（tracker 寫入）：

```sql
-- 過站紀錄：一架車幾點過邊個站（最有價值嘅數據）
create table stop_passages (
  id bigserial primary key,
  co text, route text, variant_id text, dir text,
  stop_seq int, stop_id text,
  bus_key text,                 -- 虛擬車輛 ID
  passed_at timestamptz,        -- 估計過站時間
  source text                   -- 'eta-disappear' | 'gps' | 'schedule'
);
create index on stop_passages (co, route, variant_id, passed_at);

-- 每段實際行車時間（aggregator 由 stop_passages 計，按星期、鐘頭）
create table segment_times (
  from_stop text, to_stop text, weekday int, hour int,
  median_s int, p80_s int, samples int, updated_at timestamptz,
  primary key (from_stop, to_stop, weekday, hour)
);
```

- **唔存**每個原始 ETA（估算一日三千幾萬行）；如果要除錯，最多存 24 小時，用分區表每日 drop。
- `stop_passages` 保留 90 日，之後只留 `segment_times` 統計。
- pipeline 嘅 `segment_times()` 之後改為：自己嘅實測樣本夠（例如 ≥ 20）就用自己嘅，唔夠先用 hk-bus-time-between-stops。

### 4.4 權限

- 前端（網頁、App）只用 **anon key**：Realtime 只可以訂閱 `route:*` 頻道、只讀；Postgres 表開 RLS，`routes`、`stops`、`calendar`、`segment_times` 只讀，`stop_passages` 唔開放。
- tracker、pipeline 用 **service role key**，只放喺伺服器環境變數，唔入 repo。
- Supabase Studio 唔好直接開放上網（用 Dokploy 內網或者加 IP 限制）。

### 4.5 前端改動

- `lib/realtime.ts`（網頁）同 `src/lib/realtime.ts`（App）：supabase-js 訂閱頻道，Presence `track()`。
- `StopList`（網頁）同路線頁（App）：收到 `buses` 就更新；冇連線或者 45 秒冇收到推送，**自動退返而家嘅 `/api/buses` 輪詢**。
- 前端唔再做 `BusStabilizer`（後端做咗），只按 `nextEta` 同 `segSeconds` 每秒沿走線推前。
- App 去咗背景會斷線：返到前台即刻重新訂閱，同時 call 一次 `/snapshot` 補返最新狀態。

### 4.6 每日數據更新

- Dokploy 排程（每日 04:17）跑：`fetch.py` → `build.py` → `check.py` → 寫入 Postgres（新 `version`）→ 照推 GitHub `data` 分支（過渡期網頁仲讀緊）。
- `check.py` 唔通過就唔切換版本，網頁繼續用舊版（同而家一樣）。
- 成功後 GitHub Actions 嘅 `data.yml` 可以停用或者刪走。

## 5. 階段

### 階段 0：伺服器準備
- [ ] is*hosting 香港 VPS 規格確認（Supabase 自架建議最少 4GB RAM；連 tracker、pipeline 建議 8GB）
- [ ] Dokploy 安裝、網址同 HTTPS（例如 `db.kyle05.dev`、`rt.kyle05.dev`）
- [ ] Supabase 自架（Postgres + PostGIS + Realtime + Kong），Studio 唔對外
- [ ] 備份：Postgres 每日備份去 VPS 以外（例如 S3 相容儲存）

### 階段 1：tracker + 推送（只做巴士位置）
- [ ] `apps/tracker`：Node + TypeScript，用 `@hknt/core`；Dockerfile；Dokploy 部署
- [ ] Presence 驅動嘅 lazy poll、全局限流、退避
- [ ] 計位置（先沿用 `trackLine` + `BusStabilizer` + `mergeScheduleBuses`，未有記憶）
- [ ] Broadcast `buses` 事件；`/health`、`/snapshot`
- [ ] 網頁同 App 訂閱，失敗自動退返 `/api/buses`
- 驗收：兩個瀏覽器睇同一條線，巴士公司 API 每 15 秒只被 call 一輪；斷開 tracker，前端 45 秒內退返輪詢

### 階段 2：記憶同過站紀錄
- [ ] 虛擬車輛 ID（跨輪配對同一架車）
- [ ] 用實測車速推位置；過站偵測寫入 `stop_passages`
- [ ] 驗收：抽 5 條線，比較推算位置同實際到站時間，誤差要細過而家

### 階段 3：自己嘅行車時間
- [ ] aggregator 每小時由 `stop_passages` 計 `segment_times`
- [ ] tracker 同 pipeline 優先用自己嘅實測
- [ ] 驗收：樣本夠嘅段，用自己數據計嘅「+N 分」同實際到站時間比較，誤差要細過 hk-bus-time-between-stops

### 階段 4：數據庫做主要數據來源
- [ ] pipeline 寫入 Postgres；Dokploy 排程取代 GitHub Actions
- [ ] 網頁 `lib/data.ts` 改讀 Postgres（`routes.data`）；「附近」改用 PostGIS
- [ ] 停用 GitHub `data` 分支（保留一段時間做後備）

### 之後
- 到站時間（`etas` 事件）都經 tracker 推送
- 「呢條線平時準唔準」、繁忙時間預多幾耐（由 `stop_passages` 計）
- 導航：用 `segment_times` 估計每程時間同轉車等候

## 6. 風險同對策

| 風險 | 對策 |
|---|---|
| data.gov.hk 封 IP（全部請求同一個 IP） | 全局限流、lazy poll、跟來源節奏；監察 429／錯誤率；必要時加第二個出口 IP |
| tracker 死咗或者重啟 | 前端自動退返 `/api/buses`；Dokploy 自動重啟；狀態下一輪重建 |
| 自架 Supabase 記憶體唔夠 | 階段 0 先確認規格；Realtime 頻道數同 Presence 數有監察 |
| App 背景斷線 | 返前台重新訂閱 + `/snapshot` |
| 數據庫越嚟越大 | 唔存原始 ETA；`stop_passages` 90 日分區；只長期保留統計 |
| 一個 VPS 單點故障 | 網頁照放 Vercel、靜態數據過渡期照放 GitHub；實時部分有輪詢後備 |

## 7. 未決定 / 要問

- VPS 規格（RAM、CPU、儲存）
- Dokploy、Supabase 架好未
- 網址：tracker、Supabase 用咩子網域
- 網頁最終留 Vercel 定搬上 Dokploy（建議留 Vercel）
- 預熱名單：要唔要常駐 poll 熱門線，幾多條
