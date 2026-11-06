'use client';
import { useEffect, useState } from 'react';
import type { RouteIndex, TransportMode } from '@hknt/core';
import Icon, { type IconName } from '@/components/Icon';
import { useFavorites } from '@/lib/favorites';
import HomeTab from './HomeTab';
import RouteBrowser from './RouteBrowser';
import Nearby from './Nearby';
import Favorites from './Favorites';
import Navigation from './Navigation';
import Settings from './Settings';
import News from './News';
import type { ToolId } from '@hknt/core';

type Tab = 'home' | 'routes' | 'nav' | 'favs' | 'settings';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: '首頁', icon: 'home' },
  { id: 'routes', label: '路線', icon: 'route' },
  { id: 'nav', label: '導航', icon: 'navigate' },
  { id: 'favs', label: '收藏', icon: 'star' },
  { id: 'settings', label: '設定', icon: 'settings' },
];
/** 由路線頁返嚟時返返上次嘅分頁 */
const TAB_KEY = 'hknt.tab';

/**
 * 首頁：底部分頁列（首頁／路線／導航／收藏／設定；導航未做，顯示「即將推出」），每個分頁有自己嘅黃色標題區。
 * 「附近車站」唔係分頁：由首頁「附近」或者巴士路線頁「附近巴士站」撳入，有返回掣。
 */
export default function Home({ routes, updated }: { routes: RouteIndex['routes']; updated: string | null }) {
  const [tab, setTab] = useState<Tab>('home');
  // 唔係分頁嘅頁：附近車站、交通消息（有返回掣）
  const [view, setView] = useState<null | { kind: 'nearby' } | { kind: 'news'; pos: { lat: number; lng: number } | null }>(null);
  const [mode, setMode] = useState<TransportMode>('bus');
  const favCount = useFavorites().length;

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TAB_KEY);
      if (TABS.some((x) => x.id === t)) setTab(t as Tab);
    } catch {
      /* 私密瀏覽等：用預設分頁 */
    }
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    setView(null);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };

  return (
    <main className="home">
      <div className="home-body">
        {view?.kind === 'nearby' ? (
          <Nearby onBack={() => setView(null)} />
        ) : view?.kind === 'news' ? (
          <News pos={view.pos} onBack={() => setView(null)} />
        ) : (
          <>
            {tab === 'home' && (
              <HomeTab
                go={(to: ToolId, pos) => {
                  if (to === 'nearby') setView({ kind: 'nearby' });
                  else if (to === 'news') setView({ kind: 'news', pos: pos ?? null });
                  else pick(to);
                }}
              />
            )}
            {tab === 'routes' && <RouteBrowser routes={routes} updated={updated} mode={mode} onMode={setMode} onNearby={() => setView({ kind: 'nearby' })} />}
            {tab === 'nav' && <Navigation />}
            {tab === 'favs' && <Favorites onBrowse={() => pick('routes')} />}
            {tab === 'settings' && <Settings updated={updated} />}
          </>
        )}
      </div>
      <nav className="tab-bar" role="tablist" aria-label="首頁">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)}>
            <span className="tab-icon">
              <Icon name={t.id === 'favs' && tab === 'favs' ? 'star-fill' : t.icon} size={24} />
              {t.id === 'favs' && favCount > 0 && <span className="tab-count">{favCount}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
