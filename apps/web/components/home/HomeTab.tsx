'use client';
import Link from 'next/link';
import { TRANSPORT_MODES, type TransportMode } from '@hknt/core';
import CompanyTag from '@/components/CompanyTag';
import Icon, { type IconName } from '@/components/Icon';
import Logo from '@/components/Logo';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { useNearbyStops } from './Nearby';
import NextCard from './NextCard';

export const MODE_ICON: Record<TransportMode, IconName> = { bus: 'bus', rail: 'train', minibus: 'minibus', ferry: 'ferry', tram: 'tram' };

const RECENT_SHOWN = 5;

/**
 * 首頁（NextLeg 嘅入口）：導航搜尋欄、大卡（下班車／收藏，似港鐵 App 小工具）、交通工具捷徑、最近睇過。
 * 一開就自動定位顯示附近嘅車。App 版 apps/mobile/src/app/(tabs)/index.tsx。
 */
export default function HomeTab({ onMode, onNav, onFavs, onNearby }: { onMode: (m: TransportMode) => void; onNav: () => void; onFavs: () => void; onNearby: () => void }) {
  const recent = useRecent();
  const { state, locate } = useNearbyStops(true);

  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <Logo size={26} />
          <h1>下一程</h1>
          <span className="app-sub">NextLeg</span>
        </div>
        <button className="search-field" onClick={onNav} aria-label="導航：你想去邊？">
          <Icon name="navigate" size={20} className="search-icon" />
          <span className="search-placeholder">你想去邊？</span>
          <span className="soon-badge">即將推出</span>
        </button>
      </header>

      <div className="home-feed">
        <NextCard nearby={state} onLocate={locate} onMore={onNearby} onFavs={onFavs} />

        <div className="mode-grid" aria-label="交通工具">
          {TRANSPORT_MODES.map((m) => (
            <button key={m.id} className={`mode-tile${m.ready ? '' : ' soon'}`} onClick={() => onMode(m.id)}>
              <span className="mode-tile-icon">
                <Icon name={MODE_ICON[m.id]} size={26} />
              </span>
              <span className="mode-tile-label">{m.label}</span>
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <section className="feed-section">
            <div className="feed-head">
              <h2>最近睇過</h2>
            </div>
            <ul className="recent-list card">
              {recent.slice(0, RECENT_SHOWN).map((r) => (
                <li key={`${r.co}-${r.route}-${r.dir}`}>
                  <Link href={`/${r.co}/${r.route}?dir=${r.dir}`} className="recent-row" onPointerDown={() => warmRoute(r.co, r.route, { dir: r.dir })}>
                    <span className="route-id">
                      <span className="route-num sm">{r.route}</span>
                      <CompanyTag companies={r.companies} />
                    </span>
                    <span className="route-to">
                      <small>往</small> {r.dest}
                    </span>
                    <Icon name="chevron-right" size={18} className="muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
