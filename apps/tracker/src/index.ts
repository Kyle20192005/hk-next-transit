import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { APP_VERSION } from '@hknt/core';
import { config } from './config';
import { dataVersion, isCo, SAFE_ROUTE } from './data';
import { createLines, NotFound } from './lines';
import { createUpstream } from './upstream';

/**
 * tracker 第一版（docs/realtime-backend.md 階段 1a）：
 * 背景 poll 有人睇嘅線，用同網頁 /api/buses 一樣嘅格式俾巴士位置；所有人共用同一份上游請求。
 *   GET /api/buses?co=ctb&route=38&v=1540-1
 *   GET /health
 */
const upstream = createUpstream({ ttlMs: config.upstreamTtlMs, rps: config.upstreamRps });
const lines = createLines(upstream.fetch);
const startedAt = Date.now();
setInterval(upstream.sweep, 60_000).unref();

function cors(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  const allow = !config.corsOrigins.length ? '*' : origin && config.corsOrigins.includes(origin) ? origin : '';
  return allow ? { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' } : {};
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cors(req), ...extra });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(req));
    return res.end();
  }
  if (req.method !== 'GET') return send(req, res, 405, { error: '只支援 GET' });

  try {
    if (url.pathname === '/') {
      return send(req, res, 200, {
        service: '下一程 NextLeg tracker（巴士位置後端）',
        version: APP_VERSION,
        endpoints: {
          '/health': '狀態：每間公司請求數、出錯率、而家追蹤緊邊幾條線',
          '/api/buses?co=ctb&route=38&v=1000304-1': '一個走法嘅巴士位置（同網站 /api/buses 一樣格式）',
        },
      });
    }

    if (url.pathname === '/health') {
      const companies = Object.fromEntries(
        [...upstream.stats].map(([co, s]) => [co, { ...s, avgMs: s.requests ? Math.round(s.totalMs / s.requests) : null, errorRate: s.requests ? +(s.errors / s.requests).toFixed(3) : 0 }]),
      );
      return send(req, res, 200, {
        ok: true,
        version: APP_VERSION,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        dataVersion: await dataVersion(),
        config: { pollMs: config.pollMs, upstreamRps: config.upstreamRps, upstreamTtlMs: config.upstreamTtlMs, maxLines: config.maxLines },
        upstream: { queued: upstream.queued(), cached: upstream.cacheSize(), companies },
        lines: lines.status(),
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      }, { 'Cache-Control': 'no-store' });
    }

    if (url.pathname === '/api/buses') {
      const co = url.searchParams.get('co') ?? 'ctb';
      const route = url.searchParams.get('route') ?? '';
      const v = url.searchParams.get('v') ?? '';
      if (!isCo(co)) return send(req, res, 400, { error: 'co 要係 ctb、kmb、nlb 或 mtrb' });
      if (!SAFE_ROUTE.test(route) || !/^[A-Za-z0-9-]{1,20}$/.test(v)) return send(req, res, 400, { error: 'route 或 v 格式唔啱' });
      const snap = await lines.get(co, route, v);
      return send(req, res, 200, snap, { 'Cache-Control': 'no-store' });
    }

    send(req, res, 404, { error: '冇呢個網址' });
  } catch (e) {
    if (e instanceof NotFound) return send(req, res, 404, { error: e.message });
    console.error(`[http] ${req.url}：`, e);
    send(req, res, 502, { error: `計唔到：${(e as Error).message}` });
  }
});

server.listen(config.port, () => {
  console.log(`[tracker] ${APP_VERSION} 聽緊 :${config.port}；數據 ${config.dataBaseUrl ?? config.dataDir}；每秒最多 ${config.upstreamRps} 個上游請求`);
});

// Dokploy 重新部署會送 SIGTERM：收埋唔再接新連線
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`[tracker] 收到 ${sig}，停機`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
