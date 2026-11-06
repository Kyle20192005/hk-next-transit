'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COMPANIES, MAX_TOOLS, TOOLS, filterNews, formatDistance, groupStopHeads, tint, toggleTool as toggle, type NewsFilter, type ToolId } from '@hknt/core';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { loadTools, saveTools, useNews } from '@/lib/news';
import { useNearbyStops } from './Nearby';
import NextCard from './NextCard';
import { NewsChips, NewsList } from './News';

const RECENT_SHOWN = 5;
const NEWS_SHOWN = 3;

/**
 * 首頁（NextLeg 入口，參考港鐵 App）：
 * 黃色區大字顯示最近嘅站頭、「想去邊度？」（導航）同交通消息燈號；常用工具（可以揀）；大卡（下班車／收藏）；
 * 交通消息（全部／附近／港鐵）；最近睇過。App 版 apps/mobile/src/app/(tabs)/index.tsx。
 */
export default function HomeTab({ go }: { go: (to: ToolId, pos?: { lat: number; lng: number } | null) => void }) {
  const recent = useRecent();
  const { state, locate } = useNearbyStops(true);
  const pos = state.kind === 'ok' ? { lat: state.lat, lng: state.lng } : null;
  const news = useNews(pos);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [tools, setTools] = useState<ToolId[]>(['routes', 'nearby', 'favs', 'news']);
  const [editing, setEditing] = useState(false);
  useEffect(() => setTools(loadTools()), []);

  const head = state.kind === 'ok' ? groupStopHeads(state.stops)[0] : undefined;
  const area = state.kind === 'ok' ? state.area : null;
  // 向上捲（連貫變形，全部跟捲動距離計，只郁 transform／opacity）：
  // 頂部「下一程」嗰行（.home-topbar）同黃色區連埋，sticky 黐住頂，捲完就係 header。
  // 捲嘅時候：大字地區名慢一拍下沉、縮細、淡出（--pl）；去到一半 header 右邊彈出地區膠囊（--pp）；
  // 搜尋欄捲到 header 底時由左向右收窄，收入右邊搜尋掣，個掣同時放大出現（--ps）。
  // 用 CSS 變數 + requestAnimationFrame，唔 setState，每格都順
  const scroller = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const locRef = useRef<HTMLDivElement>(null);
  const topbar = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      const f = searchRef.current;
      const loc = locRef.current;
      const tb = topbar.current;
      if (!el || !f || !loc || !tb) return;
      const top = el.getBoundingClientRect().top;
      const y = el.scrollTop;
      const at = (n: HTMLElement) => n.getBoundingClientRect().top - top + y; // 喺捲動內容入面嘅位置
      const barH = tb.offsetHeight;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const locEnd = Math.max(1, at(loc) + loc.offsetHeight - barH);
      const pl = clamp(y / locEnd);
      const pp = clamp((pl - 0.55) / 0.45);
      const ps = clamp((y - (at(f) - barH - 10)) / (f.offsetHeight + 10));
      el.style.setProperty('--pl', pl.toFixed(3));
      el.style.setProperty('--pp', pp.toFixed(3));
      el.style.setProperty('--ps', ps.toFixed(3));
      el.dataset.searchHidden = ps > 0.5 ? '1' : '0';
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const nearNews = news?.filter((n) => n.nearby && !n.closed) ?? [];
  const live = news?.filter((n) => !n.closed) ?? [];
  // 有位置就預設睇附近
  useEffect(() => {
    if (pos) setFilter((f) => (f === 'all' ? 'nearby' : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos]);

  const toggleTool = (id: ToolId) => {
    const next = toggle(tools, id);
    setTools(next);
    saveTools(next);
  };

  return (
    <div className="home-tab">
      <div className="home-scroll" ref={scroller} onScroll={onScroll}>
      {/* 頂部欄：同下面黃色區連埋一塊，sticky 黐住頂；捲走黃色區之後佢就係 header */}
      <div className="home-topbar" ref={topbar}>
        <Logo size={24} />
        <h1>下一程</h1>
        <span className="app-sub">NextLeg</span>
        {/* 地區膠囊：大字縮細淡出到一半先彈出，好似大字飛咗入嚟 */}
        {(area || head) && (
          <span className="home-topbar-loc" aria-hidden="true">
            <Icon name="navigate" size={13} />
            {area ? area.n : head?.name}
          </span>
        )}
        <button className="bar-btn home-topbar-search" onClick={() => go('nav')} aria-label="導航：想去邊度？">
          <Icon name="search" />
        </button>
      </div>
      <header className="app-bar home-hero">
        {/* 大字地區名（似港鐵 App「青衣 Tsing Yi」）；冇地區數據就用最近站頭名 */}
        <div className="hero-loc" aria-live="polite" ref={locRef}>
          <span className="hero-name">{area ? area.n : head ? head.name : state.kind === 'locating' ? '定位中…' : '香港'}</span>
          {area?.en && <span className="hero-en">{area.en}</span>}
          <span className="hero-sub">
            {head ? (
              <>
                <Icon name="navigate" size={14} /> 最近巴士站：{head.name} · {formatDistance(head.distance)}
              </>
            ) : state.kind === 'error' ? (
              <button className="hero-retry" onClick={locate}>
                {state.message} · 再試
              </button>
            ) : state.kind === 'ok' ? (
              '600 米內冇巴士站'
            ) : (
              '搵緊你附近嘅巴士站'
            )}
          </span>
        </div>
        <div className="search-field hero-search" ref={searchRef}>
          <button className="hero-search-main" onClick={() => go('nav')} aria-label="導航：想去邊度？">
            <Icon name="search" size={20} className="search-icon" />
            <span className="search-placeholder">想去邊度？</span>
          </button>
          <button className="status-chip" onClick={() => go('news', pos)} aria-label={`交通消息：${nearNews.length ? `附近 ${nearNews.length} 條` : '附近冇消息'}`}>
            <span className={`status-dot${nearNews.length ? ' warn' : ''}`} />
            交通消息
          </button>
        </div>
      </header>

      <div className="home-feed">
        {/* 闊螢幕分兩欄（左：大卡、最近睇過；右：常用工具、交通消息）；手機一欄，用 order 排返：工具、大卡、消息、最近 */}
        <div className="home-col home-col-main">
        <NextCard
          nearby={state}
          onLocate={locate}
          onMore={() => go('nearby', pos)}
          onFavs={() => go('favs')}
          notice={nearNews[0] ? { text: nearNews[0].title, onClick: () => go('news', pos) } : undefined}
        />
        {recent.length > 0 && (
          <section className="feed-section feed-recent">
            <div className="feed-head">
              <h2>最近睇過</h2>
            </div>
            <ul className="recent-list card">
              {recent.slice(0, RECENT_SHOWN).map((r) => {
                const c = COMPANIES[r.companies[0] ?? 'CTB'];
                return (
                  <li key={`${r.co}-${r.route}-${r.dir}`}>
                    <Link href={`/${r.co}/${r.route}?dir=${r.dir}`} className="recent-row" onPointerDown={() => warmRoute(r.co, r.route, { dir: r.dir })}>
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
          </section>
        )}
        </div>
        <div className="home-col home-col-side">
        <section className="feed-section feed-tools">
          <div className="feed-head">
            <h2>常用工具</h2>
            <button className="icon-btn" onClick={() => setEditing((e) => !e)} aria-label={editing ? '完成' : '揀常用工具'}>
              {editing ? <span className="text-btn">完成</span> : <Icon name="settings" size={20} />}
            </button>
          </div>
          {editing ? (
            <div className="tool-editor card">
              <p className="muted">揀最多 {MAX_TOOLS} 個，次序跟揀嘅先後</p>
              <div className="tool-picks">
                {TOOLS.map((t) => (
                  <button key={t.id} className="tool-pick" aria-pressed={tools.includes(t.id)} onClick={() => toggleTool(t.id)}>
                    <Icon name={t.icon} size={18} />
                    {t.label}
                    {tools.includes(t.id) && <span className="tool-order">{tools.indexOf(t.id) + 1}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="tool-grid">
              {tools.map((id) => {
                const t = TOOLS.find((x) => x.id === id)!;
                return (
                  <button key={id} className="tool-tile" onClick={() => go(id, pos)}>
                    <span className="tool-icon" style={{ color: t.color, background: tint(t.color, 0.12) }}>
                      <Icon name={t.icon} size={28} />
                      {id === 'news' && nearNews.length > 0 && <span className="tool-badge">{nearNews.length}</span>}
                    </span>
                    <span className="tool-label">{t.label}</span>
                    {t.soon && <span className="tool-soon">即將推出</span>}
                  </button>
                );
              })}
            </div>
          )}
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
