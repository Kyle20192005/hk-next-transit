'use client';
import Link from 'next/link';
import { TRANSPORT_MODES, type TransportMode } from '@hknt/core';
import CompanyTag from '@/components/CompanyTag';
import Icon, { type IconName } from '@/components/Icon';
import Logo from '@/components/Logo';
import { favKey, useFavorites } from '@/lib/favorites';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { FavItem } from './Favorites';
import { useNearbyStops } from './Nearby';
import DepartureCards from './DepartureCards';

export const MODE_ICON: Record<TransportMode, IconName> = { bus: 'bus', rail: 'train', minibus: 'minibus', ferry: 'ferry', tram: 'tram' };

const FAV_SHOWN = 3;
const RECENT_SHOWN = 5;

/**
 * 首頁（NextLeg 嘅入口）：導航搜尋欄 + 捷徑（交通工具、收藏、附近、最近睇過）。
 * 一開就自動定位顯示附近嘅車。App 版 apps/mobile/src/app/(tabs)/index.tsx。
 */
export default function HomeTab({ onMode, onNav, onFavs, onNearby }: { onMode: (m: TransportMode) => void; onNav: () => void; onFavs: () => void; onNearby: () => void }) {
  const favs = useFavorites();
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

        <section className="feed-section">
          <div className="feed-head">
            <h2>收藏</h2>
            {favs.length > FAV_SHOWN && (
              <button className="text-btn" onClick={onFavs}>
                全部 {favs.length}
              </button>
            )}
          </div>
          {favs.length ? (
            <ul className="fav-list compact">
              {favs.slice(0, FAV_SHOWN).map((f) => (
                <FavItem key={favKey(f)} f={f} />
              ))}
            </ul>
          ) : (
            <p className="feed-hint card">喺路線頁撳星號收藏路線，或者打開一個站撳「收藏呢個站」，就會喺度直接見到下一班車。</p>
          )}
        </section>

        <section className="feed-section">
          <div className="feed-head">
            <h2>附近</h2>
            {state.kind === 'ok' && state.stops.length > 0 && (
              <button className="text-btn" onClick={onNearby}>
                更多
              </button>
            )}
          </div>
          {state.kind === 'ok' ? (
            state.stops.length ? (
              <DepartureCards stops={state.stops} />
            ) : (
              <p className="feed-hint card">600 米內冇巴士站</p>
            )
          ) : (
            <div className="feed-hint card">
              {state.kind === 'error' ? <span className="error">{state.message}</span> : <span>{state.kind === 'locating' ? '定位中…' : '搵你附近嘅巴士站同下一班車'}</span>}
              {state.kind !== 'locating' && (
                <button className="text-btn" onClick={locate}>
                  <Icon name="locate" size={18} /> {state.kind === 'error' ? '再試' : '定位'}
                </button>
              )}
            </div>
          )}
        </section>

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
