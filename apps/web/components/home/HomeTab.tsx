'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COMPANIES, DEFAULT_TOOLS, filterNews, formatDistance, groupStopHeads, LRT_BRAND, lrtRoute, lrtStopName, lrtStopRoutes, mtrLine, mtrStationLines, mtrStationName, nearestRailStation, radiusLabel, toolById, TRAM_BRAND, tramStopTitle, type NewsFilter, type ToolId } from '@hknt/core';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { usePrefs } from '@/lib/prefs';
import type { Co } from '@/lib/data';
import { loadTools, useNews } from '@/lib/news';
import { ToolIcon } from './ToolEditor';
import { useNearbyStops } from './Nearby';
import NextCard from './NextCard';
import HomeHeader from './HomeHeader';
import { NewsChips, NewsList } from './News';

const RECENT_SHOWN = 5;
const NEWS_SHOWN = 3;

/**
 * 首頁（NextLeg 入口，參考港鐵 App）：
 * 黃色區大字顯示地區名，下面最近鐵路站（港鐵站同輕鐵站邊個近出邊個，2 公里內，撳入路綫圖）同最近巴士站；「想去邊度？」（導航）同交通消息燈號；常用工具（可以揀）；大卡（下班車／收藏）；
 * 交通消息（全部／附近／港鐵）；最近睇過（巴士路線、港鐵站、輕鐵站、電車站）。App 版 apps/mobile/src/app/(tabs)/index.tsx。
 */
export default function HomeTab({
  go,
  onEditTools,
  onMtr,
  onTram,
}: {
  go: (to: ToolId, pos?: { lat: number; lng: number } | null) => void;
  onEditTools: () => void;
  onMtr: (sta: string, lrt?: boolean) => void;
  /** 打開電車路綫圖嗰個站（最近睇過） */
  onTram: (sta: string) => void;
}) {
  const recent = useRecent();
  const prefs = usePrefs();
  const { state, locate } = useNearbyStops(true);
  const pos = state.kind === 'ok' ? { lat: state.lat, lng: state.lng } : null;
  const news = useNews(pos);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [tools, setTools] = useState<ToolId[]>(DEFAULT_TOOLS);
  useEffect(() => setTools(loadTools()), []);

  const head = state.kind === 'ok' ? groupStopHeads(state.stops)[0] : undefined;
  const area = state.kind === 'ok' ? state.area : null;
  // 最近鐵路站（2 公里內）：港鐵站同輕鐵站邊個近出邊個，只出一行（2026-11 用戶要求）；撳入路綫圖嗰個站
  const railNear = state.kind === 'ok' ? nearestRailStation(state.mtr, state.lat, state.lng) : null;
  const mtrLineEl = railNear && (
    <button className="hero-line hero-mtr" onClick={() => onMtr(railNear.sta, railNear.kind === 'lrt')}>
      <Icon name={railNear.kind === 'lrt' ? 'lrt' : 'train'} size={12} /> {railNear.kind === 'lrt' ? `最近輕鐵站：${lrtStopName(railNear.sta)}` : `最近港鐵站：${mtrStationName(railNear.sta)}`}
      <span className="hero-mtr-dots" aria-hidden="true">
        {(railNear.kind === 'lrt' ? lrtStopRoutes(railNear.sta).slice(0, 5).map((r) => lrtRoute(r)?.color) : mtrStationLines(railNear.sta).map((l) => mtrLine(l)?.color)).map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
      · {formatDistance(railNear.distance)}
    </button>
  );
  const scroller = useRef<HTMLDivElement>(null);
  const nearNews = news?.filter((n) => n.nearby && !n.closed) ?? [];
  const live = news?.filter((n) => !n.closed) ?? [];
  // 有位置就預設睇附近
  useEffect(() => {
    if (pos) setFilter((f) => (f === 'all' ? 'nearby' : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos]);

  return (
    <div className="home-tab">
      <div className="home-scroll" ref={scroller}>
      <HomeHeader
        scroller={scroller}
        name={area ? area.n : head ? head.name : state.kind === 'locating' ? '定位中…' : '香港'}
        en={area?.en}
        pill={area ? area.n : head ? head.name : null}
        onSearch={() => go('nav')}
        sub={
          state.kind === 'ok' ? (
            // 設定「交通工具優先」：港鐵 → 最近港鐵站排先；巴士 → 最近巴士站排先
            <>
              {prefs.priority === 'rail' && mtrLineEl}
              <span className="hero-line">
                <Icon name="navigate" size={12} /> {head ? `最近巴士站：${head.name} · ${formatDistance(head.distance)}` : `${radiusLabel(prefs.nearbyRadius)}內冇巴士站`}
              </span>
              {prefs.priority !== 'rail' && mtrLineEl}
            </>
          ) : state.kind === 'error' ? (
            <button className="hero-retry" onClick={locate}>
              {state.message} · 再試
            </button>
          ) : state.kind === 'idle' ? (
            <button className="hero-retry" onClick={locate}>
              撳呢度定位，搵附近巴士站同港鐵站
            </button>
          ) : (
            '搵緊你附近嘅巴士站同港鐵站'
          )
        }
        status={
          <button className="status-chip" onClick={() => go('news', pos)} aria-label={`交通消息：${nearNews.length ? `附近 ${nearNews.length} 條` : '附近冇消息'}`}>
            <span className={`status-dot${nearNews.length ? ' warn' : ''}`} />
            交通消息
          </button>
        }
      />

      <div className="home-feed">
        {/* 闊螢幕分兩欄（左：大卡、最近睇過；右：常用工具、交通消息）；手機一欄，用 order 排返：工具、大卡、消息、最近 */}
        <div className="home-col home-col-main">
        <NextCard
          nearby={state}
          onMtr={onMtr}
          onLocate={locate}
          onMore={() => go('nearby', pos)}
          onFavs={() => go('favs')}
          notice={nearNews[0] ? { text: nearNews[0].title, onClick: () => go('news', pos) } : undefined}
        />
        {/* 最近睇過：巴士路線、港鐵站、輕鐵站同電車站；未有記錄都出，話俾人知點樣先會記低 */}
        <section className="feed-section feed-recent">
          <div className="feed-head">
            <h2>最近睇過</h2>
          </div>
          {recent.length === 0 ? (
            <p className="feed-hint card">未有記錄：打開巴士路線、港鐵站、輕鐵站或者電車站就會喺度見到，方便再開。</p>
          ) : (
            <ul className="recent-list card">
              {recent.slice(0, RECENT_SHOWN).map((r) => {
                if (r.co === 'tram')
                  return (
                    <li key={`tram-${r.route}`}>
                      <button className="recent-row" onClick={() => onTram(r.route)}>
                        <span className="nc-badge recent-mtr" style={{ background: TRAM_BRAND.color, color: TRAM_BRAND.ink }}>
                          {TRAM_BRAND.zh}
                        </span>
                        <span className="route-to recent-sta">{tramStopTitle(r.route)}</span>
                        <Icon name="chevron-right" size={18} className="muted" />
                      </button>
                    </li>
                  );
                if (r.co === 'lrt')
                  return (
                    <li key={`lrt-${r.route}`}>
                      <button className="recent-row" onClick={() => onMtr(r.route, true)}>
                        <span className="nc-badge recent-mtr" style={{ background: LRT_BRAND.color, color: LRT_BRAND.ink }}>
                          輕鐵
                        </span>
                        <span className="route-to recent-sta">
                          {r.dest}站
                          <span className="hero-mtr-dots" aria-hidden="true">
                            {lrtStopRoutes(r.route)
                              .slice(0, 5)
                              .map((x) => (
                                <i key={x} style={{ background: lrtRoute(x)?.color }} />
                              ))}
                          </span>
                        </span>
                        <Icon name="chevron-right" size={18} className="muted" />
                      </button>
                    </li>
                  );
                if (r.co === 'mtr')
                  return (
                    <li key={`mtr-${r.route}`}>
                      <button className="recent-row" onClick={() => onMtr(r.route)}>
                        <span className="nc-badge recent-mtr">港鐵</span>
                        <span className="route-to recent-sta">
                          {r.dest}站
                          <span className="hero-mtr-dots" aria-hidden="true">
                            {mtrStationLines(r.route).map((l) => (
                              <i key={l} style={{ background: mtrLine(l)?.color }} />
                            ))}
                          </span>
                        </span>
                        <Icon name="chevron-right" size={18} className="muted" />
                      </button>
                    </li>
                  );
                const c = COMPANIES[r.companies[0] ?? 'CTB'];
                return (
                  <li key={`${r.co}-${r.route}-${r.dir}`}>
                    <Link href={`/${r.co}/${r.route}?dir=${r.dir}`} className="recent-row" onPointerDown={() => warmRoute(r.co as Co, r.route, { dir: r.dir })}>
                      <span className="nc-badge" style={{ background: c.bg, color: c.ink }}>
                        {r.route}
                      </span>
                      <span className="route-to">
                        <small>往</small> {r.dest}
                      </span>
                      <Icon name="chevron-right" size={18} className="muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>
        <div className="home-col home-col-side">
        <section className="feed-section feed-tools">
          <div className="feed-head">
            <h2>常用工具</h2>
            <button className="text-btn" onClick={onEditTools}>
              自訂 <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="tool-grid">
            {tools.map((id) => (
              <button key={id} className="tool-tile" onClick={() => go(id, pos)}>
                <ToolIcon id={id} badge={id === 'news' ? nearNews.length : 0} />
                <span className="tool-label">{toolById(id).label}</span>
                {toolById(id).soon && <span className="tool-soon">即將推出</span>}
              </button>
            ))}
          </div>
        </section>
        <section className="feed-section feed-news">
          <div className="feed-head">
            <h2>交通消息</h2>
            <button className="text-btn" onClick={() => go('news', pos)}>
              更多 <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <NewsChips value={filter} onChange={setFilter} hasPos={!!pos} />
          {news === null ? (
            <p className="feed-hint card">載入中…</p>
          ) : (
            <NewsList items={filterNews(filter === 'all' ? live : news.filter((n) => !n.closed), filter).slice(0, NEWS_SHOWN)} empty={filter === 'nearby' ? '附近冇特別交通消息' : '暫時冇特別交通消息'} />
          )}
        </section>
        </div>
      </div>
      </div>
    </div>
  );
}
