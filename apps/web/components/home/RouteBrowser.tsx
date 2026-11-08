'use client';
import { usePrefs } from '@/lib/prefs';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TRANSPORT_MODES, orderedModes, placeMatches, radiusLabel, type PlaceMatch, type RouteIndex, type StopRouteHit, type TransportMode } from '@hknt/core';
import ComingSoon from './ComingSoon';
import RailView from '../rail/RailView';
import Keypad from './Keypad';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import { preloadRoute, warmRoute } from '@/lib/prefetch';

type Routes = RouteIndex['routes'];
const PAGE = 40;

/**
 * 路線列表：
 * - 搜尋欄固定喺頂部；預設用巴士號碼鍵盤（唔會彈系統鍵盤），撳「地點」轉做打字搜起點／終點
 * - 號碼鍵盤只開可以接落去嘅數字同字母
 * - 無限捲動：每次載入 40 條
 */
export default function RouteBrowser({
  routes,
  updated,
  mode,
  onMode,
  onNearby,
}: {
  routes: Routes;
  updated: string | null;
  /** 交通工具（由首頁捷徑揀都會帶過嚟） */
  mode: TransportMode;
  onMode: (m: TransportMode) => void;
  /** 「附近巴士站」捷徑 */
  onNearby: () => void;
}) {
  const [code, setCode] = useState(''); // 路線號碼（鍵盤）
  const [place, setPlace] = useState<string | null>(null); // 地點搜尋（null = 用緊號碼鍵盤）
  const [shown, setShown] = useState(PAGE);
  const modeInfo = TRANSPORT_MODES.find((m) => m.id === mode)!;
  const { priority, nearbyRadius } = usePrefs();
  const listRef = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const placeInput = useRef<HTMLInputElement>(null);

  // 地點搜尋：中途站經過嘅路線由伺服器搵（站點索引太大，唔落載），停手 0.25 秒先問
  const [hits, setHits] = useState<{ q: string; routes: StopRouteHit[] }>({ q: '', routes: [] });
  const placeQ = place?.trim() ?? '';
  useEffect(() => {
    if (!placeQ) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/stop-search?q=${encodeURIComponent(placeQ)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { routes: StopRouteHit[] } | null) => b && setHits({ q: placeQ, routes: b.routes }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [placeQ]);
  const searchingStops = place !== null && !!placeQ && hits.q !== placeQ;

  const matches = useMemo<PlaceMatch<Routes[number]>[]>(() => {
    if (place !== null) return placeMatches(routes, placeQ, hits.q === placeQ ? hits.routes : []);
    return (code ? routes.filter((r) => r.route.startsWith(code)) : routes).map((r) => ({ r, via: {} }));
  }, [routes, code, place, placeQ, hits]);

  // 下一個可以打嘅字：所有以而家號碼開頭嘅路線嘅下一個字
  const nextChars = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes) if (r.route.startsWith(code) && r.route.length > code.length) set.add(r.route[code.length]!);
    return set;
  }, [routes, code]);

  // 預先 fetch：候選得 3 條或以下、停咗 0.4 秒，預載佢哋嘅路線資料（唔 call 巴士公司）
  useEffect(() => {
    if (!code && !place?.trim()) return;
    if (matches.length === 0 || matches.length > 3) return;
    const t = setTimeout(() => matches.forEach(({ r }) => preloadRoute(r.co ?? 'ctb', r.route)), 400);
    return () => clearTimeout(t);
  }, [matches, code, place]);

  // 搜尋條件變咗：由頭顯示
  useEffect(() => {
    setShown(PAGE);
    listRef.current?.scrollTo({ top: 0 });
  }, [code, place]);

  // 無限捲動：見到列表尾就載入多啲
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setShown((n) => n + PAGE), {
      root: listRef.current,
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [matches]);

  // 實體鍵盤（電腦、iPad 鍵盤）：直接打路線號碼；打緊地點時唔理
  useEffect(() => {
    if (place !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Backspace') {
        setCode((c) => c.slice(0, -1));
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setCode('');
      } else if (/^[0-9a-zA-Z]$/.test(e.key)) {
        const k = e.key.toUpperCase();
        // 只接受可以接落去嘅字（同屏幕鍵盤一樣）
        if (nextChars.has(k)) setCode((c) => c + k);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, nextChars]);

  const usePlace = () => {
    setPlace('');
    setCode('');
    requestAnimationFrame(() => placeInput.current?.focus());
  };

  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <Logo size={24} />
          <h1>下一程</h1>
          <span className="app-sub">NextLeg</span>
        </div>
        {/* 交通工具分類：喺搜尋欄上面；揀咗未做嘅，搜尋欄同鍵盤都收埋 */}
        <div className="mode-chips" role="tablist" aria-label="交通工具">
          {orderedModes(priority).map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} className="mode-chip" onClick={() => onMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {!modeInfo.ready || mode === 'rail' ? null : place === null ? (
          <button className="search-field" onClick={usePlace} aria-label="搜尋路線">
            <Icon name="search" size={20} className="search-icon" />
            <span className={code ? 'search-code' : 'search-placeholder'}>{code || '輸入路線號碼'}</span>
            {code && (
              <span
                className="search-clear"
                role="button"
                aria-label="清除"
                onClick={(e) => {
                  e.stopPropagation();
                  setCode('');
                }}
              >
                <Icon name="close" size={18} />
              </span>
            )}
          </button>
        ) : (
          <div className="search-field">
            <Icon name="search" size={20} className="search-icon" />
            <input
              ref={placeInput}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="輸入地點，例如 北角、中環"
              aria-label="搜尋地點"
              enterKeyHint="search"
            />
            <button className="search-clear text" onClick={() => setPlace(null)} aria-label="轉返號碼鍵盤">
              123
            </button>
          </div>
        )}
      </header>

      {!modeInfo.ready ? (
        <ComingSoon icon="route" title={`${modeInfo.label}到站`} text="巴士做好咗先，其他交通工具陸續加入。" />
      ) : mode === 'rail' ? (
        <RailView />
      ) : (
      <>
      <ul className="route-list" ref={listRef}>
        {!code && place === null && (
          <li className="nearby-shortcut-item">
            <button className="nearby-shortcut card" onClick={onNearby}>
              <span className="empty-icon sm">
                <Icon name="pin" size={20} />
              </span>
              <span className="nearby-shortcut-text">
                <strong>附近巴士站</strong>
                <small className="muted">搵你附近 {radiusLabel(nearbyRadius)}內嘅站同每條線下一班車</small>
              </span>
              <Icon name="chevron-right" size={18} className="muted" />
            </button>
          </li>
        )}
        {matches.slice(0, shown).map(({ r, via }) => {
          const co = r.co ?? 'ctb';
          return (
            <li key={`${co}-${r.route}`} className="route-item">
              <Link href={`/${co}/${r.route}`} className="route-id" aria-label={`${r.route} 路線`} onPointerDown={() => warmRoute(co, r.route)}>
                <span className="route-num">{r.route}</span>
                <CompanyTag companies={r.companies ?? ['CTB']} />
              </Link>
              <RouteDirs r={r} co={co} via={via} />
            </li>
          );
        })}
        {matches.length === 0 && !searchingStops && <li className="empty">搵唔到路線</li>}
        {searchingStops && <li className="loading-more">搵緊經過呢度嘅路線…</li>}
        {shown < matches.length && <li ref={sentinel} className="loading-more">載入中…</li>}
        {shown >= matches.length && matches.length > 0 && (
          <li className="list-end muted">
            共 {matches.length} 條路線{updated ? `・數據更新：${updated}` : ''}
            <br />
            資料來源：運輸署、城巴、九巴（DATA.GOV.HK）
          </li>
        )}
      </ul>

      {place === null && (
        <Keypad
          nextChars={nextChars}
          onKey={(k) => setCode((c) => c + k)}
          onBack={() => setCode((c) => c.slice(0, -1))}
          onPlace={usePlace}
          canBack={code.length > 0}
        />
      )}
      </>
      )}
    </>
  );
}

/**
 * 方向：雙向路線列出兩個目的地，各自撳入對應方向（唔使入咗頁先轉方向）；
 * 單向路線一個；循環線顯示「X 循環線」。
 * 方向 O = 由 origTc 往 destTc，I = 回程。
 */
function RouteDirs({ r, co, via = {} }: { r: Routes[number]; co: string; via?: PlaceMatch<Routes[number]>['via'] }) {
  const dirs = r.dirs ?? ['O'];
  const base = `/${co}/${r.route}`;
  // 地點搜尋撞中中途站：撳入去直接打開嗰個站
  const href = (d: 'O' | 'I') => `${base}?dir=${d}${via[d] ? `&stop=${via[d]!.stopId}` : ''}`;
  if (r.origTc === r.destTc) {
    const v = via.O ?? via.I;
    return (
      <span className="route-dirs">
        <Link href={v ? href(v.dir) : base} className="route-dir" onPointerDown={() => warmRoute(co, r.route, v ? { dir: v.dir, stopId: v.stopId } : undefined)}>
          <span className="route-dir-to">{r.origTc}</span>
          <span className="route-dir-sub">{v ? `循環線 · 經 ${v.stopName}` : '循環線'}</span>
        </Link>
      </span>
    );
  }
  const options = (['O', 'I'] as const)
    .filter((d) => dirs.includes(d))
    .map((d) => ({ d, to: d === 'O' ? r.destTc : r.origTc, from: d === 'O' ? r.origTc : r.destTc }));
  return (
    <span className="route-dirs">
      {options.map((o) => (
        <Link key={o.d} href={href(o.d)} className="route-dir" aria-label={`${r.route} 往 ${o.to}${via[o.d] ? `，經 ${via[o.d]!.stopName}` : ''}`} onPointerDown={() => warmRoute(co, r.route, { dir: o.d, stopId: via[o.d]?.stopId })}>
          <span className="route-dir-to">
            <small>往</small> {o.to}
          </span>
          {via[o.d] ? <span className="route-dir-sub via">經 {via[o.d]!.stopName}</span> : options.length === 1 && <span className="route-dir-sub">由 {o.from}</span>}
          <Icon name="chevron-right" size={18} className="route-dir-go" />
        </Link>
      ))}
    </span>
  );
}
