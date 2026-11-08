# 每日數據更新（取代 GitHub Actions 嘅 data.yml），Dokploy Application。Build context = repo 根目錄：
#   Dockerfile 路徑 deploy/pipeline/Dockerfile，Context 路徑 .
# 每次跑都由 GitHub clone 最新 main 嘅 pipeline，所以改 pipeline 唔使重新部署呢個容器。
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Hong_Kong PYTHONUNBUFFERED=1
COPY deploy/pipeline/run.sh deploy/pipeline/scheduler.py /opt/pipeline/
RUN chmod +x /opt/pipeline/run.sh && useradd -m pipeline && mkdir -p /state && chown pipeline /state
USER pipeline
CMD ["python3", "/opt/pipeline/scheduler.py"]
