'use client';
import { useEffect, useState } from 'react';
import { TRANSPORT_MODES, type RouteIndex, type TransportMode } from '@hknt/core';
import Icon, { type IconName } from '@/components/Icon';
import Logo from '@/components/Logo';
import { useFavorites } from '@/lib/favorites';
import HomeTab from './HomeTab';
import type { RailPick } from '../rail/RailView';
import RouteBrowser from './RouteBrowser';
import Nearby from './Nearby';
import Favorites from './Favorites';
import Navigation from './Navigation';
import Settings from './Settings';
import News from './News';
import { toolById, type ToolId } from '@hknt/core';
import ToolEditor from './ToolEditor';
import { getPrefs, usePrefs } from '@/lib/prefs';

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
/** 「路線」分頁揀咗邊款交通工具（同 TAB_KEY 一樣，由路線頁返嚟用） */
const MODE_KEY = 'hknt.mode';

/**
 * 首頁：底部分頁列（首頁／路線／導航／收藏／設定；導航未做，顯示「即將推出」），每個分頁有自己嘅黃色標題區。
 * 「附近車站」唔係分頁：由首頁「附近」或者巴士路線頁「附近巴士站」撳入，有返回掣。
 */
export default function Home({ routes, updated }: { routes: RouteIndex['routes']; updated: string | null }) {
  const [tab, setTab] = useState<Tab>('home');
  // 唔係分頁嘅頁：附近車站、交通消息（有返回掣）
  const [view, setView] = useState<null | { kind: 'nearby' } | { kind: 'tools' } | { kind: 'news'; pos: { lat: number; lng: number } | null }>(null);
  const [mode, setModeState] = useState<TransportMode>('bus');
  // 設定「交通工具優先」：路線分頁預設揀邊款
  const { priority } = usePrefs();
  // 揀咗邊款記低（連同當時嘅優先設定）：由巴士路線頁返嚟仲係巴士，唔好變返港鐵優先嘅預設；
  // 設定改咗優先就清走記錄，用返新預設
  const setMode = (m: TransportMode) => {
    setModeState(m);
    try {
      sessionStorage.setItem(MODE_KEY, JSON.stringify({ mode: m, priority: getPrefs().priority }));
    } catch {
      /* 唔記得都冇所謂 */
    }
  };
  useEffect(() => {
    // hydration 時 usePrefs 先俾預設值：同真設定唔夾就等真值，唔好當係改咗設定
    if (priority !== getPrefs().priority) return;
    let saved: TransportMode | null = null;
    try {
      const s = JSON.parse(sessionStorage.getItem(MODE_KEY) ?? 'null') as { mode?: string; priority?: string } | null;
      if (s?.priority === priority && TRANSPORT_MODES.some((m) => m.id === s.mode)) saved = s.mode as TransportMode;
      else sessionStorage.removeItem(MODE_KEY);
    } catch {
      /* 用預設 */
    }
    setModeState(saved ?? (priority === 'rail' ? 'rail' : 'bus'));
  }, [priority]);
  const favCount = useFavorites().length;
  // 港鐵站（首頁大卡、收藏、路綫圖搜尋）：入「路線」分頁揀港鐵，飛去嗰個站並打開到站時間
  const [railPick, setRailPick] = useState<RailPick | null>(null);
  // 電車站（首頁「最近睇過」、附近車站頁、搜尋；電車冇首頁大卡同收藏）：入「路線」分頁揀電車，飛去嗰個站並打開班次（n 每次唔同，同一個站都會再飛）
  const [tramPick, setTramPick] = useState<{ sta: string; n: number } | null>(null);

  useEffect(() => {
    // 主畫面圖示長撳嘅捷徑（app/manifest.ts）：/?tab=favs、/?view=nearby；用完清走，重新整理唔會再跳
    const q = new URLSearchParams(window.location.search);
    const qt = q.get('tab');
    if (qt || q.get('view')) window.history.replaceState(null, '', window.location.pathname);
    if (TABS.some((x) => x.id === qt)) return pick(qt as Tab);
    if (q.get('view') === 'nearby') return setView({ kind: 'nearby' });
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
  const openTram = (sta: string) => {
    setMode('tram');
    setTramPick({ sta, n: Date.now() });
    pick('routes');
  };
  const openMtr = (sta: string, lrt = false) => {
    setMode('rail');
    setRailPick({ sta, lrt });
    pick('routes');
  };

  return (
    <main className={`home tab-${view ? view.kind : tab}`}>
      <div className="home-body">
        {view?.kind === 'nearby' ? (
          <Nearby onBack={() => setView(null)} onRail={openMtr} onTram={openTram} />
        ) : view?.kind === 'news' ? (
          <News pos={view.pos} onBack={() => setView(null)} />
        ) : view?.kind === 'tools' ? (
          <ToolEditor onBack={() => setView(null)} />
        ) : (
          <>
            {tab === 'home' && (
              <HomeTab
                onEditTools={() => setView({ kind: 'tools' })}
                onMtr={openMtr}
                onTram={openTram}
                go={(to: ToolId, pos) => {
                  const m = toolById(to).mode;
                  if (m) {
                    // 交通工具捷徑：入「路線」分頁揀好嗰款
                    setMode(m);
                    pick('routes');
                  } else if (to === 'nearby') setView({ kind: 'nearby' });
                  else if (to === 'news') setView({ kind: 'news', pos: pos ?? null });
                  else pick(to as Tab);
                }}
              />
            )}
            {tab === 'routes' && <RouteBrowser routes={routes} updated={updated} mode={mode} onMode={setMode} onNearby={() => setView({ kind: 'nearby' })} railPick={railPick} onRailPick={(sta, lrt) => setRailPick({ sta, lrt })} tramPick={tramPick} onTramPick={(sta) => setTramPick({ sta, n: Date.now() })} />}
            {tab === 'nav' && <Navigation />}
            {tab === 'favs' && <Favorites onBrowse={() => pick('routes')} onMtr={openMtr} />}
            {tab === 'settings' && <Settings updated={updated} />}
          </>
        )}
      </div>
      <nav className="tab-bar" role="tablist" aria-label="首頁">
        {/* 闊螢幕先顯示：頂部欄左邊嘅品牌（手機用各分頁自己嘅標題） */}
        <span className="tab-brand" aria-hidden="true">
          <Logo size={26} />
          <strong>下一程</strong>
          <span className="app-sub">NextLeg</span>
        </span>
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
