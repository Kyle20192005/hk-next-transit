# CLAUDE.md

香港公共交通實時到站 App。目前做城巴，網頁版（Next.js）同 App（Expo）共用同一套核心邏輯。

## 結構

```
apps/web        Next.js 16 App Router：網頁版 + 後端 API（/api/*）
apps/mobile     Expo SDK 58 + Expo Router（路由喺 src/app/），只 call apps/web 嘅 API
packages/core   @hknt/core：純 TypeScript，冇 build step（直接 export src/index.ts）
pipeline/       Python 3 數據處理，只用標準庫
```

`packages/core` 要喺瀏覽器、Node 同 React Native 都行得：唔好 import Node 或 DOM 專用嘢。

## 指令

```bash
pnpm install
python3 pipeline/fetch.py --skip-existing   # 下載原始數據去 pipeline/cache/（已有就跳過）
python3 pipeline/build.py                   # 生成 pipeline/out/，約 30 秒
pnpm dev:web                                # http://localhost:3000
pnpm dev:mobile                             # Expo
pnpm --filter @hknt/core test               # vitest
pnpm -r typecheck
```

網頁版本地開發讀 `pipeline/out/`，所以要先跑 pipeline。上線時用 `DATA_BASE_URL` 指去 CDN。

完成任何改動前：跑 core 測試同 `pnpm -r typecheck`。改 UI 要開 dev server 實際睇過。

## 數據原則：城巴為主，政府補充

| 資料 | 來源 |
|---|---|
| 站 ID、站名、座標、實時到站 | 城巴 API（主體） |
| 走法、特別班標記 | 運輸署 GTFS + JSON_BUS.json（`specialType`） |
| 每個走法嘅時間表 | 運輸署 GTFS（`frequencies.txt`、`calendar*.txt`） |
| 地圖走線 | CSDI「巴士路線」WFS（`FB_ROUTE_LINE`） |

App 入面一律用**城巴站 ID**。政府站 ID 只喺 pipeline 內部用。

政府 GTFS route_id、運輸署 routeId、CSDI `ROUTE_ID` 係同一套 ID，可以直接 join。
GTFS trip_id 格式：`<route_id>-<方向>-<service_id>-<開車時間HHMM>`。

## 核心概念

**走法（Variant）**：政府一個 route_id + 方向，例如 38 號有 5 個：
`1000304-1/2`（經華富）、`1540-1/2`（早上不經華富）、`1000305-1`（銅鑼灣→置富）。
城巴 API 每個方向只有**一個合併站點列表**，每個政府走法都係呢個列表嘅子序列。

**站點配對**（`pipeline/build.py` 嘅 `align`）：加權 LCS，保持站序。

- A：同名，60 米內（權重 4）
- B：同名，60–500 米（權重 3）。政府座標有時錯，例如政府「香港仔隧道巴士轉乘站」放咗喺城巴「黃竹坑醫院」嘅位，正確應該配城巴 003969。
- C：唔同名，60 米內（權重 1），要人手覆核
- X：配唔到
- M：人手修正（`pipeline/overrides.json`）

**走法推斷**（`packages/core/src/infer.ts`）：

1. 只有一個走法經過呢個站 → certain
2. 城巴 ETA 嘅 `seq` = 嗰班車**實際走法**入面嘅站序（唔係合併列表嘅站序），城巴獨有站都計。對 `variant.expSeq["<dir>:<stop>"]`，只吻合一個 → certain
3. seq 分唔到（例如總站全部 seq 1）→ 到站時間減 `offsets` 倒推開車時間，對 GTFS 時間表 → likely

## 陷阱

- GTFS 同 JSON_BUS.json 有 UTF-8 BOM，要用 `utf-8-sig` 讀。
- `frequencies.txt` 嘅 `end_time` 要**包埋**最後一班（`<=`），唔係會漏咗特別班尾班。
- GTFS `stop_times.txt` 只有總站時間，中途站係空，所以 `offsets` 按走線長度比例估算。
- 開車時間由午夜起計分鐘，過咗午夜會 >1440（例如 1475 = 翌日 00:35）。計「今日服務時段」只可以用今日嘅 serviceId，唔好混入琴晚過咗午夜嘅班次。
- 循環線（例如 85 號）：政府成個圈一個方向，城巴拆開 O 同 I。pipeline 會將城巴 O+I 駁埋再配對，所以 `variant.stopDirs` 可以同時有 O 同 I。
- CSDI 走線每段 = 第 i 站 → 第 i+1 站。少數走線段數同站數唔夾，`lineAligned: false`，畫地圖時要處理。
- 城巴 API 冇「全部路線站點」endpoint，要逐條線 call；`fetch.py` 用 32 線程，大約 1 分鐘。
- 政府 API 全部有開 CORS，瀏覽器可以直接 call；但我哋經 `apps/web` 嘅 API 行，方便 cache 同修正 API 改動而唔使出新版 App。

## 慣例

- UI 文字用香港繁體中文（廣東話口語可以，例如「冇班次」）。
- 特別班用紅色（`special`），正常走法用藍色（`brand`）。「只限 XX」標示：全部係特別班先用紅色。
- 只喺「有走法行經呢段路但唔停」先標「只限 XX」（見 `passesThrough`）；起點唔同嘅短途特別班唔算。
- 新增營辦商：喺 `packages/core/src/` 加 adapter，輸出統一嘅 `Eta` 類型。

## 已知未做

- 賽馬日改路等按事件嘅走法：政府數據冇。
- ETA `seq` 規律只喺 38 號驗證過。
- 地圖未畫；九巴只有 ETA 雛形；新大嶼山巴士、港鐵、小巴、電車、渡輪未做。
- `shortName`、`passesThrough` 喺 web 同 mobile 各有一份，應該搬入 core。
