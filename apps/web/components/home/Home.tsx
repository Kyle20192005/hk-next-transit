'use client';
import { useEffect, useState } from 'react';
import type { RouteIndex } from '@hknt/core';
import Icon, { type IconName } from '@/components/Icon';
import { useFavorites } from '@/lib/favorites';
import RouteBrowser from './RouteBrowser';
import Nearby from './Nearby';
import Favorites from './Favorites';
import Navigation from './Navigation';
import Settings from './Settings';

type Tab = 'nav' | 'routes' | 'nearby' | 'favs' | 'settings';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'nav', label: '導航', icon: 'navigate' },
  { id: 'routes', label: '路線', icon: 'route' },
  { id: 'nearby', label: '附近', icon: 'pin' },
  { id: 'favs', label: '收藏', icon: 'star' },
  { id: 'settings', label: '設定', icon: 'settings' },
];
/** 由路線頁返嚟時返返上次嘅分頁 */
const TAB_KEY = 'hknt.tab';

/** 首頁：底部分頁列（導航／路線／附近／收藏／設定；導航未做，顯示「即將推出」），每個分頁有自己嘅黃色標題區 */
export default function Home({ routes, updated }: { routes: RouteIndex['routes']; updated: string | null }) {
  const [tab, setTab] = useState<Tab>('routes');
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
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };

  return (
    <main className="home">
      <div className="home-body">
        {tab === 'routes' && <RouteBrowser routes={routes} updated={updated} />}
        {tab === 'nearby' && <Nearby />}
        {tab === 'favs' && <Favorites onBrowse={() => pick('routes')} />}
        {tab === 'nav' && <Navigation />}
        {tab === 'settings' && <Settings updated={updated} />}
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
