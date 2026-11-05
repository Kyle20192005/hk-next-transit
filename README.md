# 下一程 NextLeg（hk-next-transit）

香港公共交通實時到站：城巴、九巴（連龍運）、聯營線、新大嶼山巴士、港鐵巴士嘅到站時間、巴士位置、特別班次走法、車費同地圖走線。將來加港鐵／輕鐵、小巴、渡輪、電車同導航。提供網頁版（Next.js）同 App（Expo）。

## 數據點樣夾埋

| 資料 | 來源 | 用途 |
|---|---|---|
| 站 ID、站名、座標、實時到站 | 城巴 API | 主體 |
| 有邊幾個走法、邊個係特別班 | 運輸署 GTFS、路線資料 | 補充 |
| 每個走法幾時行 | 運輸署 GTFS 時間表 | 補充 |
| 地圖走線 | CSDI 巴士路線 | 補充 |

城巴 API 每個方向只有一個合併站點列表，ETA 亦唔講係邊個走法。我哋用兩個方法推斷：

1. **ETA 嘅 `seq`**：係嗰班車實際走法入面嘅站序。例如 38 號喺北角碼頭，seq 19 = 不經華富，seq 26 = 經華富。
2. **時間表**：seq 分唔到時（例如總站全部係 seq 1），用「到站時間 − 行車時間」倒推開車時間，再對 GTFS。

政府站點同城巴站點用「同名優先、再睇距離、保持站序」配對，結果分級：

- **A**：同名，60 米內
- **B**：同名，60–500 米（政府座標有偏差，以城巴為準）
- **C**：唔同名，但 60 米內（要人手覆核）
- **X**：配唔到

覆核結果喺 `pipeline/out/report/ctb_stop_map.csv`，人手修正寫入 `pipeline/overrides.json`。

## 結構

```
apps/web        Next.js 網頁版 + 後端 API
apps/mobile     Expo App（iOS / Android）
packages/core   共用 TypeScript：API adapter、走法推斷、時間表
pipeline/       Python 數據處理（只用標準庫）
```

### 後端 API（apps/web）

| API | 內容 | Cache |
|---|---|---|
| `GET /api/eta?company=ctb&route=38&stop=002186` | 實時到站，已推斷走法 | 10 秒 |
| `GET /api/ctb` | 城巴路線列表 | 1 小時 |
| `GET /api/ctb/38` | 路線資料：站點、走法、時間表、走線 | 1 小時 |

## 開發

需要 Node 22、pnpm 10、Python 3.11+。

```bash
pnpm install
python3 pipeline/fetch.py      # 下載原始數據（約 1 分鐘）
python3 pipeline/build.py      # 生成 pipeline/out/
pnpm dev:web                   # http://localhost:3000
pnpm dev:mobile                # Expo，用 Expo Go 掃 QR code
```

用手機實機測試 App：喺 `apps/mobile/.env.local` 設定 `EXPO_PUBLIC_API_BASE=http://<電腦區域網絡 IP>:3000`。

測試：

```bash
pnpm --filter @hknt/core test
pnpm -r typecheck
```

## 數據更新

`.github/workflows/data.yml` 每日香港時間 04:17 下載同生成數據，發佈到 `data` 分支。
上線時網頁版設定 `DATA_BASE_URL` 指向數據位置（例如 `data` 分支嘅 raw 網址，或者之後轉用 CDN）。

## 已知限制

- 賽馬日改路等按事件安排嘅走法，政府數據冇。
- ETA `seq` 規律暫時只喺 38 號驗證過。
- 有少數走線同站數唔夾（`lineAligned: false`），地圖要小心處理。
- 九巴、新大嶼山巴士、港鐵、小巴、電車、渡輪未接駁（`packages/core/src/kmb.ts` 只有雛形）。

## 資料來源

運輸署、城巴有限公司、空間數據共享平台，經 [DATA.GOV.HK](https://data.gov.hk)。
