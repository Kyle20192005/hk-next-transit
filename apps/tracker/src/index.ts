import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { APP_VERSION, etasAtStopDetailed, hereRoutes, inHongKong, stopEtas, type StopLiveDeps } from '@hknt/core';
import { config } from './config';
import { dataVersion, getAllStops, getCalendar, getIndex, getRoute, isCo, SAFE_ROUTE, SAFE_STOP } from './data';
import { createLines, NotFound } from './lines';
import { BusyError, createUpstream } from './upstream';

/**
 * tracker 第一版（docs/realtime-backend.md 階段 1a）：
 * 背景 poll 有人睇嘅線，用同網頁 /api/buses 一樣嘅格式俾巴士位置；所有人共用同一份上游請求。
 *   GET /api/buses?co=ctb&route=38&v=1540-1   巴士位置
 *   GET /api/eta?co=ctb&route=101&stop=001152  某站到站時間（同網站 /api/eta 一樣格式；追蹤緊嘅線直接用 cache，唔使再問巴士公司）
 *   GET /api/stop-etas?co=ctb&stop=001106      一個站所有路線嘅下一兩班（附近）
 *   GET /api/here?lat=22.28&lng=114.15          呢個位置可以搭嘅路線（喺度搭得、首頁下班車）
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
          '/api/eta?co=ctb&route=101&stop=001152': '某路線喺某站嘅到站時間（同網站 /api/eta 一樣格式）',
          '/api/stop-etas?co=ctb&stop=001106': '一個站所有路線嘅下一兩班（附近車站）',
          '/api/here?lat=22.3045&lng=114.1838': '呢個位置可以搭嘅所有路線（喺度搭得、首頁下班車）',
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

    if (url.pathname === '/api/eta') {
      const co = url.searchParams.get('co') ?? 'ctb';
      const route = url.searchParams.get('route') ?? '';
      const stop = url.searchParams.get('stop') ?? '';
      if (!isCo(co)) return send(req, res, 400, { error: 'co 要係 ctb、kmb、nlb 或 mtrb' });
      if (!SAFE_ROUTE.test(route) || !SAFE_STOP.test(stop)) return send(req, res, 400, { error: 'route 或 stop 格式唔啱' });
      const [data, calendar] = await Promise.all([getRoute(co, route), getCalendar()]);
      if (!data) return send(req, res, 404, { error: `搵唔到路線 ${route}` });
      // 經 upstream（10 秒 cache）：呢條線追蹤緊嘅話，呢個站啱啱先問過，唔會再問巴士公司
      const { etas, failed } = await etasAtStopDetailed(data, stop, calendar, upstream.fetch);
      return send(req, res, 200, { route: data.route, stop, fetchedAt: new Date().toISOString(), etas, failed }, { 'Cache-Control': 'no-store' });
    }

    // 附近、喺度搭得：一次問好多個站，用低優先；tracker 忙就回 503，前端改問 Vercel（唔好俾用戶見到唔完整嘅「冇班次」）
    if (url.pathname === '/api/stop-etas' || url.pathname === '/api/here') {
      let busy = false;
      const low = upstream.lowFetch(() => (busy = true));
      // 一俾人話忙就成個請求放棄（唔好再排其他站），即刻回 503
      const fetcher: typeof fetch = (input, init) => (busy ? Promise.reject(new BusyError()) : low(input, init));
      const deps: StopLiveDeps = { getRoute, getIndex, getAllStops, fetcher };
      let body: unknown;
      if (url.pathname === '/api/stop-etas') {
        const co = url.searchParams.get('co') ?? 'ctb';
        const stop = url.searchParams.get('stop') ?? '';
        if (!isCo(co) || !SAFE_STOP.test(stop)) return send(req, res, 400, { error: 'co 或 stop 格式唔啱' });
        body = await stopEtas(co, stop, deps);
        if (!body) return send(req, res, 404, { error: '搵唔到呢個站' });
      } else {
        const lat = Number(url.searchParams.get('lat'));
        const lng = Number(url.searchParams.get('lng'));
        if (!inHongKong(lat, lng)) return send(req, res, 400, { error: '位置唔喺香港範圍' });
        body = await hereRoutes(lat, lng, Number(url.searchParams.get('r')) || null, deps);
      }
      if (busy) return send(req, res, 503, { error: 'tracker 忙，請用後備' }, { 'Cache-Control': 'no-store' });
      return send(req, res, 200, body, { 'Cache-Control': 'no-store' });
    }

    send(req, res, 404, { error: '冇呢個網址' });
  } catch (e) {
    if (e instanceof NotFound) return send(req, res, 404, { error: e.message });
    if (e instanceof BusyError) return send(req, res, 503, { error: 'tracker 忙，請用後備' });
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
