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
   ```

   `RUN_ON_START=1` 第一次部署即刻跑一次（大約 2–3 分鐘），睇 Logs 見到 `[pipeline] … 完成` 就得，之後可以拎走。
   想監察：喺 healthchecks.io 開一個 check（每日一次，寬限 1 個鐘），加 `PING_URL=<佢俾嘅網址>`，冇更新到會電郵通知。
4. Deploy。記憶體：build.py 最高用約 1.6GB，Advanced → Resources 唔好限少過 2GB。
5. 人手再跑（例如真係大量路線取消要強制發佈）：Dokploy 嗰個 Application 嘅 Terminal（或者 `docker exec`）：

   ```bash
   /opt/pipeline/run.sh --force
   ```

6. 確認 VPS 版每日跑得之後，喺 GitHub 停用 `.github/workflows/data.yml`（Actions → 揀 workflow → Disable），免得兩邊一齊推。

pipeline 每次都 clone 最新 `main`，改 pipeline 程式唔使重新部署呢個 Application。

## 2. tracker（巴士位置）

1. Dokploy 新增 Application `tracker`，Docker File `apps/tracker/Dockerfile`，Context `.`。
2. Environment（同 Vercel 網頁一樣嘅數據來源）：

   ```
   DATA_BASE_URL=<同 Vercel 嘅 DATA_BASE_URL 一樣>
   DATA_TOKEN=<同 Vercel 一樣；公開 repo 唔使>
   UPSTREAM_RPS=20
   CORS_ORIGINS=https://eta.kyle05.dev
   ```

   其他可調（有預設）：`POLL_MS`（15000）、`IDLE_MS`（180000）、`UPSTREAM_TTL_MS`（10000）、`MAX_LINES`（60）。
   `CORS_ORIGINS` 只管瀏覽器；App 唔受影響。本地開發想用 localhost 就加埋 `,http://localhost:3000`。
3. Domains：加 `rt.<網域>` → port **8080**，開 HTTPS（Let's Encrypt）。
4. Deploy 之後開 `https://rt.<網域>/health`，見到 `"ok": true` 同 `dataVersion` 就得。
   試一條線：`https://rt.<網域>/api/buses?co=ctb&route=38&v=1000304-1`

### 量上游請求上限（第一次部署後做一次）

data.gov.hk 冇公開請求上限，全部請求由 VPS 一個 IP 發出。喺 tracker 嘅 Terminal：

```bash
node dist/probe.js
```

由每秒 5 個開始，每級 30 秒逐級加，一出錯或者 429／403 就停，最後話你 `UPSTREAM_RPS` 設幾多。
預設最多試到每秒 20 個（`PROBE_MAX_RPS=40 node dist/probe.js` 可以試高啲）。揀夜晚人少嗰陣跑。
結果記入 `docs/realtime-backend.md`。

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
