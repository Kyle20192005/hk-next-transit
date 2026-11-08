"""每日香港時間 04:17 跑 run.sh（取代 GitHub Actions 排程）。只用標準庫。

環境變數：
  RUN_AT        幾點跑，預設 04:17（香港時間）
  RUN_ON_START  設 1 = 一開容器就即刻跑一次（第一次部署、測試用）
  PING_URL      （可選）監察服務網址，例如 healthchecks.io：成功 ping 佢，失敗 ping 佢嘅 /fail
結果寫入 /state/last-run.json，方便 docker exec 入去睇。
"""
import datetime as dt
import json
import os
import subprocess
import time
import urllib.request
from zoneinfo import ZoneInfo

HK = ZoneInfo("Asia/Hong_Kong")
RUN_AT = os.environ.get("RUN_AT", "04:17")


def next_run(now: dt.datetime) -> dt.datetime:
    h, m = (int(x) for x in RUN_AT.split(":"))
    t = now.replace(hour=h, minute=m, second=0, microsecond=0)
    return t if t > now else t + dt.timedelta(days=1)


def ping(ok: bool) -> None:
    url = os.environ.get("PING_URL")
    if not url:
        return
    try:
        urllib.request.urlopen(url.rstrip("/") + ("" if ok else "/fail"), timeout=10).read()
    except Exception as e:  # 監察出錯唔影響更新
        print(f"[scheduler] ping 失敗：{e}", flush=True)


def run_once() -> None:
    started = dt.datetime.now(HK)
    print(f"[scheduler] {started:%F %T} 開始更新", flush=True)
    t0 = time.time()
    code = subprocess.call(["/opt/pipeline/run.sh"])
    result = {"startedAt": started.isoformat(), "seconds": round(time.time() - t0), "exitCode": code, "ok": code == 0}
    try:
        with open("/state/last-run.json", "w") as f:
            json.dump(result, f, ensure_ascii=False)
    except OSError:
        pass
    print(f"[scheduler] 完成：{result}", flush=True)
    ping(code == 0)


def main() -> None:
    if os.environ.get("RUN_ON_START") == "1":
        run_once()
    while True:
        now = dt.datetime.now(HK)
        nxt = next_run(now)
        print(f"[scheduler] 下次更新 {nxt:%F %T}（香港時間）", flush=True)
        time.sleep(max(1, (nxt - now).total_seconds()))
        run_once()


if __name__ == "__main__":
    main()
