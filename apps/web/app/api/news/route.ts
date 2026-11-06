import { NextResponse, type NextRequest } from 'next/server';
import { isBusNews, isMtrNews, mentionsAny, newsTitle, placeTokens, type NewsItem } from '@hknt/core';
import { getAllStops } from '@/lib/data';
import { CORS } from '@/lib/cors';
import { liveFetch } from '@/lib/live-fetch';

/** 運輸署特別交通消息（封路、改道、渡輪調整等）同事故消息（港鐵事故等，有狀態） */
const SPECIAL = 'https://resource.data.one.gov.hk/td/tc/specialtrafficnews.xml';
const INCIDENTS = 'https://www.td.gov.hk/tc/special_news/trafficnews.xml';
/** 「附近」：呢個距離內嘅巴士站名用嚟判斷 */
const NEAR_M = 1500;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .normalize('NFKC') // 運輸署有時用康熙部首字（⾺、⾄），轉返正常字
    .trim();
const field = (xml: string, tag: string) => decode(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
const messages = (xml: string) => xml.match(/<message>[\s\S]*?<\/message>/g) ?? [];

async function load(url: string): Promise<string> {
  try {
    const res = await liveFetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dy = (lat1 - lat2) * 111320;
  const dx = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * GET /api/news[?lat&lng]：交通消息。有位置就用附近 1.5 公里內嘅站名判斷邊啲係「附近」（`nearby`）。
 * 次序：未完結嘅事故先，之後特別交通消息（照運輸署次序，新嘅先）；完結咗嘅事故排最後。
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat'));
  const lng = Number(req.nextUrl.searchParams.get('lng'));
  const hasPos = lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.5;

  const [special, incidents, stops] = await Promise.all([load(SPECIAL), load(INCIDENTS), hasPos ? getAllStops() : Promise.resolve([])]);
  const tokens = hasPos ? placeTokens(stops.filter((s) => metres(lat, lng, s.lat, s.lng) <= NEAR_M).map((s) => s.n)) : [];

  const items: NewsItem[] = [];
  for (const m of messages(incidents)) {
    const heading = field(m, 'INCIDENT_HEADING_CN');
    const detail = field(m, 'INCIDENT_DETAIL_CN');
    const location = field(m, 'LOCATION_CN');
    const content = field(m, 'CONTENT_CN');
    const text = content || [heading, detail, location].filter(Boolean).join('：');
    const all = `${heading} ${location} ${field(m, 'NEAR_LANDMARK_CN')} ${field(m, 'DISTRICT_CN')} ${text}`;
    const date = field(m, 'ANNOUNCEMENT_DATE');
    items.push({
      id: `i-${field(m, 'ID') || field(m, 'INCIDENT_NUMBER')}`,
      title: [heading, location].filter(Boolean).join('：') || newsTitle(text),
      text,
      mtr: isMtrNews(all),
      bus: isBusNews(all),
      nearby: tokens.length > 0 && mentionsAny(all, tokens),
      at: date ? `${date}+08:00` : undefined,
      closed: field(m, 'INCIDENT_STATUS_EN') === 'CLOSED',
    });
  }
  for (const m of messages(special)) {
    const text = field(m, 'ChinText') || field(m, 'ChinShort');
    if (!text) continue;
    items.push({
      id: `s-${field(m, 'msgID')}`,
      title: newsTitle(text),
      text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'),
      mtr: isMtrNews(text),
      bus: isBusNews(text),
      nearby: tokens.length > 0 && mentionsAny(text, tokens),
    });
  }
  items.sort((a, b) => Number(!!a.closed) - Number(!!b.closed));

  return NextResponse.json(
    { fetchedAt: new Date().toISOString(), items },
    { headers: { ...CORS, 'Cache-Control': hasPos ? 'private, max-age=60' : 'public, s-maxage=120, stale-while-revalidate=60' } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}
