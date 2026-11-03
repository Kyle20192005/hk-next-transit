# CLAUDE.md

香港公共交通實時到站 App。目前做城巴、九巴（連龍運）同聯營線，網頁版（Next.js）同 App（Expo）共用同一套核心邏輯。
App 暫時只更新到城巴（用舊嘅 `/api/ctb`），未有九巴同新版介面。

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

網頁版本地開發讀 `pipeline/out/`，所以要先跑 pipeline。上線時用 `DATA_BASE_URL` 指去數據位置。
私人 repo 再加 `DATA_TOKEN`：raw.githubusercontent 網址會自動改用 GitHub Contents API。
數據讀唔到時開 `/api/health` 睇原因。

Vercel（Hobby）只部署 commit 作者係項目擁有者嘅 commit：commit 要用 `kylecom2017@gmail.com`。

完成任何改動前：跑 core 測試同 `pnpm -r typecheck`。改 UI 要開 dev server 實際睇過。

## 九巴同聯營線

- 路線檔分 `out/ctb/<路線>.json`（城巴同大部分聯營線）同 `out/kmb/<路線>.json`（九巴、龍運）。網址 `/ctb/101`、`/kmb/1A`。
  城巴 1 號同九巴 1 號係兩條唔同路線，所以要分公司。統一索引 `out/index.json`、`out/stops.json`；
  `out/ctb/index.json`、`out/ctb/stops.json` 保留俾舊 App。
- 九巴走法 = 九巴 `bound` + `service_type`（1 = 正常），直接用九巴站 ID，再配對最似嘅政府走法攞時間表、走線（`pipeline/kmb.py`）。
- **聯營線**：政府 agency 有 `CTB` 同 `KMB`/`LWB`，或者兩邊同號碼而且起訖點一樣（`joint_by_ends`，例如 101R、X1）。
  - 有政府城巴走法：放城巴路線檔，每個站加 `kmb`（九巴站 ID），每個走法加 `kmb: {bound, serviceType}`。
  - 冇（例如賽馬日路線）：放九巴路線檔，每個站加 `ctb`，每個走法加 `ctb: {dir}`；城巴嗰條唔再喺統一索引出。
  - 每間公司嘅 ETA 只有自己嘅車，`etasAtStop`（core `eta.ts`）合併兩邊。**九巴同城巴嘅去程定義可以相反**
    （101：九巴 O = 觀塘→堅尼地城，城巴 O = 相反），所以九巴班次嘅 `dir` 會轉做呢個走法喺呢個站用嘅方向。
  - 城巴「九巴時段」、九巴「城巴時段」係冇時間嘅佔位，要過濾走。
- 九巴「原定班次」= 時間表時間：`Eta.scheduled = true`，介面標「原定」，唔用嚟追蹤巴士位置或者標「距離 N 個站」。
- 九巴站名後面有編號（例如「(WT916)」），pipeline 會拎走。
- 九巴 API 冇分開某啲短途特別班（例如 101 嘅特別班都係 service_type 1），呢啲九巴班次當係正常走法（confidence likely）。

## 數據原則：城巴為主，政府補充

| 資料 | 來源 |
|---|---|
| 站 ID、站名、座標、實時到站 | 城巴 API（主體） |
| 走法、特別班標記 | 運輸署 GTFS + JSON_BUS.json（`specialType`） |
| 每個走法嘅時間表 | 運輸署 GTFS（`frequencies.txt`、`calendar*.txt`） |
| 地圖走線 | CSDI「巴士路線」WFS（`FB_ROUTE_LINE`） |
| 站到站行車時間（實測平均） | [hk-bus-time-between-stops](https://github.com/HK-Bus-ETA/hk-bus-time-between-stops)（`timeinterval.hkbuseta.com/times/all.json`），第三方、實驗性質 |

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

**行車時間同巴士位置**（`packages/core/src/tracking.ts`、`journey.ts`，後端 `/api/buses`）：

- 巴士位置用**成條線**每個站嘅 ETA 追蹤（`trackLine`）：由尾站向前，第 k 站嘅 ETA 喺第 k-1 站搵唔到同一架車
  （時間差 ≈ 嗰段行車時間），而且「ETA - 嗰段時間」唔遲過而家，就係喺 k-1、k 之間。每個站最多 3 班 ETA，
  所以要有後面嗰個條件，否則會將遠嘅車誤判。位置只用嗰一段嘅時間計，唔累積誤差。
- 屬於邊個走法：推斷到係呢個走法，或者推斷唔到但 ETA `seq` 吻合。
- 每段行車時間優先次序：同一架車喺相鄰兩站 ETA 嘅時間差（同 ETA 一致）→ 而家時段實測
  （`times_hourly/<星期 0-6，0=日/假期>/<HH>/<站 ID 頭兩位>.json`）→ 平均（`variant.segSeconds`）。
- 打開一個站：上游嘅車由近到遠順序對應嗰個站嘅 ETA（`labelEtas`），對唔到嘅係「未開出」。
- 地圖上嘅巴士只准向前（`BusStabilizer`）：ETA 推遲會令推算位置後退，所以記住每架車上次位置，後退就停喺原位。
  新舊位置按次序配對（巴士唔會互相超越）。地圖右上角「?」解釋位置係推算、唔係 GPS。
- 距離一律沿走線量（`stopCumMetres`、`busDistanceTo`），唔係直線；顯示用 `formatDistance`（< 1 公里用米），50 米內唔顯示。
- `/api/buses` 每個站嘅城巴 ETA cache 10 秒；前端每 20 秒問一次，位置每 5 秒按時間推前。
- 只用 hk-bus-time-between-stops 公開嘅數據，**唔好抄佢嘅程式碼**（GPL-3.0）。頁面要註明出處同「僅供參考」。

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
- 路線頁按走法顯示（同城巴 App 一致）：走法排序同狀態用 core 嘅 `sortVariants`、`statusText`；
  「現正服務」= 未來 60 分鐘有班次由總站開出，或者有車行緊。站點用 `variantStops`（包埋城巴獨有站）。
- 走法名稱用 `variantLabel`：正常走法叫「正常路線」，括號係走法描述（經／繞／不）先加，目的地唔加。
- 地圖底圖用地政總署 API（`mapapi.geodata.gov.hk`，免費唔使 key），要註明「© 地政總署」。
  網頁用 Leaflet（只喺瀏覽器載入），App 用 react-native-maps 加 `UrlTile`。
- 路線頁版面要緊湊（手機 Safari 底部有浮動工具列）：方向用一行「往 X ⇅」，地圖高度 clamp(150px, 26dvh, 280px)。
  打開站時將站名對齊列表頂部。標題、方向、走法、地圖固定，只有站點列表捲動；走法選擇平時收埋，展開時蓋住地圖。
  站點一次只開一個，打開時地圖放大去嗰個站；撳地圖嘅站會打開列表對應嘅站（web 用 `lib/events.ts` 嘅 window event）。
- 地圖方向箭嘴用 core 嘅 `lineArrows`；web 每次縮放按 px 距離重新篩選，App 只喺 300 米以上嘅段放。
- 首頁：「路線」用巴士號碼鍵盤（`components/home/Keypad.tsx`，只開可以接落去嘅數字同字母，唔彈系統鍵盤；
  「地點」轉做打字搜起訖點），列表無限捲動（每次 40 條），搜尋欄固定。「附近」用定位
  （`/api/nearby` 搵 600 米內嘅站，`/api/stop-etas` 一次攞一個站所有路線嘅下一班；站點索引 `out/ctb/stops.json` 唔包終點站）。
  撳附近嘅路線開 `/ctb/<路線>?dir=&stop=`，路線頁會自動揀經過嗰個站嘅走法同打開嗰個站。
- 路線頁視覺：藍色標題列（‹、路線號碼、往 X、⇅），站點列表係時間線（豎線 + 圓點，特別班用紅色；
  巴士圖示按位置畫喺兩站之間），打開嘅站下一班用大字。
- 主題色黃色（`--brand` 只做底色，上面用 `--on-brand` 深色字）；白底上嘅重點字用 `--accent`（深琥珀）；
  地圖走線、時間線、巴士圖示用 `--route-line`（深橙，因為地圖馬路本身係黃／橙色）。
- 公司標籤（`components/CompanyTag.tsx`、`lib/company.ts`）：巴士圖示 + 公司名，用公司代表色（城巴黃、九巴紅）。
- 時間線豎線畫喺 `li.stop::before`（成個站嘅高度），唔好畫喺按鈕入面，否則行與行之間同打開咗嘅到站時間部分會斷線。
- 新增營辦商：喺 `packages/core/src/` 加 adapter，輸出統一嘅 `Eta` 類型。

## 已知未做

- 賽馬日改路等按事件嘅走法：政府數據冇。
- ETA `seq` 規律只喺 38 號驗證過。
- 新大嶼山巴士、港鐵、小巴、電車、渡輪未做。
- 「附近」：聯營線只列喺城巴站下面（避免同一條線喺相鄰嘅九巴站同城巴站出兩次）。
- App 未喺實機或者模擬器測試過（只確認到 bundle 到）。
