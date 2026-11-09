#!/bin/sh
# 跑一次每日數據更新：clone → fetch → build → check → 推去 data 分支（同 .github/workflows/data.yml 一樣）。
# 人手跑：docker exec -it <容器> /opt/pipeline/run.sh          （大跌照發佈：加 --force）
# 要嘅環境變數：GITHUB_TOKEN（fine-grained，只限呢個 repo，Contents: Read and write）、DATA_REPO（owner/repo）
# 可選：RT_RPS（rt.data.gov.hk 每秒請求，預設 8）、GMB_RPS（專線小巴 API，預設 3）、
#       GMB_STATE_DIR（專線小巴上次成功嘅檔，預設 /state/gmb：路線資料每日只問改過嘅，下載失敗用返上次）
set -eu
: "${GITHUB_TOKEN:?要設定 GITHUB_TOKEN}"
: "${DATA_REPO:?要設定 DATA_REPO，例如 Kyle20192005/hk-next-transit}"
BRANCH="${SOURCE_BRANCH:-main}"
# REPO_URL 可以覆蓋（測試用本地 repo）
REPO_URL="${REPO_URL:-https://x-access-token:${GITHUB_TOKEN}@github.com/${DATA_REPO}.git}"
FORCE="${1:-}"

WORK="$(mktemp -d /tmp/pipeline.XXXXXX)"
trap 'rm -rf -- "$WORK"' EXIT
cd "$WORK"

echo "[pipeline] $(date '+%F %T') 開始（${DATA_REPO}@${BRANCH}）"
git clone -q --depth 1 --branch "$BRANCH" "$REPO_URL" src
cd src

echo "[pipeline] 下載原始數據"
# 城巴站資料存喺 /state（掛 volume 先會跨重新部署保留），每次只問新站同一部分舊站
# 專線小巴：/state/gmb 記住上次成功嘅檔（下載失敗就用返；路線資料只問改過嘅），API 同 tracker 同一個 IP，限速 GMB_RPS
GMB_STATE_DIR="${GMB_STATE_DIR:-/state/gmb}"
mkdir -p "$GMB_STATE_DIR" 2>/dev/null || echo "[pipeline] ⚠️ 開唔到 $GMB_STATE_DIR，專線小巴今次冇上次嘅檔可以用"
CTB_STOP_CACHE="${CTB_STOP_CACHE:-/state/ctb-stops.json}" GMB_STATE_DIR="$GMB_STATE_DIR" GMB_RPS="${GMB_RPS:-3}" \
  python3 pipeline/fetch.py
echo "[pipeline] 生成數據"
python3 pipeline/build.py

echo "[pipeline] 檢查數據（同上一版比較，大跌就唔發佈）"
mkdir -p "$WORK/prev"
if git fetch -q --depth 1 origin data; then
  git show FETCH_HEAD:stats.json > "$WORK/prev/stats.json" 2>/dev/null || rm -f "$WORK/prev/stats.json"
  git show FETCH_HEAD:index.json > "$WORK/prev/index.json" 2>/dev/null || rm -f "$WORK/prev/index.json"
fi
python3 pipeline/check.py --prev "$WORK/prev" $FORCE

echo "[pipeline] 發佈到 data 分支"
cd pipeline/out
# Vercel 會想 build data 分支做預覽，冇 apps/web 就報 Build Failed：放一個叫佢略過嘅 vercel.json
mkdir -p apps/web && echo '{"ignoreCommand": "exit 0"}' > apps/web/vercel.json
git init -q -b data
git config user.name "nextleg-pipeline"
git config user.email "pipeline@users.noreply.github.com"
git add -A
git commit -q -m "數據更新 $(date -u +%Y-%m-%dT%H:%MZ)（VPS）"
git push -q -f "$REPO_URL" data
echo "[pipeline] $(date '+%F %T') 完成"
