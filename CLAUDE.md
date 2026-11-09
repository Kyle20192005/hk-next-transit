# CLAUDE.md

「下一程」（NextLeg）：香港公共交通實時到站 App（名嘅意思：下一班 + 旅程，將來有導航）。目前做城巴、九巴（連龍運）、聯營線、新大嶼山巴士、港鐵巴士、港鐵（重鐵路綫圖 + 到站）同輕鐵（路綫圖 + 到站），網頁版（Next.js）同 App（Expo）共用同一套核心邏輯。
App 同網頁版功能一致（四間公司、分頁、收藏、走法、地圖、時間線、巴士位置、班次表、港鐵路綫圖）。舊 App 用嘅 `/api/ctb` 保留。

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
python3 pipeline/check.py --prev <目錄>      # 發佈前檢查：同上一版 stats.json 比較，大跌就 exit 1
pnpm dev:web                                # http://localhost:3000
pnpm dev:mobile                             # Expo
pnpm --filter @hknt/core test               # vitest
pnpm -r typecheck
```

數據每日香港時間 04:17 由 GitHub Actions（`.github/workflows/data.yml`）自動更新：fetch → build → check → 推去 `data` 分支。
`check.py` 同上一版比較每間公司嘅路線、走法、站、有時間表／走線／車費嘅走法，少咗超過 10%（而且最少 3 個）
或者有結構錯誤就唔發佈，網站繼續用舊數據；真係大量路線取消就人手 Run workflow 剔「強制發佈」（`--force`）。
`data` 分支要有 `apps/web/vercel.json`（`{"ignoreCommand": "exit 0"}`）：Vercel 會將 data 分支當預覽部署，
冇 `apps/web` 目錄就報 Build Failed。人手發佈數據都要加。
網頁版本地開發讀 `pipeline/out/`，所以要先跑 pipeline。
網頁 `lib/data.ts`：Next.js fetch cache 每項最多 2MB，`stops.json`（約 2.6MB）cache 唔到，所以幾個大嘅共用檔（`MEMO_FILES`）
另外留喺記憶體（key 有數據版本），否則 `/api/nearby` 每次重新下載，慢 2–3 秒。上線時用 `DATA_BASE_URL` 指去數據位置。
私人 repo 再加 `DATA_TOKEN`：raw.githubusercontent 網址會自動改用 GitHub Contents API。
數據讀唔到時開 `/api/health` 睇原因。

Vercel（Hobby）只部署 commit 作者係項目擁有者嘅 commit：commit 要用 `kylecom2017@gmail.com`。
Vercel function 放喺香港（`apps/web/vercel.json` 嘅 `regions: ["hkg1"]`）：營辦商 API 全部喺香港，放美國（預設 iad1）每次都要過太平洋，
到站時間慢成一秒。App 嘅路線資料同日曆有快取（`lib/api.ts` 嘅 `cachedRoute`／`freshRoute`／`calendarOnce`），開過嘅路線即刻顯示，背景先更新。

完成任何改動前：跑 core 測試同 `pnpm -r typecheck`。改 UI 要開 dev server 實際睇過。

## 計劃中：實時後端同帳戶

香港 VPS（4GB，Dokploy）跑 tracker + Postgres/PostGIS + Valkey，tracker 自己用 WebSocket 推巴士位置（唔自架 Supabase）；
帳戶（登入、收藏同步）用 Supabase 雲端版（新加坡），唔登入照用得。計劃、數據表、訊息格式、同步規則同階段：**`docs/realtime-backend.md`**。做嘅時候照住佢，改咗設計就更新嗰份文件。
**數據收集同分析**（前端同後端合作提高準確度：記錄 ETA、實際到站、ETA 誤差、行車時間、匿名使用紀錄、乘客回報、上車 GPS；私隱規則）：**`docs/data-analytics.md`**。

已經做咗（2026-11-08，部署步驟 **`deploy/README.md`**）：
- **分工**：前端（網頁、App）只負責顯示同互動，**從來唔直接問巴士公司**。實時巴士數據（巴士位置 `/api/buses`、某站到站時間 `/api/eta`）
  一律先問 **tracker**，出錯先退返 Vercel 同名 API（core `createLiveClient`；網頁 `lib/buses.ts` 嘅 `liveClient`、`NEXT_PUBLIC_TRACKER_URL`；
  App `lib/api.ts`，預設 `https://rt.kyle05.dev`，`EXPO_PUBLIC_TRACKER_URL` 可改、空白 = 唔用）。tracker 1.5 秒未覆就同時問後備、邊個先返用邊個（冷門線第一次計要幾秒）；連唔到或 5xx 先停用 60 秒。
  tracker 有 45 秒內嘅快照就即刻俾（背景照 poll），唔等新一輪計完。
  靜態／非巴士公司數據（路線資料、日曆、`/api/nearby` 搵附近站、交通消息）留 Vercel。
  `/api/stop-etas`（附近）、`/api/here`（喺度搭得、首頁下班車）tracker 都有（低優先，追蹤緊嘅路線先行；一俾人話忙成個請求即刻 503，
  前端改問 Vercel，503 唔當 tracker 死咗），但**暫時前端直接問 Vercel**（core `AREA_ETAS_VIA_TRACKER = false`）：
  首頁一次 8 個站頭、中環一個位置要成 90 個上游請求，`UPSTREAM_RPS=8` 頂唔順。量完上限、調高 `UPSTREAM_RPS` 先開。
  邏輯喺 core `stop-live.ts`（`routesAtStop`、`stopEtas`、`hereRoutes`），Vercel 同 tracker 共用。
- `apps/tracker`：`GET /api/buses`、`/api/eta`（同 Vercel 一樣格式）、`/health`、`/`。有人問先計，背景每 15 秒 poll，3 分鐘冇人問就停；
  上游 fetch 包一層（10 秒 cache、合併同時請求、限流 `UPSTREAM_RPS` 每個伺服器各自計、每間公司統計）；`node dist/probe.js` 量上游上限。
  只問過一次嘅線（多數係撳落路線嘅預先 fetch）45 秒冇人再問就停；冇 poll 又耐冇人問嘅線定時清走。
- 共用定義喺 core `ids.ts`（`Co`、`isCo`、`SAFE_ROUTE`、`SAFE_STOP`、`LIVE_REFRESH` 更新頻率、`dataFileRequest` GitHub 數據網址、
  `parseLiveBuses`）：網頁、App、tracker 唔好再各自抄。
  打開追蹤緊嘅線嘅站，`/api/eta` 直接用 cache，唔會再問巴士公司。計巴士位置用 core `computeBuses`（`live.ts`），Vercel 同 tracker 共用，
  兩邊只係各自載入實測行車時間檔（網頁 `lib/journey.ts`、tracker `src/segments.ts`）。esbuild 連 core 打包，Docker 唔使 node_modules。
- `deploy/pipeline/`：每日 04:17 數據更新容器（取代 GitHub Actions），每次 clone 最新 main；要 `GITHUB_TOKEN`（Contents 讀寫）、`DATA_REPO`。
- 已部署：tracker `https://rt.kyle05.dev`（VPS 嘅 80／443 係 Moodle 嘅 Caddy，HTTPS 由佢 reverse_proxy，Dokploy 唔設 Domain）；
  pipeline 每日 04:17。data.gov.hk 同一個 IP 問得太密會 403（32 條線程、大約每秒 100 個試過俾封）；probe 實測每秒 20 個冇問題，
  實測（2026-11-08，`node dist/probe.js`，四間公司、唔重複網址）：rt.data.gov.hk 每秒 35 個冇事、**40 個即刻 403 封 IP**；
  九巴（data.etabus.gov.hk）15 個冇事、20 個開始超時。設定：tracker `UPSTREAM_RPS_BY_HOST=rt.data.gov.hk=20,data.etabus.gov.hk=10`、
  pipeline `RT_RPS=12`（pipeline 同 tracker 同一個 IP，加埋都要低過 35）。**唔好再試高過 35**。

## 九巴同聯營線

- 路線檔分 `out/ctb/<路線>.json`（城巴同大部分聯營線）同 `out/kmb/<路線>.json`（九巴、龍運）。網址 `/ctb/101`、`/kmb/1A`。
  城巴 1 號同九巴 1 號係兩條唔同路線，所以要分公司。統一索引 `out/index.json`、`out/stops.json`；
  `out/ctb/index.json`、`out/ctb/stops.json` 保留俾舊 App。
- 九巴走法 = 九巴 `bound` + `service_type`（1 = 正常），直接用九巴站 ID，再配對最似嘅政府走法攞時間表、走線（`pipeline/kmb.py`）。
- **聯營線**：政府 agency 有 `CTB` 同 `KMB`/`LWB`，或者兩邊同號碼而且起訖點一樣（`joint_by_ends`，例如 101R、X1）。
  - 有政府城巴走法：放城巴路線檔，每個站加 `kmb`（九巴站 ID），每個走法加 `kmb: {bound, serviceType}`。
    城巴獨有站（政府冇，例如 107 嘅黃竹坑醫院、九龍城–宋皇臺遊樂場）經政府站配唔到，`kmb.fill_ctb_only` 喺前後兩個
    已配對站之間搵 80 米內最近嘅九巴站；唔配嘅話九巴時段（例如夜晚）呢啲站會冇班次。
  - 冇（例如賽馬日路線）：放九巴路線檔，每個站加 `ctb`，每個走法加 `ctb: {dir}`；城巴嗰條唔再喺統一索引出。
  - 每間公司嘅 ETA 只有自己嘅車，`etasAtStop`（core `eta.ts`）合併兩邊。**九巴同城巴嘅去程定義可以相反**
    （101：九巴 O = 觀塘→堅尼地城，城巴 O = 相反），所以九巴班次嘅 `dir` 會轉做呢個走法喺呢個站用嘅方向。
  - 城巴「九巴時段」、九巴「城巴時段」係冇時間嘅佔位，要過濾走。
- 營辦商 API 間中會出錯：`etasAtStopDetailed` 重試一次，再唔得就回傳 `failed`（邊間公司），唔好靜靜雞當佢冇車；
  `/api/eta` 有 `failed` 時唔 cache（no-store），介面顯示「XX資料暫時攞唔到，可能少咗班次」。
- 營辦商實時 ETA 用 `lib/live-fetch.ts`（no-store），**唔好用 Next.js fetch cache**：過期後第一個請求會拎到舊數據。
- 九巴「原定班次」= 時間表時間：`Eta.scheduled = true`，介面標「原定」，唔用嚟追蹤巴士位置或者標「距離 N 個站」。
- 九巴站名後面有編號（例如「(WT916)」），pipeline 會拎走。
- 九巴就算要求唔同 service_type，都可能回傳同一批車（例如 107 嘅 1 同 2），只係改咗 `service_type` 欄，
  所以唔可以靠呢欄分走法；`etasAtStop` 會將同公司、同方向、同到站時間嘅班次去重，保留正常走法。
- 九巴 API 冇分開某啲短途特別班（例如 101 嘅特別班都係 service_type 1），呢啲九巴班次當係正常走法（confidence likely）。

## 港鐵（重鐵）：路綫圖同到站時間

「路線」分頁 →「港鐵・輕鐵」：自己畫嘅路綫圖，左上角切換港鐵／輕鐵（記住上次揀邊個：網頁 sessionStorage、App AsyncStorage `hknt.rail`），
撳站或者搜尋睇到站時間（輕鐵見下面「輕鐵」）。網頁 `components/rail/{RailView,MtrMap,MtrStationSheet,RailSearch}.tsx`，
App `src/components/{RailView,MtrMap,MtrMapSkia,MtrStationSheet}.tsx`（`(tabs)/routes.tsx` 揀港鐵就出地圖，搜尋欄喺標題列；港鐵站、輕鐵站一齊搵，港鐵排先）。
**港鐵、輕鐵共用**：網頁 `useMapView`（拖拉縮放、飛去個站、縮放掣；邊界唔計面板遮住嘅位，地圖邊嘅站都可以移到面板上面正中）、
`useSheetDrag`（拉板）；App `SchematicMap`（Skia 相機、手勢、飛去個站）、`RailSheet`（`useRailSheet` + `SheetGrab`）、`lib/skia-draw.ts`（筆、寫字）。

- **到站面板**（2026-11，參考港鐵 App 嘅資訊排法，用自己嘅樣式）：唔係彈出視窗，唔遮成幅圖。
  手機（< 768px）係**貼底拉板**（有拉柄）：半開（自動高度，最高 `max(58%, min(100% - 120px, 380px))`）顯示站名、綫分頁、下班車；
  拉柄、站名、分頁嗰部分向上拉 = 全開（頂部留 56px 地圖，顯示所有班次表），向下拉關閉。規則（網頁 pointer、App PanResponder 一樣）：
  郁 6px 先當拖（輕撳分頁、關閉照用得）；全開向下掃 → 半開、半開向下掃 → 關閉、向上掃 → 全開、慢慢放 → 近邊個用邊個；
  拉低過半開 70（由全開拉就要低過半開一半）→ 關閉。「所有班次」掣喺「下班車」同一行，手機撳佢 = 全開／半開。每次揀新站都由半開開始。
  闊螢幕（≥ 768px）：右邊 380px 面板，班次表預設展開。地圖剩好矮時縮放掣打橫排，剩一條（< 110px）就收埋。
  面板量自己遮咗幾多（`inset`）俾地圖：撳站只喺俾面板遮住先移；搜尋就放大（最少開頁大細）再置中喺淨低嘅地方；面板啱啱載入完變高（1.5 秒內）先跟住調整，
  之後用戶自己拖開就唔好扯返轉頭。揀咗嘅站有重點色光圈。面板頂按綫分頁（分頁頂有綫色，轉站記住揀咗邊條綫）→「下班車」每個方向一行
  （目的地、綫色月台圈、時間 + 細字「之後 N 分鐘」）→「所有班次」展開成個表（目的地｜月台｜下班車，按方向分組；闊螢幕預設展開）→ 底部「最後更新 HH:MM:SS」同重新整理。
  時間用 core `mtrTrainEta`：API 分鐘數 0 =「正在離開」、1 =「即將到站」，其他 N 分鐘（跟設定可以顯示鐘數）。
- **附近嘅站**（2026-11，用戶要求）：路綫圖用首頁嗰份定位（`useNearbyStops(true)`，有快取），800 米內嘅站加**藍色虛線光圈**（`#2f6fd6`，同定位圖示一樣；
  揀咗嘅站係橙色 accent），冇就標 2 公里內最近一個（core `mtrCardStations(mtr, 800, 3)`）；左上角膠囊「附近：X · N 米」撳去嗰個站；
  第一次知道附近站而又未揀站：唔喺畫面就移過去（focus zoom false，唔變大細）。網頁 `MtrMap` `near` prop（`.mtr-near`），App Skia `DashPathEffect`。
- **車站搜尋**：core `searchMtrStations`（中文、英文唔理大細楷同空格、站代號；「茘」當「荔」；尾「站」拎走）。網頁下拉結果（上下鍵、Enter），App 結果浮喺地圖頂。
- 港鐵間中成條綫冇到站資料（2026-11-09 早上觀塘綫：`curr_time` 係「-」、冇 UP／DOWN），`parseMtrSchedule` 回傳 `noData`，
  寫「港鐵暫時冇提供 XX 嘅到站時間，列車可能照常行駛」，唔好寫「暫時冇班次」。

- 站同綫：core `mtr-data.ts`（港鐵開放數據 `mtr_lines_and_stations.csv` 生成，「茘」→「荔」；馬場 `RAC` CSV 冇，人手加，
  `mtrStationLines('RAC')` = 東鐵綫）、`mtr.ts`（`MTR_LINES` 綫色、`mtrTermini`）。
- 到站：`rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=&sta=`（同巴士 API 同一個 host，計埋 `UPSTREAM_RPS` 上限）。
  core `parseMtrSchedule`：拎走 `valid: N`、`ttnt > 120`（聽日頭班車）、總站空嘅方向；`mtrStationEtas` 一個站問晒所有綫，
  回傳 `{lines, failed}`。網頁 `/api/mtr?sta=`（有 failed 就 no-store）、tracker 都有 `/api/mtr`，前端 `liveClient.mtr`（tracker 優先）。
  同一方向去唔同地方（東鐵羅湖／落馬洲、將軍澳寶琳／康城）逐班列；馬場冇車寫「只喺賽馬日開放」。
- 路綫圖數據 core `mtr-map.ts`，**唔好人手改座標**：
  - `packages/core/tools/mtr-layout.py [csv] --write`：喺 Python 入面定義每條綫嘅轉角同站位，檢查晒先寫入 `MTR_MAP_LINES`／`LABELS`／`LABEL_GAP`／
    `DOUBLE`／`LINKS`／`LEGEND`。檢查：只行橫直 45°；轉彎 45°、90°（兩個 45° 夾短斜綫一律改做一個 90°）或者 135°（迪士尼綫）；
    彎位係圓弧，統一半徑 `R` 0.7（`MTR_MAP_RADIUS`），並排綫一齊轉彎外面嗰條半徑加 `G`（點寫 `(x, y, 半徑)`），同心先會一直貼住；
    段長夠放彎位；站喺直綫部分；轉車站嘅點喺同一條橫、直或者 45° 綫上、相隔 `G`；站名唔撞綫、唔撞站、站名之間最少 0.15；冇嘢入圖例。
  - 之後一定要行 `packages/core/tools/mtr-water.py [快取目錄] --write`：OSM 海岸綫 → 海水格仔 → 用每個站（示意圖 ↔ OSM 真實位置）做
    moving least squares 變形 → 簡化多邊形（`MTR_MAP_WATER`，第一個環係外框，畫嘅時候 `fillRule="evenodd"`）。海岸綫真實座標唔入 repo。
  - 站真實位置（附近港鐵站用）：`packages/core/tools/mtr-coords.py [快取目錄] --write` → core `mtr-geo.ts`（`MTR_STATION_LL`，OSM 站點中位數，同 mtr-water 共用快取；唔好人手改）。
  - 站位置參考真實地理（OSM 站點，市區放大、新界收細），但係自己排：**唔好照抄港鐵官方路綫圖**（版權）；用 OSM 數據所以地圖要註明「© OpenStreetMap 貢獻者」。
- 畫法（網頁 SVG、App react-native-svg 一樣）：綫闊 = 並排距離 `G` 0.18（貼住）；站 = 黑邊白圈（圈心喺綫正中，`MTR_MAP_DOT_R` 0.17）；
  轉車站每條綫一個圈，重疊成「8」字，圈入面綫色短棒（每條長 `G`，相鄰黐埋）；上水、將軍澳係分岔站，雙圈冇短棒
  （主綫用上面個圈，支綫由下面個圈出，`MTR_MAP_DOUBLE`）；香港 ↔ 中環黑色實綫（閘內轉乘）、尖沙咀 ↔ 尖東黑色虛綫（出閘轉乘），`MTR_MAP_LINKS`；
  東鐵綫沙田至大學經馬場一段虛綫（`dashed`）；左上角圖例（`MTR_MAP_LEGEND`）。轉角用 core `mtrLinePathD`（SVG 圓弧），海用 `mtrRoundPathD`。
- **港鐵 ↔ 輕鐵轉乘**（2026-11，用戶要求；屯門、兆康、天水圍、元朗，core `rail-xfer.ts` 嘅 `MTR_LRT_XFER`；洪水橋港鐵站未通車唔計）：
  兩幅圖都係由站拉一條黑色出閘虛綫（三節短虛綫，兩頭貼住站圈；用戶覺得兩節太短、三節長虛綫太長，所以縮短每節：港鐵圖 0.42、輕鐵圖 0.36），駁一個圓形站，再伸出一小段色綫
  （港鐵圖輕鐵金色 `LRT_BRAND`；輕鐵圖屯馬綫色、**冇黑邊**、粗過輕鐵色綫；色綫露出大約一個站圈咁長，長咗唔好睇），
  色綫尾寫「輕鐵」／「屯馬綫」（打橫喺旁邊、打直喺上／下面；兆康上面係麒麟，字擺喺色綫右邊），圖例有說明。
  港鐵圖方向同尺寸 `MTR_MAP_XFER_DIR`、`MTR_MAP_XFER`（`mtrXferLink`），輕鐵圖 `LRT_MAP_STATIONS[].xl`、`xt`，都由排版工具寫入並檢查唔撞綫、唔撞字。
  站面板頂有「轉乘 [輕鐵] ›」／「轉乘 [屯馬綫] ›」（網頁 `components/rail/XferButton.tsx`、App `components/XferButton.tsx`），撳咗轉去另一幅圖嘅同一個站。
- 用戶定落嘅排法（2026-11，改之前問清楚）：荃灣綫荔景之後向北；屯馬綫南昌、美孚直上、喺荃灣綫上面轉西去荃灣西；東涌綫、機場快綫南昌北面
  90° 轉西貼住荃灣綫底經荔景，青衣喺西南斜綫上（轉車站打斜），之後扭一扭交換位置、貼住經欣澳，過咗小蠔灣先分開（機場喺東涌北面）；
  迪士尼綫先貼住東涌綫向東北再屈落；香港站喺中環正上方、上下排；紅磡東鐵、屯馬一齊向東北斜（屯馬東南邊），何文田屯馬喺觀塘綫上面水平並排。
- 手勢：網頁 viewBox 平移縮放（pointer、兩指、滑鼠轆）；App `PanResponder`（最新狀態放 `useLayoutEffect` 更新嘅 ref，Skia `Canvas pointerEvents="none"`，
  觸點用 `locationX`），一隻手指拖、兩隻手指縮放、輕撳搵站圈範圍。
  **App 地圖用 Skia**（`MtrMapSkia.tsx`；`@shopify/react-native-skia` + `react-native-reanimated`，Expo Go 有）：成幅圖記錄一次做 `SkPicture`（每個主題一份，
  模組層級 cache，成個 App 開住只錄一次，約 0.1–0.3 秒），拖、縮放、飛去個站、縮放掣只改 `Group transform`（shared value `sc`／`ox`／`oy`，
  畫面 = 地圖座標 × sc + o），GPU 每格重播份記錄，唔使重新排版、唔使 React 重畫；向量，放幾大都清楚。**唔好返轉頭用 react-native-svg 逐格改 viewBox**
  （手機每次要重畫成幅圖，好卡；用 transform 郁已畫好嘅圖、放手先重畫都仲會頓）。站名用 Skia Paragraph（系統字 + 自動後備字型，`locale: 'zh-HK'`），
  以 100 倍大小排版再縮返（`TS`），底色描邊先畫一次再畫字。手勢照用 PanResponder（JS 只計三個數）。
  Expo 網頁預覽（`MtrMap.web.tsx`）：`WithSkiaWeb` 由 jsDelivr 載入 CanvasKit 同 Noto Sans TC（CanvasKit 冇系統字），只係開發測試用。

## 輕鐵：路綫圖同到站時間

「路線」分頁 →「港鐵・輕鐵」→ 左上角揀輕鐵。網頁 `components/rail/{LrtMap,LrtStationSheet}.tsx`，App `src/components/{LrtMap,LrtMapSkia,LrtStationSheet}.tsx`；
首頁、收藏打開輕鐵站：網頁 Home `openMtr(sta, true)`，App `lib/open-mtr.ts` 嘅 `openLrt`（`/routes?mode=rail&lrt=1&sta=&n=`）。

- 數據：core `lrt-data.ts`（`tools/lrt-data.py`，港鐵開放數據 light_rail_routes_and_stops.csv；同一個站連續兩次只留一次）、`lrt-geo.ts`
  （`tools/lrt-coords.py`，OSM 站點，附近輕鐵站用）、`lrt.ts`（官方路線色 `LRT_ROUTES`、`parseLrtSchedule`、`lrtStationEtas`、`searchLrtStops`、
  `nearestLrtStops`、`lrtTrainEta`：Departing「正在離開」、Arriving「即將到站」、「-」→「—」；`lrtCars` 單卡／孖卡）。
- 到站：`rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=`（同巴士 API 同一個 host，計埋上限）。網頁 `/api/lrt?sta=`、tracker `/api/lrt`、
  前端 `liveClient.lrt`（App `api.lrt`）。tracker 未部署到 `/api/lrt` 會 404，前端自動改問 Vercel。
- 站面板：經過嘅路線號碼、每個月台嘅班次（號碼、往邊、單／孖卡圖示、時間），30 秒更新；拉板同港鐵面板共用。
  路線號碼右邊「月台｜路線」切換（2026-11 用戶要求）：按路線 = core `lrtByRoute`，每條路線、每個目的地一組，每班寫「N 號月台」；
  揀咗記入設定 `Prefs.lrtGroup`（設定頁「輕鐵到站顯示」都改得）。
  單／孖卡用自己畫嘅輕鐵車卡圖示（集電弓、斜車頭、車窗、車門、車轆；孖卡兩卡加連接器，唔抄官方圖示），
  網頁 `components/rail/LrtCars.tsx`、App `components/LrtCars.tsx` 同一套路徑，固定孖卡咁闊、單卡靠右，時間欄先對齊。
- 車費：`/api/lrt/fare?from=`（`apps/web/lib/lrt-fares.json`，`tools/lrt-fares.py` 由港鐵開放數據 light_rail_fares.csv 生成，加價後重跑）。
  **介面先隱藏**（2026-11 用戶要求，`LrtStationSheet` 嘅 `SHOW_FARES`）。收費區地圖唔畫。
- 路綫圖：core `lrt-map.ts` 由 `packages/core/tools/lrt-layout.py --write` 生成（`--svg 預覽.svg` 出預覽、印出檢查結果），**唔好人手改**。
  網頁 SVG、App Skia（錄一次 SkPicture）用同一份：色綫（SVG path，轉角已係圓弧）、箭咀、站、號碼、站名、圖例。
  用戶定落嘅畫法（2026-11，改之前問清楚；唔好照抄港鐵官方輕鐵路綫圖，版權）：
  - 打橫、唔跟地理位置：屯門（左）、天水圍環綫（中上，打橫長方形）、元朗綫（右下）排喺同一條橫帶。屯門部分喺「設計方向」排好再轉 90°（`rot`），
    幹綫、天水圍、元朗綫喺打橫之後另外排。
  - 每段路軌行經嘅路線各一條色綫並排，每條有黑色綑邊、綫同綫之間有黑綫（先畫晒黑邊，再畫窄啲嘅色綫）。
  - 站有軸：出入站沿軸、直行一段先轉彎；彎位統一半徑（並排一齊轉就同心）；同一邊出站幾段先並排，轉得急嘅喺內圈。
  - 過站之後同一條路線喺返同一行（逐站試晒每段路軌放邊個位，`side_layouts`）。避唔到嘅交叉：分出去嗰條出站後彎出去跨過其他綫
    （畫喺上面，有自己黑邊）；同一條路線分岔共用一個位；一束可以留空位俾另一條插入（直路軌兩頭空位一致）；幹綫 751 喺鍾屋村—洪水橋之間打斜跨過（`TWIST`）。
  - 505 經山景／經鳴琴：石排—鳴琴旁邊一個細圈，喺石排南面同建安前面併返一條（匯合點 `J505N`、`J505S`，唔係站）。
  - 轉乘港鐵（屯門、兆康、天水圍、元朗）：由站（連號碼）向 `XFER_DIR` 拉出閘虛綫 → 圓形站 → 屯馬綫色綫（見港鐵一節「港鐵 ↔ 輕鐵轉乘」）。
  - 兩條或以上色綫經過嘅站係膠囊（白底黑邊）；只得一條嘅係圓點。單方向色綫有白色箭咀。
  - 終點站號碼（`CAPS`）：一律同條綫對正中，喺度完嘅綫入站前散開。盡頭站（元朗、屯門碼頭）號碼排一行／兩行，白色膠囊喺後面沿號碼方向拉長；
    兆康、天逸（`PILL_COVERS_CAPS`）、天水圍站膠囊拉長包埋號碼；田景號碼蓋喺站；三聖、友愛係圓點，號碼蓋喺上面；天水圍 705／706 兩邊散開穿過自己個號碼。
- 未做：輕鐵收藏、首頁大卡（附近輕鐵站）、最近睇過。

## 新大嶼山巴士（NLB）同港鐵巴士（MTRB）

`pipeline/others.py`（由 `build.py` 呼叫），路線檔 `out/nlb/<路線>.json`、`out/mtrb/<路線>.json`，網址 `/nlb/11`、`/mtrb/K76`。
用營辦商自己嘅站 ID，再配對政府走法攞時間表、走線。公司色：新大嶼山 #1B8F4C、港鐵巴士 #9E1B32（白字）。

- NLB：每個 `routeId` 係一個方向，但站點列表會合埋幾個政府走法（例如 11 號經／唔經懲教所、北大嶼山醫院），
  所以好似城巴咁拆：每個政府走法配去最似嘅 routeId（政府站 ≥ 80% 配到），一個 routeId 有幾個就拆做幾個走法
  （id `<routeId>-<政府 route_id>`，`nlb: {routeId, via}`）。站點一樣嘅政府走法（例如上課日／非上課日）併埋。
  名用 NLB 自己嘅（方向啱）再加政府括號。車費喺 NLB 站點列表。
- NLB ETA：每個 routeId 只 call 一次，用備註「經: …」（`routeVariantName`）對走法（`pickNlbVariant`），
  對唔到當正常路線（likely）。時間係香港時間，冇時區。
- NLB 每班車有 `noGPS`、`departed`：`noGPS = 0` 按巴士 GPS 計（未開出都可以係 0，即係車喺總站），
  `noGPS = 1` 只係時間表時間（相鄰站之間會自相矛盾，例如下游早過上游），同一條線兩種會混埋。
  `Eta.noGps` 嘅唔用嚟追蹤；`scheduled`（「原定」）= 冇 GPS 又未開出。
  `/api/buses` 對 NLB：有 GPS 嘅用 `trackLine`，再用 core `scheduleBuses`（政府時間表 + 平均 `segSeconds`）補返
  冇 GPS 嘅車，`mergeScheduleBuses` 剔走同實時車位置相差 5 分鐘內嘅班次；時間表車標 `schedule`，地圖同時間線半透明。
- MTRB：`getSchedule`（POST，`routeName`）一次攞晒成條線，用 `lineRef` 分方向（O = LINE_UP、I = LINE_DOWN）。
  秒數 ≥ 100000（例如 108000）= 冇數據。行緊嘅車有真 GPS（`Eta.gps`），地圖直接用，唔使推算。
  車費、樂悠咭（`FARE_OCTO_JOYU`）用港鐵 CSV。
- 港鐵巴士走線：CSDI 只有接駁巴士（K12–K18），其餘用 OpenStreetMap（`fetch.py` 由 network relation 6482279
  加 K12、K14 嘅 route_master 下載，`others.py` 嘅 `osm_line_for`）。站按次序投影落走線（DP，只准向前），
  有站離走線 > 100 米、或者兩站之間沿線距離 > 直線 3 倍 + 500 米就唔用（OSM 數據 2016–2020，有啲線改咗路），
  返用虛線。`variant.lineSource = 'osm'` 時地圖要加「© OpenStreetMap 貢獻者」（ODbL）。
- 營辦商 ETA 時間一律轉做 `+08:00` ISO（`toHkIso`），唔好出 UTC，否則介面顯示錯鐘數。
- 站點列表每個站最多顯示 5 班。

## 數據原則：城巴為主，政府補充

| 資料 | 來源 |
|---|---|
| 站 ID、站名、座標、實時到站 | 城巴 API（主體） |
| 走法、特別班標記 | 運輸署 GTFS + JSON_BUS.json（`specialType`） |
| 每個走法嘅時間表 | 運輸署 GTFS（`frequencies.txt`、`calendar*.txt`） |
| 地圖走線 | CSDI「巴士路線」WFS（`FB_ROUTE_LINE`）；港鐵巴士用 OpenStreetMap |
| 地圖底圖 | 網頁：OpenFreeMap 向量地圖（OpenStreetMap 數據）；App：iPhone Apple 地圖、Android Google 地圖 |
| 地區名（首頁大字） | OpenStreetMap place 節點（Overpass，`fetch.py` 嘅 `fetch_osm_places`，幾個鏡像輪流試；全部失敗用 `pipeline/places_seed.json`）→ `places.py` 篩走深圳（離巴士站 > 800 米、簡體字、「社區」）→ `out/places.json` |
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

## 版本號

大.中.細（由 0.0.1 開始）：細更新（修正、細改動）、中更新（新功能）、大更新（大改版）。用 `pnpm release:patch|minor|major "內容"`
（`scripts/version.mjs`）：自動計下一個版本號，更新 core `version.ts`（`APP_VERSION`，設定頁顯示）、各 package.json、
`apps/mobile/app.json`（version；iOS buildNumber、Android versionCode 每次 +1），同埋 `CHANGELOG.md`。每次推上 main 嘅改動都要揀一個。
改完（測試、typecheck、睇過介面）直接出版本推上 main，**唔使先開分支俾用戶睇預覽**（2026-11-09 用戶要求）。

## 陷阱

- GTFS 同 JSON_BUS.json 有 UTF-8 BOM，要用 `utf-8-sig` 讀。
- `frequencies.txt` 嘅 `end_time` 要**包埋**最後一班（`<=`），唔係會漏咗特別班尾班。
- GTFS `stop_times.txt` 只有總站時間，中途站係空，所以 `offsets` 按走線長度比例估算。
- 開車時間由午夜起計分鐘，過咗午夜會 >1440（例如 1475 = 翌日 00:35）。計「今日服務時段」只可以用今日嘅 serviceId，唔好混入琴晚過咗午夜嘅班次。
- 循環線（例如 85 號）：政府成個圈一個方向，城巴拆開 O 同 I。pipeline 會將城巴 O+I 駁埋再配對，所以 `variant.stopDirs` 可以同時有 O 同 I。
  城巴 O 列表尾同 I 列表頭可以重疊（例如 78 嘅華貴邨至田灣商場兩邊都有，`loop_overlap`）：到站時間將重疊段當 I，
  站序接住 O 數（華貴邨 I seq 11），所以駁埋時重疊段用 I，循環走法嘅 I 站 expSeq 加 `len(O) - 重疊數`。
  （已用 78、11、12、25、48、22D、1M 驗證；冇重疊嘅循環線例如 85 未驗證，維持原狀。）
- hk-bus-time-between-stops 實測有異常（例如 682B 189 米要 43 分鐘，混咗總站等車）：`segment_times` 唔用超過 10 分鐘
  而車速 < 1.5 米/秒嘅實測；每段最少 5 秒（兩站同一位置會計出 0，前端除 0 = NaN）。
- 城巴 API 會列冇站嘅季節性路線（例如 9C 歌連臣角、H0）：唔放入路線列表。新巴車費 "0.0" = 冇資料。
- CSDI 走線每段 = 第 i 站 → 第 i+1 站。少數走線段數同站數唔夾，`lineAligned: false`，畫地圖時要處理。
- 城巴 API 冇「全部路線站點」endpoint，要逐條線 call；`fetch.py` 用 32 線程，大約 1 分鐘。
- 政府 API 全部有開 CORS，瀏覽器可以直接 call；但我哋經 `apps/web` 嘅 API 行，方便 cache 同修正 API 改動而唔使出新版 App。

## 慣例

- UI 文字用香港繁體中文（廣東話口語可以，例如「冇班次」）。
- 視覺（2026-11 改版）：保留黃色標題列（`.app-bar`、`.route-bar`，底部圓角），其他用卡片（圓角 14–18、柔和陰影）、
  統一 SVG 圖示（`components/Icon.tsx`），**唔好用 emoji 或者文字符號做圖示**（⇅、⌫、🕒 喺唔同系統大細唔同）。
  顏色、圓角、陰影全部用 `globals.css` 嘅 CSS 變數，深色模式只改變數。
  字體：一律用系統字（iPhone／Mac = SF Pro + 蘋方-港 PingFang HK，`<html lang="zh-HK">` 令漢字用香港字形）；
  網頁 body 嘅 font-family 係唯一定義，`button, input, select, textarea` 一律 `font: inherit`，唔好另外指定字體；App 唔設 fontFamily（用系統字）。
- 底部分頁列（網頁 `components/home/Home.tsx`、App `src/app/(tabs)/_layout.tsx`）：**首頁／路線／導航／收藏／設定**，預設首頁，
  記住上次分頁（網頁 sessionStorage）；闊螢幕分頁列移去頂部黃色區，變成一條頂部欄：左邊品牌（`.tab-brand`，logo 下一程 NextLeg）、
  右邊分頁，對齊 1100px；闊螢幕各分頁自己嘅品牌標題行（`.app-title:has(> .logo)`）同首頁 header 頂部一行（`.hh-bar`）收埋，唔好重複。
  - **首頁**（網頁 `HomeTab.tsx`、App `(tabs)/index.tsx`，參考港鐵 App）由上至下：
    黃色區大字顯示**地區名**＋英文（似港鐵「青衣 Tsing Yi」，`/api/nearby` 回傳 `area`，core `pickArea`：大區優先，
    quarter 權重 1.4、屋苑 3.5，村名只喺 1.2 公里內冇其他地區名先用；冇地區數據就用最近站頭名），
    下面兩行「最近港鐵站：X ●● · N 米」（2 公里內，`/api/nearby` 回傳 `mtr`，core `nearestMtrStations`，唔計馬場；綫色圓點；撳入路綫圖嗰個站）同「最近巴士站：X · N 米」。**頂部一行 + 大字 + 搜尋欄係同一個 component `HomeHeader`**（網頁 `components/home/HomeHeader.tsx`、
    App `src/components/HomeHeader.tsx`），浮喺捲動區上面（網頁放捲動區入面一個高度 0 嘅 sticky 外框，後面 spacer 留位；App 絕對定位 +
    `contentContainerStyle.paddingTop`）。捲上去時黃色底同捲動 1:1 收起（內容黐住佢底，唔會捲入佢下面、唔會留空白黃色），收到剩頂部一行；
    收到頂部一行**上下留一樣嘅位（`PAD` 12px，同 CSS padding-top 一致）**，膠囊同搜尋掣喺 header 正中。**停喺收縮一半會自動捲去收埋或者展開**（跟最後捲動方向，似 iPhone 大標題；網頁 scroll 停 140ms 而且手指離開先捲，只限手機有頂部一行；App 用 onScrollEndDrag／onMomentumScrollEnd + `onRange`）。收縮期間**變形唔淡走**：大字中心移去頂部右邊地區膠囊、縮到膠囊字咁大（最後 10% 先同真膠囊交接）；英文名同最近巴士站跟黃色底收走、早啲淡出；
    搜尋欄中心移去搜尋掣、闊高縮到掣咁大，白色漸變做掣色（黃色 + 8% 黑，實色唔會變啡），圓角按縮放反向補返；節奏頭尾慢中間快。
    位置用 offsetLeft／offsetTop（網頁，子元素唔好 position，否則唔係以 header 計）或 onLayout（App）。網頁 rAF 直接改 style 唔 setState；
    App `Animated` + `useNativeDriver`。電腦版冇頂部一行（分頁列就係 header，`.home.tab-home .tab-bar::after` 圓角底），冇目標位：
    大字同搜尋欄喺頂部碰到邊之前淡出、「想去邊度？」（撳去導航）同右邊「交通消息」燈號
    （附近有未完結消息紅點，否則綠點）；**常用工具**（core `TOOLS`，分「交通工具」（巴士、港鐵、小巴、電車、渡輪，撳入「路線」分頁揀好嗰款，未做標「即將推出」）同「實用功能」兩組；
    揀最多 4 個，記喺 localStorage／AsyncStorage `hknt.tools`；圖示直接放白卡上（唔好再包淺色方塊），用雙色大圖示（`Icon duo`：線條實色 + 20% 同色填色）；交通消息工具有附近消息數目紅點）。「自訂」入「自訂常用工具」頁（參考港鐵 App：
    網頁 `ToolEditor.tsx`（Home 入面嘅 view）、App `src/app/tools.tsx`）：頂部黃色區揀咗嘅（紅「−」），下面分組全部工具（藍「+」），已揀嘅拖住左右移排位置（core `moveTool`／`dragShift`；網頁 pointer 事件，手指同滑鼠一樣，鍵盤左右箭嘴；App 用 PanResponder，橫向移動先算拖），撳「儲存」先生效；
    App 首頁同呢頁共用 `useTools` 嘅同一份狀態；**大卡**（下面加提示條：附近最新一條交通消息）；**交通消息**（全部／附近／港鐵，頭 3 條）；
    最近睇過（`lib/recent.ts`，最多 8 條；巴士路線同港鐵站（`co: 'mtr'`、`route` = 站代號，core `mtrRecent`，路綫圖打開站就記低，撳返開路綫圖）；
    未有記錄都出呢一節，寫「打開巴士路線或者港鐵站就會喺度見到」）。網頁 `.home-feed > *` 要 `flex-shrink: 0`，否則內容長咗大卡會俾壓扁。
    網頁闊螢幕：內容限 1100px 置中（設定頁 720px）；頂部欄由分頁列做（`.hh-bar` 收埋）；到站卡有左右箭嘴（只限有滑鼠）、圓點撳得；≥ 1024px 兩條獨立直欄（`.home-col-main` 大卡 + 最近睇過、`.home-col-side` 常用工具 + 交通消息），
    手機 `.home-col { display: contents }` 再用 `order` 排返「工具、大卡、消息、最近」。到站卡每張最闊 440px，闊螢幕一次見幾張。
  - **交通消息**（`/api/news`）：運輸署特別交通消息（`resource.data.one.gov.hk/td/tc/specialtrafficnews.xml`）+ 事故消息
    （`td.gov.hk/tc/special_news/trafficnews.xml`，有完結狀態）。冇座標，「附近」= 內文提到用戶 1.5 公里內巴士站名嘅路名／地方名
    （core `placeTokens`、`mentionsAny`）。文字要 NFKC（運輸署用康熙部首字）。全頁：網頁 `components/home/News.tsx`（Home 入面嘅 view）、
    App `src/app/news.tsx`（stack，`?lat&lng`）。
  - **大卡**（網頁 `components/home/NextCard.tsx`、App `components/NextCard.tsx`，似港鐵 App「下班車」小工具）：頂部文件夾式兩個分頁
    「下班車」（附近，一開就自動定位）同「收藏」（記住揀咗邊個），中間斜邊似港鐵 App（背景一個 SVG 斜邊，揀右邊時 scaleX(-1) 反轉）。入面一行站名跟住而家睇緊嗰張卡，右邊「更多／全部」；
    下面打橫掃嘅到站卡（左右兩邊色條 = 第一班嘅公司色），每張最多 4 行「標籤、往邊、分鐘」，下面圓點指示。
    下班車：一張卡 = 一個站頭（core `groupStopHeads` 將 40 米內各公司嘅站併埋），每條線一班、最快 4 班（`busDepartureRows`，`/api/here`）。
    最近 8 個站頭一齊載入，**冇班次嘅唔出卡**；全部載入完先出（逐張加會推走畫面，唔再係第一張），出咗嘅卡之後冇車都保留，唔好跳位。
    收藏：一個收藏咗嘅站一張卡（`groupFavorites`），淨係收藏路線嘅一張「收藏路線」放最後（冇時間，撳入去）；`favDepartureRows`。
    卡掃到先載入，每 30 秒更新。結構通用（core `DepartureRow`，有月台欄）。**港鐵站卡**：800 米內最多 2 個港鐵站，冇就出 2 公里內最近嗰個（core `mtrCardStations`，例如青衣南去青衣站 1.9 公里）（`/api/mtr`，core `mtrDepartureRows`：
    每條綫每個方向下一班，按時間排、最多 4 行；標籤用綫色同簡稱 `mtrLineShort`（機場快綫叫「機鐵」）、月台圈、0／1 分鐘寫「正在離開」「即將到站」），
    撳行或者「更多」開路綫圖嗰個站（網頁 Home `openMtr` → 路線分頁揀港鐵 + `railPick`；App `lib/open-mtr.ts` → `/routes?mode=rail&sta=&n=`）。
  - **附近車站唔係分頁**：由首頁「附近 › 更多」或者巴士路線頁頂「附近巴士站」捷徑入，有返回掣（網頁 Home 入面嘅 view，App `src/app/nearby.tsx` stack）。
    定位邏輯 `useNearbyStops`（網頁 `components/home/Nearby.tsx`、App `components/Nearby.tsx`）。
    **唔好每次都等定位**（core `nearby-cache.ts`）：上次結果記喺 localStorage／AsyncStorage `hknt.nearby.v1`，1 分鐘內直接用、
    15 分鐘內即刻顯示再背景靜靜雞更新（App 背景唔彈權限）；定位分兩步：先快（網頁 `enableHighAccuracy: false`、App `getLastKnownPositionAsync`），
    再準（GPS），同顯示緊／問緊嘅位置相差 40 米內就唔再問 `/api/nearby`。
  - 收藏（`lib/favorites.ts`，localStorage，try/catch）：路線頁標題列星號收藏路線（某方向），打開站撳「收藏呢個站」；
    港鐵同巴士一樣係「綫 + 站」：路綫圖面板撳星號收藏**而家睇緊嗰條綫**喺呢個站（`mtrFavorite(sta, line)`：`co: 'mtr'`、`route` = 綫代號、`stopId` = 站代號；`isMtrFav`）；
    0.18.0 收藏咗成個站嘅（`route` 空白）照用，顯示所有綫。收藏頁 `MtrFavItem`、大卡 `MtrFavCard` 顯示收藏咗嘅綫兩個方向下一班（`mtrDepartureRows` 嘅 `only`），撳入路綫圖；
    **收藏頁按路線分組**（core `groupFavsByRoute`：巴士公司 + 路線號碼、港鐵綫一張卡，卡頂路線號碼同公司（撳入路線）或者綫色 + 綫名，
    下面每行一個收藏咗嘅站：站名、往邊、下一班，或者「成條路線」；網頁 `FavRouteCard`、App `components/FavItem.tsx` 嘅 `FavRouteCard`）。首頁大卡「收藏」照舊一個站一張卡；
    收藏頁同首頁直接顯示收藏咗嘅站嘅下一班（`/api/eta`，同方向；App `components/FavItem.tsx`）。
  - **收藏分組**（core `fav-groups.ts`，`hknt.favGroups.v1`；網頁 `lib/fav-groups.ts`、App `src/lib/fav-groups.ts`）：例如「返工」「返屋企」，
    最多 8 組，每組可以設時段（`FAV_GROUP_WINDOWS`，深夜跨午夜）；收藏記 `group`（冇 = 未分組，刪組變返未分組，收藏唔刪）。
    收藏頁頂一行分組（全部 + 各組，而家時段嘅組有綠點，預設揀佢如果有收藏）、每個收藏下面揀組（網頁 select、App 彈出面板）、
    「＋ 分組」／「改名／時段」開編輯面板（建議名、時段、刪除）。首頁大卡收藏分頁用 `favsForNow`：而家時段嘅組排先，卡頂標組名。
- **設定**（網頁 `components/home/Settings.tsx`、App `src/app/(tabs)/settings.tsx`）：**每項都要真係有作用**，唔好加擺樣嘅設定。
  core `prefs.ts` 嘅 `Prefs`（`cleanPrefs` 清走唔認得嘅值），網頁 `lib/prefs.ts`（localStorage `hknt.prefs`）、App `src/lib/prefs.ts`（AsyncStorage，同格式）；
  `usePrefs()` 即時更新，effect／callback 入面用 `getPrefs()`（網頁 hydration 時 usePrefs 先俾預設值）。
  - 深色模式（跟系統／淺色／深色）：網頁寫 `<html data-theme>`（layout 嘅 `THEME_SCRIPT` 載入前先寫，唔閃；CSS 深色變數同時跟
    `prefers-color-scheme` + `:root:not([data-theme="light"])` 同 `:root[data-theme="dark"]`，地圖用 `useDark()`）；App 用 `Appearance.setColorScheme`。
  - 交通工具優先（巴士／港鐵）：「路線」分頁預設同分類次序（`orderedModes`）；首頁大字兩行（最近港鐵站／巴士站）同大卡「下班車」嘅卡次序（core `orderNearCards`：
    港鐵 → 港鐵站卡排先；巴士 → 巴士站卡排先，港鐵站卡跟後，但一定會出）。
  - 到站時間顯示（分鐘／鐘數）：core `etaParts`、`etaRest`、`minutesLabel(at, now, fmt)`；一行內嘅用 `EtaInline`（兩邊都有），站點列表 `StopRow` 大細字對調。
  - 輕鐵到站顯示（按月台／按路線，`lrtGroup`，輕鐵站面板頂都切換得）。
  - 附近車站範圍（300／600／1000 米，`/api/nearby?r=`，最多 1000）；自動定位開關（首頁、附近、路線頁）；首頁大卡預設分頁（上次／下班車／收藏）。
  - 資料：重設常用工具、清除最近睇過、清除所有收藏（要確認）。
- 地圖走線、時間線、巴士圖示用公司代表色（城巴 #FFD800、九巴 #D01A1E，`lib/company.ts`）；地圖走線底加深色外框，
  因為黃色喺地圖馬路上唔顯眼。聯營線：走線用路線檔嘅公司，每架巴士用自己公司嘅顏色。特別班只用標籤區分。
- 路線列表：雙向路線列出兩個目的地，各自撳入 `?dir=O|I`（唔好要用戶入咗頁先轉方向）。「只限 XX」標示：全部係特別班先用紅色。
- 路線頁按走法顯示（同城巴 App 一致）：走法排序同狀態用 core 嘅 `sortVariants`、`statusText`；
  「現正服務」= 未來 60 分鐘有班次由總站開出，或者有車行緊。路上嘅車全部已開出、下一班要隔 3 個鐘以上（或者今日冇）→「尾班車已開出」（`lastRunning`，同 running 一樣排先、綠色）。站點用 `variantStops`（包埋城巴獨有站）。
- 走法名稱用 `variantLabel`：正常走法叫「正常路線」，括號係走法描述（經／繞／不）先加，目的地唔加。
- 地圖（2026-11 改版）：網頁用 MapLibre GL（`components/RouteMap.tsx`，只喺瀏覽器載入），底圖用 OpenFreeMap 向量地圖
  （OpenStreetMap 數據，免費、唔使 key）嘅 Positron 風格再自己調色（`lib/map-style.ts`：淺米色底、藍海、綠公園、白色馬路，
  冇黃色馬路唔會撞城巴走線；拎走路牌方格、界線；地名用中文、唔用斜體；深色模式另一套色）。出處由底圖自帶（收埋喺「i」）。
  走線放喺地名下面（`firstSymbolLayer`），方向用沿線擺放嘅細 V 形（symbol-placement line），站點係 circle 圖層，
  打開咗嘅站公司色大點 + 站名膠囊（公司色站號）；巴士係 HTML Marker。觸控機唔顯示 +／− 掣，唔准旋轉。
  App 用 react-native-maps（`src/components/RouteMap.tsx`，Expo Go 都用得）：iPhone 用 Apple 地圖（`mutedStandard` 淡色，唔可以調色），
  Android 用 Google 地圖（core `googleMapStyle`，同網頁同一套調色板 `MAP_PALETTE`）。走線、V 形箭嘴（core `lineArrows`，300 米以上嘅段）、
  站點、站名膠囊、巴士樣式同網頁一致。Android 正式版要喺 `app.json` 加 `android.config.googleMaps.apiKey`（未加；Expo Go 唔使）。
  自訂 View 嘅 Marker 頭 0.6 秒 `tracksViewChanges`，之後停（Android 太早停會出空白）。
- 路線頁版面要緊湊（手機 Safari 底部有浮動工具列）：方向用一行「往 X ⇅」，地圖高度 clamp(150px, 26dvh, 280px)。
  打開站時將站名對齊列表頂部。標題、方向、走法、地圖固定，只有站點列表捲動；走法選擇平時收埋，展開時蓋住地圖。
  站點一次只開一個，打開時地圖放大去嗰個站；撳地圖嘅站會打開列表對應嘅站（web 用 `lib/events.ts` 嘅 window event）。
- 地圖方向箭嘴：網頁由 MapLibre 沿線自動擺放（symbol-placement line）；App 用 core `lineArrows`，只喺 300 米以上嘅段放。
- 路線分頁：用巴士號碼鍵盤（`components/home/Keypad.tsx`，只開可以接落去嘅數字同字母，唔彈系統鍵盤；
  「地點」轉做打字搜地方：起點、終點、號碼撞中嘅排先，之後係**中途站經過**嘅路線——站點索引太大唔落載，停手 0.25 秒問 `/api/stop-search?q=`（core `searchStopRoutes`，伺服器記憶體 cache），core `placeMatches` 合併；經過嘅方向寫「經 XX」（起點就唔寫），撳入去 `?stop=` 直接打開嗰個站），列表無限捲動（每次 40 條），搜尋欄固定。「附近」用定位
  （`/api/nearby` 搵 600 米內嘅站，`/api/stop-etas` 一次攞一個站所有路線嘅下一班；站點索引 `out/ctb/stops.json` 唔包終點站）。
  撳附近嘅路線開 `/ctb/<路線>?dir=&stop=`，路線頁會自動揀經過嗰個站嘅走法同打開嗰個站。
- 路線頁視覺：藍色標題列（‹、路線號碼、往 X、⇅），站點列表係時間線（豎線 + 圓點，特別班用紅色；
  巴士圖示按位置畫喺兩站之間），打開嘅站下一班用大字。
- 主題色黃色（`--brand` 只做底色，上面用 `--on-brand` 深色字）；白底上嘅重點字用 `--accent`（深琥珀）；
  地圖走線、時間線、巴士圖示用 `--route-line`（深橙，因為地圖馬路本身係黃／橙色）。
- 公司標籤（`components/CompanyTag.tsx`、`lib/company.ts`）：巴士圖示 + 公司名，用公司代表色（城巴黃、九巴紅）。
- 路線頁開頁自動定位（第一次瀏覽器會問一次），搵呢個走法 500 米內最近嘅站（唔計終點站），打開佢同標「最近 · N 米」；
  列表頂固定一行顯示結果同「重新定位」（喺捲動區 `.stops-scroll` 外面；唔好用 sticky，iPhone 頂部拉落會跟住彈）。用戶拒絕過（permission denied）就唔再問。由「附近」撳入嚟（`?stop=`）就照開指定嘅站。
- 「喺度搭得」：打開站之後到站時間下面嘅動作列（同「收藏呢個站」一齊），撳開右邊 drawer（網頁 `components/HereDrawer.tsx`）／
  下面彈上嘅面板（App `components/HereSheet.tsx`）。`/api/here?lat&lng` 搵 40 米內**所有公司**嘅站（城巴、九巴同一個站頭
  通常係兩個站 ID），合併路線同下一兩班（同一條線同方向只留最近嘅站），按下一班排；而家睇緊嘅線固定排第一。
  撳一行入嗰條線並打開同一個站（`?stop=`）。邏輯同 `/api/stop-etas` 共用 `lib/stop-routes.ts`。
- 預先 fetch（網頁 `lib/prefetch.ts`、App `src/lib/prefetch.ts`）：撳落路線（未放手）`warmRoute` 預熱
  `/api/buses`（伺服器 cache 10 秒），候選 ≤ 3 條停 0.4 秒 `preloadRoute` 只攞路線資料。預設方向同走法一律用 core
  `defaultDir`／`pickVariant`（路線頁、預熱共用），否則預熱網址同路線頁唔同，cache 唔會命中。
- **尾班車提示**（打開站之後，到站時間下面）：core `lastBusAt`（呢個方向所有經過呢個站嘅走法，**包埋特別班**、政府時間表 + `offsets` 估算到站；城巴獨有站用 `minutesToStop` 按 `expSeq` 前後政府站插值；
  **唔按日曆日切**：琴日、今日、聽日嘅到站時間排成一行，兩班相隔 ≥ 3 個鐘（`LAST_BUS_GAP_MS`）= 收車，尾班 = 收車前最後一班；通宵線例如 970X（00:40–01:30 每 25 分鐘、05:30 再開）00:25 嘅尾班係 01:30 嗰班；全日有車 → 冇提示）、`lastBusText`：「尾班約 23:45」、30 分鐘內「· 仲有 N 分鐘」（紅色）、
  過咗而且冇班次「尾班車已經開走 · 下一班約（聽日）06:10」（取代「暫時冇班次」；仲有實時班次就唔講冇車）。冇時間表嘅走法唔計，全部冇就唔顯示。
  **邊班係尾班**（core `lastBusEtaIndex`）：最遲嗰班實時班次同時間表尾班相差 15 分鐘內、而且近尾班多過近前一班（`LastBus.prev`）就標「尾班」，
  提示行改用實時時間「尾班車 00:00 · 仲有 24 分鐘」（唔再寫「約」）；嗰間公司已經俾足 3 班（後面可能仲有車未列出）要 2 分鐘內先算。
  時間表到中途站係按走線長度估，夜晚車快會遲成十幾分鐘（107 香港仔隧道：估 00:45、實際 00:28），所以先用 core `adjustLastBus`
  按實測行車時間（`live.segSeconds` 總站去到呢個站）縮放；邊班係尾班由路線頁計（`lastEtaIndex` 傳落 StopRow）：**追蹤緊嘅尾班車就係嚟緊呢個站嗰架就用佢**，否則先按時間認。
  認到又對到架車（`labelEtas`）就記住佢嘅穩定 id（`BusStabilizer`），**地圖同時間線嗰架巴士標「尾班」**，閂咗個站都繼續標，直至行完全程
  （網頁 `StopList` → `publishBuses({ lastBus })` → `RouteMap`；App 路線頁 `lastStableId`）。
  過咗寫「尾班車已經開走 · 下一班約 06:00」（唔講「今日」，凌晨會混淆；繁忙時間線日間收車段都會咁寫）。
  網頁 page.tsx 喺伺服器計好傳落 `StopList`／`StopRow`（`lastBus`）；App 路線頁即場計。終點站唔顯示。
- **路線頁小功能**（2026-11，core `route-extras.ts`，網頁 `StopList`／`StopRow`、App 路線頁／`StopRow` 一樣）：
  - 落車站：打開站之後撳「揀落車站」→ 撳下面一個站；打開咗嘅站顯示 `alightSummary`（約幾點到、幾多個站、距離、車程），落車站標「落車」。
  - 轉方向（⇅）：打開咗站就用 `nearestStopIndex` 搵對面方向 500 米內最近嘅站，轉過去即刻打開（網頁 `SwapLink` + `lib/events` 嘅 `openStopIndex`）。
  - 走法顯示「全程約 N 分」（`routeMinutes`：實測行車時間加埋，冇就用時間表 offsets）。
  - 分享（`shareText`）：網頁 `navigator.share`，冇就複製連結；App `Share.share`（連結用 `API_BASE`）。
  - 到站時間下面「N 秒前更新 · 重新整理」（`updatedAgo`，撳即刻再攞）。
  - 「最近」嗰行右邊搵站（`matchStops`），撳結果打開嗰個站。
  - 冇網絡：頂部提示（網頁 `OfflineBanner` 用 online/offline 事件；App 用 `expo-network` 嘅 `useNetworkState`）。
  - App 震動回饋（`src/lib/haptics.ts`，`expo-haptics`）：收藏、轉方向、揀落車站、重新整理、拖常用工具、儲存；網頁預覽冇。
- 時間線豎線畫喺 `li.stop::before`（成個站嘅高度），唔好畫喺按鈕入面，否則行與行之間同打開咗嘅到站時間部分會斷線。
- 車費：GTFS `fare_attributes` 分段收費（fare_id = route-方向-上車站序-落車站序），上車車費 = 由嗰個站去任何站嘅最高收費；
  pipeline 存做 `variant.fares[站ID]`（冇分段就用 JSON_BUS 嘅 `fullFare`）。站點列表右邊顯示，終點站唔顯示。
- 樂悠咭（`joyYouFare`）：2026-04-03 起「兩蚊兩折」，成人 $10 或以下收 $2（低過 $2 收原價），超過 $10 收兩成、四捨五入至一毫。
  唔適用：機場 A／NA、馬場（…R）、城巴旅遊 H 線、包車／預約（`pipeline/build.py` 嘅 `joyyou_ok`，政府數據冇標記，按號碼同名判斷；
  「新增長途路線」冇清單，判斷唔到）。路線檔 `joyYou: false` 時標題列寫「不設樂悠咭優惠」。
- 詳細班次：標題列「🕒 班次」掣，撳開右邊 drawer（`components/TimetableDrawer.tsx`）。按服務日子分頁（`serviceDaysLabel`，預設今日），
  可以揀走法；時段由開車時間還原（`timetablePeriods`：最少三班相隔一樣先併做「每 N 分鐘」，零散班次逐班列），今日而家嘅時段標「而家」並捲到。服務日用 core `timetableDay`：琴晚過咗午夜嘅班次（≥ 1440）未行完就仲係琴日（00:31 → 1471），`timetableMarker` 標「而家」「下一班」或者「尾班已開出」（尾班開出咗、未行完全程）。
  標題列第二行只用嚟寫「不設樂悠咭優惠」。
- 闊螢幕（≥ 768px，iPad、電腦）：路線頁兩欄（`.route-top` 用 `display: contents`，grid 左邊標題／走法／站點，右邊全高地圖）；
  首頁路線列表兩欄（電腦三欄）。電腦（`hover: hover` + `pointer: fine` + ≥ 1024px）收埋屏幕鍵盤，直接用實體鍵盤打號碼
  （`RouteBrowser` 嘅 keydown，只接受可以接落去嘅字）。手機版面唔變。
- 新增營辦商：喺 `packages/core/src/` 加 adapter，輸出統一嘅 `Eta` 類型。
- App（`apps/mobile`）：結構 `src/app/(tabs)/`（index 路線、nearby、favorites）+ `src/app/[co]/[route].tsx`，邏輯同網頁
  `app/[co]/[route]/page.tsx` + `StopList.tsx` 一致，改一邊要改埋另一邊。設計變數 `src/lib/theme.ts` 同網頁 `globals.css` 一致；
  公司名同代表色喺 core `company.ts` 共用。圖示用 react-native-svg（`components/Icon.tsx`，同網頁同一套路徑）。
  收藏用 AsyncStorage（同網頁一樣格式）。定位用 expo-location。
- Logo（2026-11）：黃底（#FFC72C）深色「路綫圖 N」（NextLeg）：港鐵路綫圖式 45° 斜綫，左下起點站（空心）、右上下一站（白色實心）。原稿 `docs/brand/`（SVG），
  App 圖示、Android adaptive icon、載入畫面（`expo-splash-screen`：淺色黃底深色圖案、深色模式深底黃色圖案）喺 `apps/mobile/assets/`。
  主頁標題「下一程」左邊放細 logo（冇底色版：網頁 `components/Logo.tsx`、App `src/components/Logo.tsx`）。
  品牌一行（logo 24、「下一程」20、NextLeg 13，高 40，黃色區頂留 12）首頁同路線分頁一模一樣：網頁 `.hh-bar` 同 `.app-title:has(> .logo)` 共用 CSS，App 用 `ui.tsx` 嘅 `Brand` + `BRAND_ROW`。網頁分頁圖示 `app/icon.svg`、
  iPhone 主畫面 `app/apple-icon.png`（Next.js 檔案慣例）。
  Expo Go 唔會顯示自訂原生載入畫面，所以 `components/LaunchOverlay.tsx` 用 JS 畫多一層一樣嘅畫面（同 imageWidth 120、同背景色），
  停 0.45 秒再淡出放大（合共不足 1 秒，唔好拖長）；原生載入畫面由佢 `hideAsync`，無縫接駁。
- App 唔好用 `Link asChild` 包 Pressable 做列表行：改用 `Pressable` + `router.push`。
- App `flex: 1` 只可以用喺**橫排**入面平分闊度：放喺直排（View 預設）入面，iOS／Android 會將高度壓到 0（Expo web 預覽唔會，睇唔到），
  內容溢出卡外（2026-11 自訂常用工具頂部一行就係咁，包住 ToolTile 嘅拖拉 View 要 `flexDirection: 'row'`）。
- App iOS 26 起 stack 畫面預設**成個畫面向右掃都返上一頁**（`fullScreenGestureEnabled` 預設 true），會搶咗 PanResponder 嘅橫向拖拉；
  有橫向拖拉嘅畫面（例如 `tools`）要喺 `_layout.tsx` 設 `fullScreenGestureEnabled: false`（左邊邊緣掃返照用得）。
- App 預覽：`EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web`（`RouteMap.web.tsx` 係地圖佔位 `MapPlaceholder`，react-native-maps 冇 web；港鐵路綫圖 `MtrMap.web.tsx` 要上網載 CanvasKit）。
  改完 code 截圖前要殺咗 server 再用 `--clear` 重開：Metro web 延遲載入嘅 chunk 會繼續送舊 code。

## 已知未做

- 政府數據未有嘅城巴路線（例如 2026 年 11 月嘅 770、9C、B13，同埋好多馬場 R 線）：`build.py` 每個方向用城巴站點列表做走法
  （id `ctb-O`／`ctb-I`），有行車時間（巴士追蹤、站間時間照用），冇時間表同車費。CSDI 有時早過 GTFS 有新路線
  （2026-11：城巴 770、790、6 新走法，九巴 11、17P、213E、268C、67M、70K、75F、77、91B、968、A41P）。
  `build.fill_lines_from_csdi`：所有冇走線嘅走法（城巴、九巴、新巴），按路線號碼 + 公司搵 CSDI 走線，用同港鐵巴士 OSM
  一樣嘅 `others.fit_line` 投影切段（304 個補到 109 個）。唔夾（站 > 100 米或者兜路，例如 6 號唔經馬坑嘅走法）就保留虛線。冇時間表嘅走法狀態係
  `unknown`（「冇時間表資料」，灰色），唔好寫「今日沒有班次」；「班次」掣只計有時間表嘅走法。
- 賽馬日改路等按事件嘅走法：政府數據冇。
- ETA `seq` 規律只喺 38 號驗證過。
- 小巴、電車、渡輪、導航（點到點）未做（港鐵、輕鐵做咗，見上面「港鐵」「輕鐵」）。介面已經預留（2026-11，用戶要求）：底部分頁「首頁／路線／導航／收藏／設定」，
  導航顯示「功能即將推出」（將來做好，首頁「你想去邊？」直接用）；「路線」標題下面、搜尋欄上面一行交通工具分類（core `TRANSPORT_MODES`，`ready: false` 嘅揀咗就收埋搜尋欄同鍵盤，
  只顯示「功能即將推出」）。網頁 `components/home/{ComingSoon,Navigation,Settings}.tsx`，App `src/app/(tabs)/{navigation,settings}.tsx` + `ui.tsx` 嘅 `ComingSoon`。
  加新交通工具：喺 `TRANSPORT_MODES` 改 `ready: true` 再接返列表。附近同收藏將來包埋所有交通工具；首頁標題「下一程」。
  App 用 Expo Router typed routes：加／改路由檔之後要開一次 `expo start` 先會更新 `.expo/types`，否則 tsc 話路徑唔存在。
- 「附近」：聯營線只列喺城巴站下面（避免同一條線喺相鄰嘅九巴站同城巴站出兩次）。
- App 未喺實機或者模擬器測試過：確認到 iOS／Android bundle 到（`npx expo export --platform ios --platform android`），
  介面用 Expo web 預覽截圖驗證過（巴士地圖除外；港鐵路綫圖有 web 預覽，雙指縮放未喺實機試過）。
