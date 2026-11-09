# 部署去香港 VPS（Dokploy）

兩個 Dokploy **Application**（唔使 Compose），都由 GitHub repo build，Build Type 揀 **Dockerfile**，Context 路徑一律係 repo 根目錄 `.`：

| Application | Dockerfile 路徑 | 做咩 | 要唔要網址 |
|---|---|---|---|
| `tracker` | `apps/tracker/Dockerfile` | 巴士位置後端（背景 poll 有人睇嘅線，所有人共用） | 要（例如 `rt.<你嘅網域>`，port 8080） |
| `pipeline` | `deploy/pipeline/Dockerfile` | 每日香港時間 04:17 更新路線數據，推去 GitHub `data` 分支（取代 GitHub Actions） | 唔使 |

Dokploy 要連到 GitHub（Settings → Git → GitHub，裝 Dokploy 嘅 GitHub App，揀呢個 repo）。

## 1. pipeline（每日數據更新）

1. GitHub → Settings → Developer settings → **Fine-grained token**：
   - Repository access：只揀 `hk-next-transit`
   - Permissions：**Contents: Read and write**（其他唔使）
   - 有效期：最長嗰個，到期前記得換
2. Dokploy 新增 Application `pipeline`，Source 揀 GitHub repo、branch `main`，Build Type `Dockerfile`，
   Docker File `deploy/pipeline/Dockerfile`，Docker Context Path `.`。
3. Environment：

   ```
   GITHUB_TOKEN=<上面嘅 token>
   DATA_REPO=Kyle20192005/hk-next-transit
   RUN_ON_START=1
   GMB_STATE_DIR=/state/gmb
   GMB_RPS=3
   ```

   `GMB_STATE_DIR`：專線小巴來源（JSON_GMB、CSDI 走線、API 路線資料）上次成功嗰份存喺 `/state` volume，
   路線資料之後每日只問有改過嘅 route_id；任何一個來源下載失敗都用返上次成功嗰份，冇就跳過專線小巴（照樣發佈其他公司）。
   `GMB_RPS`：去 `data.etagmb.gov.hk` 每秒最多幾多個請求（同 tracker 同一個 IP，未量上限前保守用 3）。

   `RUN_ON_START=1` 第一次部署即刻跑一次（大約 2–3 分鐘），睇 Logs 見到 `[pipeline] … 完成` 就得，之後可以拎走。
   想監察：喺 healthchecks.io 開一個 check（每日一次，寬限 1 個鐘），加 `PING_URL=<佢俾嘅網址>`，冇更新到會電郵通知。
4. **Advanced → Volumes / Mounts**：加一個 Volume Mount，Volume 名 `pipeline-state`，Mount Path `/state`。
   城巴站資料會存喺度，之後每日只問新站同一部分舊站（請求少好多）；冇呢個，每次重新部署都要全部重新問。
5. Deploy。記憶體：build.py 最高用約 1.6GB，Advanced → Resources 唔好限少過 2GB。

> **data.gov.hk 會擋問得太密嘅 IP（403 Forbidden）**：2026-11-08 第一次喺 VPS 跑，城巴 32 條線程同時問，即刻俾人擋。
> 而家所有 `rt.data.gov.hk` 請求共用限速（`RT_RPS`，預設每秒 8 個），403 會等 5–80 秒再試。
> 第一次（冇站 cache）城巴部分大約 7–8 分鐘，之後大約 2–3 分鐘。再見到 403 就喺 Environment 加 `RT_RPS=4`。
> tracker 同 pipeline 用同一個 IP：俾人擋嗰陣 tracker 都會攞唔到城巴數據（前端會退返 Vercel）。
> 專線小巴（`data.etagmb.gov.hk`，CloudFront 後面）係另一部伺服器，限速分開計（pipeline `GMB_RPS`、tracker `UPSTREAM_RPS_BY_HOST`），
> 但係都係同一個 IP：兩邊加埋要低過量到嘅上限（見下面「量上游請求上限」）。
6. 人手再跑（例如真係大量路線取消要強制發佈）：Dokploy 嗰個 Application 嘅 Terminal（或者 `docker exec`）：

   ```bash
   /opt/pipeline/run.sh --force
   ```

7. 確認 VPS 版每日跑得之後，喺 GitHub 停用 `.github/workflows/data.yml`（Actions → 揀 workflow → Disable），免得兩邊一齊推。

pipeline 每次都 clone 最新 `main`，改 pipeline 程式唔使重新部署呢個 Application。

## 2. tracker（巴士位置）

1. Dokploy 新增 Application `tracker`，Docker File `apps/tracker/Dockerfile`，Context `.`。
2. Environment（同 Vercel 網頁一樣嘅數據來源）：

   ```
   DATA_BASE_URL=<同 Vercel 嘅 DATA_BASE_URL 一樣>
   DATA_TOKEN=<同 Vercel 一樣；公開 repo 唔使>
   UPSTREAM_RPS=14
   UPSTREAM_RPS_BY_HOST=rt.data.gov.hk=20,data.etabus.gov.hk=10,data.etagmb.gov.hk=8
   POLL_MS=20000
   CORS_ORIGINS=https://eta.kyle05.dev
   ```

   其他可調（有預設）：`POLL_MS`（15000）、`IDLE_MS`（180000）、`UPSTREAM_TTL_MS`（10000）、`MAX_LINES`（60）。
   `data.etagmb.gov.hk=8`（專線小巴）係未量之前嘅暫定值，部署後跑 `PROBE_ONLY=gmb` 再改（見下面）。
   冇寫 `data.etagmb.gov.hk` 就用程式內置嘅 8（`apps/tracker/src/config.ts` 嘅 `DEFAULT_RPS_BY_HOST`），唔會跌返去 `UPSTREAM_RPS`；量完要改就喺環境變數寫。
   `CORS_ORIGINS` 只管瀏覽器；App 唔受影響。本地開發想用 localhost 就加埋 `,http://localhost:3000`。
3. Domains：加 `rt.<網域>` → port **8080**，開 HTTPS（Let's Encrypt）。
4. Deploy 之後開 `https://rt.<網域>/health`，見到 `"ok": true` 同 `dataVersion` 就得。
   試一條線：`https://rt.<網域>/api/buses?co=ctb&route=38&v=1000304-1`

### 呢部 VPS 嘅實際做法：80／443 由 Moodle 嘅 Caddy 接（2026-11-08）

呢部 VPS 先有 `~/moodle-docker`，入面嘅 Caddy 容器（`moodle-docker-caddy-1`）佔咗 80、443，Traefik 只係開喺 8080，
所以 **Dokploy Domains 開 HTTPS 永遠攞唔到證書**（Let's Encrypt 驗證去咗 Caddy）。做法：

1. Dokploy `tracker` **唔設 Domain**（設咗 Traefik 會不停試攞證書）。
2. Caddy 接駁 Dokploy 網絡，直接搵 tracker 容器。永久寫入 `~/moodle-docker/docker-compose.yml` 嘅 `caddy`：

   ```yaml
     caddy:
       # …原本嘅設定…
       networks:
         - default
         - dokploy-network
   networks:
     dokploy-network:
       external: true
   ```

   然後 `docker compose up -d caddy`（Caddy 重開幾秒，Moodle 同 Dokploy 介面會斷一斷）。
3. `~/moodle-docker/Caddyfile` 加：

   ```
   rt.kyle05.dev {
   	reverse_proxy hktransitbackendbackend-a99ilv:8080
   }
   ```

   `hktransitbackendbackend-a99ilv` = Dokploy 俾 tracker 嘅內部名（Advanced → Traefik 嗰度 `url: http://<名>:8080`）。
   改完 `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`；證書 Caddy 自己攞。

### 量上游請求上限（第一次部署後做一次）

data.gov.hk 冇公開請求上限，全部請求由 VPS 一個 IP 發出。喺 tracker 嘅 Terminal：

```bash
node dist/probe.js
```

五間公司一齊試，按伺服器分開計（`rt.data.gov.hk` = 城巴＋新大嶼山＋港鐵巴士；`data.etabus.gov.hk` = 九巴；
`data.etagmb.gov.hk` = 專線小巴，一個站一個網址），幾部同時問；
每個網址只問一次（唔會撞中 cache）。由每秒 5 個開始，每級 30 秒逐級加，任何一部出錯或者 429／403 就停，最後話你 `UPSTREAM_RPS` 設幾多。
預設最多試到每秒 20 個。**已經量過（2026-11-08）**：rt.data.gov.hk 每秒 40 個即刻 403 封 IP、35 個冇事；九巴 20 個開始超時。唔好再試高過 35。揀夜晚人少嗰陣跑。
結果記入 `docs/realtime-backend.md`。

**專線小巴（未量）**：有專線小巴數據之後，淨係試佢一部：

```bash
PROBE_ONLY=gmb node dist/probe.js
```

每級 5、10、15、20（預設上限 20）。冇到站服務嘅站回 500「ETA unavailable」，probe 唔當出錯（tracker 都係：照 cache、唔計 `errorRate`）。
tracker 用第一級出錯嘅大約 60%，而且 tracker（`UPSTREAM_RPS_BY_HOST` 嘅 `data.etagmb.gov.hk`）加 pipeline（`GMB_RPS`）要低過嗰級；
改完 tracker 嘅 Environment 再 Deploy，結果記入 `docs/realtime-backend.md` 同 CLAUDE.md。

### 前端接 tracker

- 網頁（Vercel）→ Settings → Environment Variables：`NEXT_PUBLIC_TRACKER_URL=https://rt.<網域>`，然後 Redeploy
  （`NEXT_PUBLIC_` 喺 build 時寫入，唔重新部署唔會生效）。
- App：`EXPO_PUBLIC_TRACKER_URL=https://rt.<網域>`（`.env` 或者 EAS 環境變數）。

冇設定就照用 Vercel 嘅 `/api/buses`。設咗之後 tracker 出錯、超時（5 秒）或者死咗，前端自動退返 `/api/buses`，
60 秒後再試 tracker（core `createBusesClient`），所以 tracker 停機唔會令巴士位置消失。

## 日常

- tracker 狀態：`/health`（每間公司請求數、出錯率、平均回應時間、而家 poll 緊邊幾條線、記憶體）。
  `errorRate` 升高通常係俾人限流嘅先兆：調低 `UPSTREAM_RPS`。
- 監察：UptimeRobot 之類每分鐘 call 一次 `https://rt.<網域>/health`，死咗通知你。
- pipeline 結果：Logs，或者 Terminal `cat /state/last-run.json`。
