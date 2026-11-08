# 實時後端計劃：香港 tracker + Supabase 帳戶

> 狀態：**實作中**（2026-11-08 開始）。Dokploy 已經準備好；部署步驟睇 **`deploy/README.md`**。
> 做嘅時候逐步更新呢份文件（每個階段完成就喺「階段」嗰度打剔，改咗設計就改返呢度），
> 完成後將重點搬入根目錄 `CLAUDE.md`。
>
> **2026-11-06 決定**：實時部分（巴士位置、到站時間、過站紀錄）放自己嘅香港 VPS，用輕量方案
> （Postgres + Valkey + tracker 自己用 WebSocket 推送），**唔自架 Supabase**；
> 帳戶（登入、收藏同步、設定）用 **Supabase 雲端版（新加坡）**。原因：帳戶數據流量細、唔怕慢幾十毫秒，
> 但最怕外洩同冇備份，交俾託管服務；實時數據要快、要喺香港，自己架。VPS 因此 4GB 就夠（自架整套 Supabase 要 8GB）。

> **2026-11-08 檢討後改動**：
> - 次序改為：每日 pipeline 搬上 VPS（數據更新停咗，最急）→ 量上游請求上限 → tracker 第一版（HTTP，同 `/api/buses` 一樣格式）
>   → WebSocket → 到站推送通知 → 記憶同過站紀錄。
> - tracker 第一版**唔用 Valkey／Postgres**：一個 instance，記憶體 cache 就夠；多 instance 或者要記狀態先加。
> - 城巴冇成條線 API，逐站問：一條 30 個站嘅線每 15 秒一輪 ≈ 每秒 2 個請求，全局每秒 20–30 個即係同時大約 10–15 條城巴線。
>   所以要先量上限（`node dist/probe.js`），之後考慮隔站問、只密 poll 打開咗嘅站上游嗰段；單站 ETA 照用 Vercel `/api/eta`（分開 IP）。
> - 過站偵測（ETA 消失）會好嘈：要連續兩輪唔見而且下游仲見到同一架車先算；`segment_times` 用中位數。
> - 加「到站推送通知」階段（推送 token 存 Supabase，tracker 檢查，Expo 推送服務發出）。
> - tracker 網址要喺 App 上架前定（買咗網域先用佢嘅子網域）。

## 1. 目標

- **前端只負責顯示**：巴士位置、到站時間全部由後端計好，網頁同 App 收到就畫。
- **一條線只 poll 一份**：唔理幾多人睇緊同一條線，巴士公司都只會被 call 一次，計好再推俾所有人。
- **伺服器放香港**：巴士公司 API 全部喺香港，減少跨太平洋來回。
- **後端有記憶**：記住每架車過去幾分鐘嘅 ETA，用實際車速同過站時間計位置，唔再每次由零開始。
- **自己量行車時間**：由過站紀錄計每段路實際行車時間，取代第三方 hk-bus-time-between-stops（實驗性質、有異常值）。
- **預先 fetch**：用戶搜尋、撳落路線嗰陣已經開始準備數據，入到路線頁差唔多即刻有巴士位置（見第 4.7 節）。
- **帳戶**：登入後收藏、設定喺手機同電腦之間同步；唔登入照用得（見第 4.8 節）。
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
              香港 VPS（4GB RAM、40GB SSD，Dokploy 管理）
 ┌───────────────────────────────────────────────────────┐
 │ tracker（Node 22 + TypeScript，用 @hknt/core）          │
 │   ├ WebSocket 訂閱同預熱訊號 → 只 poll 有人睇／就嚟睇嘅線 │
 │   ├ 每條線每 10–15 秒 poll 一次（按公司 API 特性）     │
 │   ├ 每架車維持狀態（歷史 ETA、上次位置、實測車速）     │
 │   ├ 計位置 → WebSocket 推送                           │──► 網頁 / App
 │   ├ 偵測過站 → 批量寫入 Postgres（trips）               │
 │   └ HTTP：/health、/snapshot、/warm                    │
 │ pipeline（Python，Dokploy 每日排程 04:17）             │
 │   └ 路線、站、走法、時間表 → Postgres（同時照出 JSON）  │
 │ aggregator（SQL／排程）                                │
 │   └ trips → segment_times（按星期、時段）              │
 │ Valkey（或 Redis）：上游 cache、限流、預熱、快照、車輛狀態 │
 │ Postgres 17 + PostGIS（只聽內網）                      │
 └───────────────────────────────────────────────────────┘
 Vercel（網頁，hkg1）──讀 Postgres（或者暫時照讀 GitHub JSON）

 Supabase 雲端版（新加坡，免費版起步）
   Auth（Google、Apple、電郵連結）＋ 用戶數據表（收藏、設定），RLS 保護 ◄── 網頁 / App 直接連
```

點解唔用 Supabase Realtime 推巴士位置：多經一個伺服器（新加坡）會慢；tracker 本身已經知道邊條線有人睇，
自己推最直接。WebSocket 瀏覽器同 React Native 都原生支援，唔使額外套件。

### 4.1 tracker

- 語言：TypeScript（同網頁、App 共用 `packages/core`：`etasAtStop`、`trackLine`、`BusStabilizer`、`mergeScheduleBuses` 等）。
- 部署：Dokploy Docker app，一個 instance 就夠（記憶體狀態唔使分散）。重啟後由下一輪 poll 重新建立狀態。
- **lazy poll**：
  - 客戶端經 WebSocket 訂閱某條線，tracker 記住每條線有幾多個連線，有人就開 poller。
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

### 4.1a Redis（或 Valkey）

用 Dokploy 喺同一部 VPS 架，只聽內網（唔對外開放），設密碼。Redis 7.4 起改咗授權，
如果介意可以用 Linux 基金會嘅開源分支 **Valkey**（指令相容，客戶端照用 `ioredis`）。

| 用途 | key（例子） | TTL | 說明 |
|---|---|---|---|
| 上游回應 cache | `up:ctb:eta:{stop}:{route}`、`up:kmb:route-eta:{route}:{st}` | 10–15 秒 | tracker、網頁 `/api/eta`、預熱共用；跟來源更新節奏 |
| 合併同時請求 | `lock:up:{同上}` | 5 秒 | `SET NX`：拎到鎖先 call 上游，其他人等 cache（避免同一個站同時 call 兩次） |
| 全局限流 | `rl:datagov`（token bucket，Lua script） | — | 所有 poller 共用，例如每秒最多 30 個請求；超出就排隊 |
| 預熱訊號 | `warm:{co}:{route}:{dir}` | 60 秒 | 見第 4.7 節；tracker 定期掃 |
| 最新快照 | `snap:{co}:{route}:{variantId}` | 2 分鐘 | 最後一次推送嘅 `buses` 內容；新訂閱即刻有第一份、`/snapshot` 讀呢度 |
| 車輛狀態 | `veh:{co}:{route}:{variantId}`（hash） | 10 分鐘 | 虛擬車輛 ID、歷史 ETA、實測車速；tracker 重啟唔會失憶 |
| 退避狀態 | `backoff:{co}` | 按退避時間 | 某間公司連續出錯就暫停 |

原則：
- Redis 只放**短命**數據，唔做長期儲存（長期嘅放 Postgres）。Redis 冇咗只會慢少少，唔會壞。
- 網頁 `/api/eta`、`/api/buses`（Vercel hkg1）**暫時唔連 Redis**：Vercel 連 VPS 要經公網，仲要另外處理 TLS 同密碼。
  等 tracker 穩定之後，網頁 API 可以改為轉發去 tracker（tracker 讀 Redis），或者直接由前端訂閱推送。

### 4.2 WebSocket 訊息格式

連線：`wss://rt.kyle05.dev/ws`（網址未定）。客戶端送：

```jsonc
{ "op": "sub", "topic": "route:ctb:38:1000304-1" }   // 訂閱（同時只可以訂幾條，例如 3 條）
{ "op": "unsub", "topic": "route:ctb:38:1000304-1" }
{ "op": "warm", "co": "ctb", "route": "38", "dir": "O" } // 預熱（見第 4.7 節）
```

訂閱後即刻收到最新快照（`snap:*`），之後有新數據先推。每 25 秒 ping／pong，冇回應就當斷線。

topic `route:{co}:{route}:{variantId}`，事件 `buses`：

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

另外 `etas` 事件（按站）：前端打開一個站時，用同一條連線收該站 ETA，唔使再自己 call `/api/eta`。
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
-- 行程紀錄：每班車一行，過站時間存做陣列（最有價值嘅數據）
-- 唔好每次過站一行：全港平日約 6 萬班、143 萬次過站，每次一行一日約 172MB（90 日 15.5GB）；
-- 每班一行一日約 16MB（90 日 1.5GB），而且 tracker 只 poll 有人睇嘅線，實際少好多。
create table trips (
  id bigserial primary key,
  co text, route text, variant_id text, dir text,
  service_date date,               -- 服務日（過咗午夜嘅班次算前一日）
  bus_key text,                    -- 虛擬車輛 ID（港鐵巴士用真 busId）
  first_stop_seq int,              -- 陣列第一格對應走法第幾個站（中途先開始追蹤嘅班次）
  passed_at timestamptz[],         -- 每個站嘅估計過站時間；未知用 null
  source text,                     -- 'eta-disappear' | 'gps' | 'schedule'
  updated_at timestamptz
);
create index on trips (co, route, variant_id, service_date);

-- 每段實際行車時間（aggregator 由 trips 計，按星期、鐘頭）：約幾十萬行、50–100MB
create table segment_times (
  from_stop text, to_stop text, weekday int, hour int,
  median_s int, p80_s int, samples int, updated_at timestamptz,
  primary key (from_stop, to_stop, weekday, hour)
);
```

容量估算（2026-11-06，用政府時間表計）：

| 數據 | 大小 |
|---|---|
| 路線、站、時間表、走線（JSON 41MB，Postgres 壓縮後） | 約 15–25MB |
| `trips`（全港全部記錄；實際只記有人睇嘅線） | 約 16MB／日，90 日約 1.5GB |
| `segment_times` | 約 50–100MB |
| Postgres 記憶體（shared_buffers 256MB） | 平時約 150–300MB |

結論：同其他服務放同一部 VPS 就得，40GB 硬碟夠用好耐；每晚 `pg_dump` 壓縮備份去 VPS 以外。

- **唔存**每個原始 ETA（估算一日三千幾萬行）；如果要除錯，最多存 24 小時，用分區表每日 drop。
- `trips` 保留 90 日（按月分區，舊分區直接 drop），之後只留 `segment_times` 統計。
- pipeline 嘅 `segment_times()` 之後改為：自己嘅實測樣本夠（例如 ≥ 20）就用自己嘅，唔夠先用 hk-bus-time-between-stops。

### 4.4 權限

- VPS 嘅 Postgres、Valkey **只聽內網**，唔對外開放；網頁（Vercel）要讀 Postgres 時經 tracker 嘅 HTTP API，
  或者開一個只讀帳戶 + TLS + IP 限制（階段 4 再決定）。
- tracker 嘅 WebSocket 公開但只讀：只可以訂閱 `route:*`、送 `warm`；每個 IP 連線數同訊息頻率有上限。
- 睇數據庫用 pgweb／Adminer（只喺內網或者加 IP 限制），或者 SSH tunnel 用電腦嘅工具。
- Supabase 雲端：前端只用 **anon key**（本身係公開嘅），所有用戶表一定要開 RLS；**service role key** 只放伺服器環境變數，唔入 repo、唔入 App。

### 4.5 前端改動

- `lib/realtime.ts`（網頁）同 `src/lib/realtime.ts`（App）：原生 WebSocket，斷線自動重連（退避），訂閱而家睇緊嘅線。
  邏輯放 `packages/core`（純 TS，兩邊共用），只有 WebSocket 本身由平台提供。
- `StopList`（網頁）同路線頁（App）：收到 `buses` 就更新；冇連線或者 45 秒冇收到推送，**自動退返而家嘅 `/api/buses` 輪詢**。
- 前端唔再做 `BusStabilizer`（後端做咗），只按 `nextEta` 同 `segSeconds` 每秒沿走線推前。
- App 去咗背景會斷線：返到前台即刻重新訂閱，同時 call 一次 `/snapshot` 補返最新狀態。

### 4.7 預先 fetch（預測用戶會撳邊條線）

用戶由「列表剩幾條候選」到入到路線頁，通常有 1–2 秒空檔，可以用嚟預先準備數據。
但估錯就係浪費巴士公司 API 請求，所以**只喺好有把握時做，同埋有上限**。

| 時機 | 準確度 | 做咩 | 上游請求 |
|---|---|---|---|
| 手指撳落路線（`pointerdown`／`onPressIn`，未放手） | 非常高 | 預熱嗰條線嗰個方向：送預熱訊號（或者而家架構直接 call `/api/buses`） | 有 |
| 打完號碼停咗 0.4 秒，候選 ≤ 3 條 | 中 | 只預載**路線資料**（靜態、約 10KB），唔 call 巴士公司 | 冇 |
| 開 App／首頁 | 高（用戶習慣） | 收藏嘅站同線、最近睇過嘅 3 條線送預熱訊號 | 有 |
| 「附近」列表出咗 | 高 | 已經會攞到站時間（`/api/stop-etas`），共用上游 cache | 有 |
| 每打一個字就預熱所有候選 | 低 | ❌ 唔做（打「1」已經 100 幾條候選） | — |

預熱訊號：
- 前端 `POST /warm`（tracker HTTP）`{ co, route, dir }`，或者經 WebSocket 送 `{ "op": "warm" }`。
- tracker 寫 `warm:{co}:{route}:{dir}`（TTL 60 秒），即刻開始 poll 嗰條線嘅預設走法（`sortVariants` 第一個；
  城巴逐站 ETA 本身已經包兩個方向，所以其實係預熱成條線）。
- 60 秒內冇人真正訂閱就停。
- 上限：每個客戶端同時最多 3 條；全局預熱線數上限（例如 200）；照計全局限流。預熱嘅優先級低過有人睇緊嘅線。
- 熱門線（收藏最多、繁忙時段）可以長期保持熱身（之後由數據決定）。

過渡期（未有 tracker）：網頁同 App 喺 `pointerdown`／`onPressIn` 時背景 call 一次 `/api/buses`，
令 Vercel 每站 10 秒 cache 先熱起嚟；候選 ≤ 3 條時預載路線資料（App 寫入 `cachedRoute`，網頁用 Next.js 預載）。

效果預期：路線資料本身已經好快（App 有快取），最慢係第一次攞巴士位置同到站時間（城巴長線要逐站問）。
預熱可以將呢段時間收埋喺用戶揀路線嘅空檔入面。

### 4.8 帳戶（Supabase 雲端版）

原則：**唔登入照用得**。收藏同設定一律先存喺部機（而家嘅 localStorage／AsyncStorage），登入之後先同步上雲。

- **地區**：新加坡（離香港最近）。收藏同步唔怕慢幾十毫秒。
- **方案**：免費版（每月 5 萬活躍用戶、500MB 數據庫）；一個禮拜冇人用會暫停，有用戶就唔會。
  正式上架或者用戶多咗就升 Pro（每月 25 美元，有每日備份）。
- **登入方式**：Google、Apple、電郵連結（magic link），唔設密碼。
  iOS App 有第三方登入就**一定要有「以 Apple 登入」**（App Store 規定）。
  App 用 `expo-apple-authentication`、Google 用 Supabase OAuth（`expo-auth-session`／`expo-web-browser`）；用之前睇 Expo SDK 58 文件。
- **刪除帳戶**：App 入面要有（App Store、Google Play 都要求），刪埋所有用戶數據。
- **私隱政策頁**：上架前要有，寫明存咩（電郵、收藏、設定）、存喺邊（Supabase 新加坡）、點刪。
- **唔存位置**：定位只喺部機用，唔上傳。

表（全部開 RLS：`user_id = auth.uid()` 先讀寫得）：

```sql
create table favorites (
  user_id uuid references auth.users on delete cascade,
  key text,                       -- favKey：`${co}/${route}/${dir}/${stopId ?? ''}`
  co text, route text, dir text,
  dest text, companies text[],
  stop_id text, stop_name text,
  added_at timestamptz,           -- 對應 Favorite.at
  deleted_at timestamptz,         -- 軟刪除：同步時要知道「刪咗」，唔係「未同步到」
  updated_at timestamptz default now(),
  primary key (user_id, key)
);
create table user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb,                     -- 例如深色模式、預設分頁；加欄位唔使改表
  updated_at timestamptz default now()
);
alter table favorites enable row level security;
create policy own on favorites using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table user_settings enable row level security;
create policy own on user_settings using (user_id = auth.uid()) with check (user_id = auth.uid());
```

同步規則：
- **第一次登入**：本機收藏同雲端**合併**（按 `key` 取聯集），唔好覆蓋任何一邊。
- **之後**：每項以 `updated_at` 較新嗰邊為準；刪除寫 `deleted_at`（軟刪除），30 日後清走。
- **離線**：本機照改，記低未同步嘅改動，有網先上傳。
- **登出**：問用戶要唔要保留本機收藏（預設保留）。
- 本機格式（`Favorite`）唔變，只係多記 `updatedAt`／`deletedAt`；網頁同 App 同步邏輯放 `packages/core`。

### 4.6 每日數據更新

- Dokploy 排程（每日 04:17）跑：`fetch.py` → `build.py` → `check.py` → 寫入 Postgres（新 `version`）→ 照推 GitHub `data` 分支（過渡期網頁仲讀緊）。
- `check.py` 唔通過就唔切換版本，網頁繼續用舊版（同而家一樣）。
- 成功後 GitHub Actions 嘅 `data.yml` 可以停用或者刪走。

## 5. 階段

### 階段 0：伺服器準備
- [x] Dokploy（2026-11-08 用戶已經準備好）
- [ ] 香港 VPS：**4GB RAM、40GB SSD** 就夠（平時約 1.1–1.6GB，每日 pipeline 高峰再加 1.6GB：
      2026-11-06 實測 build.py 最高 1643MB、59 秒）；想用 2GB 要先減細 pipeline 記憶體 + 開 swap。
      先由細規格開始，唔夠先升級
- [ ] Dokploy 安裝、網址同 HTTPS（例如 `rt.kyle05.dev`）
- [ ] Postgres 17 + PostGIS、Valkey（只聽內網）
- [ ] 備份：Postgres 每晚 `pg_dump` 壓縮去 VPS 以外（例如 S3 相容儲存）

### 階段 A：帳戶（獨立，唔使等 VPS，隨時可以做）
- [ ] Supabase 雲端項目（新加坡）；Auth：Google、Apple、電郵連結
- [ ] `favorites`、`user_settings` 表 + RLS；用另一個帳戶驗證讀唔到人哋嘅數據
- [ ] core：同步邏輯（合併、`updated_at` 較新為準、軟刪除、離線佇列）+ 測試
- [ ] 網頁、App：登入／登出、收藏同步、刪除帳戶
- [ ] 私隱政策頁
- 驗收：手機收藏 → 電腦即刻見到；離線改完上網自動同步；刪除帳戶後數據清走

### 階段 0.5：預先 fetch（而家架構就做得，唔使等後端）✅ 2026-11 完成
- [x] 網頁、App：撳落路線（未放手，`pointerdown`／`onPressIn`）背景 call `/api/buses`
      （路線列表、附近、收藏、喺度搭得；網頁 `lib/prefetch.ts`、App `src/lib/prefetch.ts`）
- [x] 候選 ≤ 3 條、停咗 0.4 秒：預載路線資料
- [x] 預設走法用 core `pickVariant`／`defaultDir`，路線頁同預熱一致（網址唔同就唔會命中伺服器 cache）
- 驗收：由撳路線到見到第一架巴士嘅時間，比冇預載快

### 階段 0.8：每日數據更新搬上 VPS（2026-11-08 程式寫好，未部署）
- [x] `deploy/pipeline/`：Dockerfile + `run.sh`（同 data.yml 一樣：clone → fetch → build → check → 推 data 分支）
      + `scheduler.py`（每日 04:17 香港時間、`RUN_ON_START`、`PING_URL` 監察、`/state/last-run.json`）
- [x] 本地用假 repo 跑通成個流程（約 2 分 15 秒）
- [x] **2026-11-08 第一次喺 VPS 跑：城巴 `stop/{id}` 回 403 Forbidden**（fetch.py 用 32 條線程，同一個 IP 問得太密俾人擋；
      GitHub Actions 每次換 IP 所以以前冇事）。改：所有 `rt.data.gov.hk` 請求共用限速 `RT_RPS`（預設每秒 8）、線程減到 6、
      403／429 退避 5–80 秒再試；城巴站資料 cache 喺 `/state/ctb-stops.json`（Dokploy volume），每次只問新站 + 最舊 400 個。
      教訓：tracker 同 pipeline 共用 VPS IP，上游限流要計埋兩邊；tracker 預設 `UPSTREAM_RPS` 改做 10。
- [x] Dokploy 部署、GitHub fine-grained token（Contents 讀寫）；2026-11-08 16:06 第一次成功（9 分鐘，城巴冇 cache 佔 7.5 分鐘），網站即刻用新數據
- [ ] 確認 04:17 排程自己跑到；`/state` volume
- [ ] 停用 GitHub Actions `data.yml`

### 階段 1a：tracker 第一版（HTTP，2026-11-08 程式寫好，未部署）
- [x] `apps/tracker`：Node 22 + TypeScript，esbuild 打包（連 core），Dockerfile（node:22-alpine，唔使 node_modules）
- [x] `GET /api/buses`：同網頁一樣格式（多咗 `failed`）；第一次有人問就計，之後背景每 15 秒 poll，3 分鐘冇人問就停；
      同時 poll 上限 `MAX_LINES`
- [x] 上游 fetch：10 秒 cache、合併同時請求、全局 token bucket 限流、每間公司統計（`/health`）
- [x] `node dist/probe.js`：量城巴 API 請求上限
- [x] 前端：core `createBusesClient`，網頁 `NEXT_PUBLIC_TRACKER_URL`、App `EXPO_PUBLIC_TRACKER_URL`；
      tracker 出錯／超時 5 秒就退返 `/api/buses`，60 秒後再試
- [x] 本地驗證：城巴 38、九巴 1A、聯營 101、新大嶼山 11、港鐵巴士 K76 結果同 `/api/buses` 一樣；停咗 tracker 前端自動退返
- [x] Dokploy 部署（2026-11-08）：`https://rt.kyle05.dev`。VPS 嘅 80／443 係 Moodle 嘅 Caddy，所以 HTTPS 由 Caddy 做
      （Caddy 接駁 `dokploy-network`，reverse_proxy 去 tracker 容器），Dokploy 唔設 Domain；步驟見 `deploy/README.md`
- [x] 實測：城巴 38、九巴 1A、聯營 101、新大嶼山 11、港鐵巴士 K76 同網站一致；第一次 4–12 秒（限速每秒 8），之後用快照
- [x] 前端超時（5 秒）唔再當 tracker 死咗（只係今次用後備）；限速改為每個上游伺服器各自計
- [ ] 喺 VPS 跑 probe 定 `UPSTREAM_RPS`（等俾人封過嘅 IP 冷靜一兩日先）
- [x] Vercel 設 `NEXT_PUBLIC_TRACKER_URL=https://rt.kyle05.dev`（2026-11-08）：正式網站巴士位置由 tracker 攞，CORS 正常
- [x] Caddy 永久接駁 `dokploy-network`（moodle-docker compose）；pipeline 刪咗 `RUN_ON_START`、加 `/state` volume
- [x] 到站時間都經 tracker（`/api/eta`，2026-11-08，用戶要求前後端分清楚）：追蹤緊嘅線直接用上游 cache（實測打開一個站上游請求 0）；
      前端（網頁、App）所有「某站到站時間」同巴士位置一律 tracker 優先、Vercel 後備（core `createLiveClient`）
- [x] 計巴士位置搬入 core `computeBuses`（Vercel 同 tracker 共用，唔再抄兩份）
- [x] App 預設用 tracker（`https://rt.kyle05.dev`）
- [x] tracker 加 `/api/stop-etas`、`/api/here`（低優先；一俾人話忙成個請求即刻 503）；邏輯搬入 core `stop-live.ts`（Vercel 同 tracker 共用）
- [ ] 前端改經 tracker：**暫時關**（`AREA_ETAS_VIA_TRACKER = false`）。2026-11-08 正式環境實測：首頁一次 8 個站頭，
      中環一個位置要成 90 個上游請求，`UPSTREAM_RPS=8` 下 tracker 排隊十幾秒，前端 1.5 秒後同時問 Vercel → 兩邊都做（浪費一倍）。
      量完上限、調高 `UPSTREAM_RPS` 再開；或者先做「九巴成條線一次過」同按站合併請求，減少每個位置要問幾多次
- 之後：九巴改用 `route-eta`（成條線一次）代替逐站，請求量大減

### 階段 1b：WebSocket 推送
- [ ] Valkey：要多個 instance 或者重啟唔失憶先加（第一版用記憶體）
- [ ] 預熱訊號（`/warm`）同上限；快照（`snap:*`）
- [ ] WebSocket 訂閱驅動嘅 lazy poll、全局限流、退避
- [ ] 計位置（先沿用 `trackLine` + `BusStabilizer` + `mergeScheduleBuses`，未有記憶）
- [ ] WebSocket `buses` 事件；`/health`、`/snapshot`
- [ ] 網頁同 App 訂閱，失敗自動退返 `/api/buses`
- 驗收：兩個瀏覽器睇同一條線，巴士公司 API 每 15 秒只被 call 一輪；斷開 tracker，前端 45 秒內退返輪詢

### 階段 1c：到站推送通知
- [ ] App：expo-notifications，推送 token 存 Supabase（要帳戶，階段 A）
- [ ] 用戶喺打開咗嘅站設「仲有 N 分鐘提我」；tracker 每輪計完檢查，經 Expo 推送服務發出
- [ ] 一次性提醒，發咗就刪；冇人睇嘅線都要 poll（計入全局限流）

### 階段 2：記憶同過站紀錄
- [ ] 虛擬車輛 ID（跨輪配對同一架車）
- [ ] 用實測車速推位置；過站偵測寫入 `trips`
- [ ] 驗收：抽 5 條線，比較推算位置同實際到站時間，誤差要細過而家

### 階段 3：自己嘅行車時間
- [ ] aggregator 每小時由 `trips` 計 `segment_times`
- [ ] tracker 同 pipeline 優先用自己嘅實測
- [ ] 驗收：樣本夠嘅段，用自己數據計嘅「+N 分」同實際到站時間比較，誤差要細過 hk-bus-time-between-stops

### 階段 4：數據庫做主要數據來源
- [ ] pipeline 寫入 Postgres；Dokploy 排程取代 GitHub Actions
- [ ] 網頁 `lib/data.ts` 改讀 Postgres（`routes.data`）；「附近」改用 PostGIS
- [ ] 停用 GitHub `data` 分支（保留一段時間做後備）

### 之後
- 到站時間（`etas` 事件）都經 tracker 推送
- 「呢條線平時準唔準」、繁忙時間預多幾耐（由 `trips` 計）
- 導航：用 `segment_times` 估計每程時間同轉車等候

## 6. 風險同對策

| 風險 | 對策 |
|---|---|
| data.gov.hk 封 IP（全部請求同一個 IP） | 全局限流、lazy poll、跟來源節奏；監察 429／錯誤率；必要時加第二個出口 IP |
| tracker 死咗或者重啟 | 前端自動退返 `/api/buses`；Dokploy 自動重啟；狀態下一輪重建 |
| VPS 記憶體唔夠（pipeline 高峰） | 先 4GB；監察記憶體；pipeline 減細記憶體或者開 swap，真係唔夠先升級 |
| WebSocket 連線太多 | 每個 IP 連線上限；監察連線數；4GB 機撐幾千條連線冇問題 |
| 帳戶數據外洩 | 所有用戶表開 RLS 並用第二個帳戶測試；service role key 唔入 repo／App；唔存位置 |
| Supabase 免費版暫停或者超額 | 有用戶就唔會暫停；監察用量，大咗升 Pro；收藏本機一定有一份，雲端出事都唔會冇咗 |
| App 背景斷線 | 返前台重新訂閱 + `/snapshot` |
| 數據庫越嚟越大 | 唔存原始 ETA；`trips` 90 日分區；只長期保留統計 |
| 預熱估錯浪費上游請求 | 只喺撳落／候選 ≤ 3 先做；每客戶端 3 條、全局上限；60 秒冇人訂閱就停；優先級低過真正有人睇嘅線 |
| Valkey／Redis 冇咗 | 只放短命數據；tracker 自動退返記憶體 cache，只係慢少少 |
| 一個 VPS 單點故障 | 網頁照放 Vercel、靜態數據過渡期照放 GitHub；實時部分有輪詢後備 |

## 7. 未決定 / 要問

- VPS 供應商（香港；新加坡都得，延遲約 30–40 毫秒）
- Dokploy 架好未
- 網址：tracker 用咩子網域
- 帳戶要唔要電郵連結以外再加電話號碼登入（SMS 要錢）
- 網頁最終留 Vercel 定搬上 Dokploy（建議留 Vercel）
- 預熱名單：要唔要常駐 poll 熱門線，幾多條
- 用 Redis 定 Valkey（功能一樣；建議 Valkey，完全開源授權）
