'use client';
import { usePrefs } from '@/lib/prefs';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import RegionTag from '@/components/RegionTag';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GMB_REGION_NAME, GMB_REGIONS, TRANSPORT_MODES, orderedModes, placeMatches, radiusLabel, routeCode, routeMode, routeRegion, type GmbRegion, type PlaceMatch, type RouteIndex, type StopRouteHit, type TransportMode } from '@hknt/core';
import ComingSoon from './ComingSoon';
import RailView, { type RailPick } from '../rail/RailView';
import RailSearch from '../rail/RailSearch';
import TramView from '../rail/TramView';
import TramSearch from '../rail/TramSearch';
import Keypad from './Keypad';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import { preloadRoute, warmRoute } from '@/lib/prefetch';

type Routes = RouteIndex['routes'];
const PAGE = 40;
/** 小巴地區篩選（全部／港島／九龍／新界）：記喺 sessionStorage，由路線頁返嚟仲係同一個 */
const REGION_KEY = 'hknt.gmbRegion';

function readRegion(): GmbRegion | '' {
  try {
    const v = sessionStorage.getItem(REGION_KEY);
    return GMB_REGIONS.includes(v as GmbRegion) ? (v as GmbRegion) : '';
  } catch {
    return '';
  }
}

/**
 * 路線列表：
 * - 搜尋欄固定喺頂部；預設用巴士號碼鍵盤（唔會彈系統鍵盤），撳「地點」轉做打字搜起點／終點
 * - 號碼鍵盤只開可以接落去嘅數字同字母
 * - 無限捲動：每次載入 40 條
 * - 巴士、小巴（專線小巴，co gmb）分開：巴士唔出小巴，小巴唔出巴士；小巴號碼唔連地區（NT-2 顯示 2），
 *   同號碼唔同地區用地區標籤分，上面可以揀地區
 */
export default function RouteBrowser({
  routes,
  updated,
  mode,
  onMode,
  onNearby,
  railPick,
  onRailPick,
  tramPick,
  onTramPick,
}: {
  routes: Routes;
  updated: string | null;
  /** 交通工具（由首頁捷徑揀都會帶過嚟） */
  mode: TransportMode;
  onMode: (m: TransportMode) => void;
  /** 「附近巴士站」捷徑；小巴分類係「附近小巴站」（only = 'gmb'） */
  onNearby: (only?: 'gmb') => void;
  /** 港鐵：要打開嘅站（搜尋、首頁大卡、收藏）；每次新 object 就飛去一次 */
  railPick: RailPick | null;
  onRailPick: (sta: string, lrt: boolean) => void;
  tramPick: { sta: string; n: number } | null;
  onTramPick: (sta: string) => void;
}) {
  const [code, setCode] = useState(''); // 路線號碼（鍵盤）
  const [place, setPlace] = useState<string | null>(null); // 地點搜尋（null = 用緊號碼鍵盤）
  const [shown, setShown] = useState(PAGE);
  const modeInfo = TRANSPORT_MODES.find((m) => m.id === mode)!;
  const { priority, nearbyRadius } = usePrefs();
  const listRef = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const placeInput = useRef<HTMLInputElement>(null);
  const minibus = mode === 'minibus';
  const listMode = minibus ? 'minibus' : 'bus';

  // 小巴地區（全部 = ''）
  const [region, setRegionState] = useState<GmbRegion | ''>('');
  useEffect(() => setRegionState(readRegion()), []);
  const setRegion = (r: GmbRegion | '') => {
    setRegionState(r);
    try {
      if (r) sessionStorage.setItem(REGION_KEY, r);
      else sessionStorage.removeItem(REGION_KEY);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };

  // 呢個分類嘅路線：巴士唔要小巴，小巴唔要巴士；小巴再按地區
  const modeRoutes = useMemo(
    () => routes.filter((r) => routeMode(r.co) === listMode && (!minibus || !region || routeRegion(r.co, r.route) === region)),
    [routes, listMode, minibus, region],
  );

  // 轉分類：號碼、地點由頭嚟過（小巴同巴士號碼唔同）
  useEffect(() => {
    setCode('');
    setPlace(null);
  }, [mode]);

  // 地點搜尋：中途站經過嘅路線由伺服器搵（站點索引太大，唔落載），停手 0.25 秒先問；
  // mode：巴士、小巴分開搵（舊版 App 冇 mode = 只有巴士）
  const [hits, setHits] = useState<{ q: string; mode: string; routes: StopRouteHit[] }>({ q: '', mode: '', routes: [] });
  const placeQ = place?.trim() ?? '';
  useEffect(() => {
    if (!placeQ) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/stop-search?q=${encodeURIComponent(placeQ)}&mode=${listMode}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { routes: StopRouteHit[] } | null) => b && setHits({ q: placeQ, mode: listMode, routes: b.routes }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [placeQ, listMode]);
  const hitsReady = hits.q === placeQ && hits.mode === listMode;
  const searchingStops = place !== null && !!placeQ && !hitsReady;

  // 號碼用顯示號碼比較（小巴 NT-2 → 2）
  const matches = useMemo<PlaceMatch<Routes[number]>[]>(() => {
    if (place !== null) return placeMatches(modeRoutes, placeQ, hitsReady ? hits.routes : []);
    return (code ? modeRoutes.filter((r) => routeCode(r.co, r.route).startsWith(code)) : modeRoutes).map((r) => ({ r, via: {} }));
  }, [modeRoutes, code, place, placeQ, hits, hitsReady]);

  // 下一個可以打嘅字：所有以而家號碼開頭嘅路線嘅下一個字
  const nextChars = useMemo(() => {
    const set = new Set<string>();
    for (const r of modeRoutes) {
      const c = routeCode(r.co, r.route);
      if (c.startsWith(code) && c.length > code.length) set.add(c[code.length]!);
    }
    return set;
  }, [modeRoutes, code]);

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
  }, [code, place, mode, region]);

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
    if (place !== null || mode === 'rail' || mode === 'tram') return;
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
  }, [place, nextChars, mode]);

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
        {!modeInfo.ready ? null : mode === 'rail' ? (
          <RailSearch onPick={onRailPick} />
        ) : mode === 'tram' ? (
          <TramSearch onPick={onTramPick} />
        ) : place === null ? (
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
              placeholder={minibus ? '輸入地點，例如 西貢、旺角' : '輸入地點，例如 北角、中環'}
              aria-label="搜尋地點"
              enterKeyHint="search"
            />
            <button className="search-clear text" onClick={() => setPlace(null)} aria-label="轉返號碼鍵盤">
              123
            </button>
          </div>
        )}
        {/* 小巴：揀地區（同一個號碼三個地區都可以有） */}
        {modeInfo.ready && minibus && (
          <div className="region-seg" role="radiogroup" aria-label="小巴地區">
            {(['', ...GMB_REGIONS] as const).map((r) => (
              <button key={r || 'all'} role="radio" aria-checked={region === r} onClick={() => setRegion(r)}>
                {r ? GMB_REGION_NAME[r] : '全部'}
              </button>
            ))}
          </div>
        )}
      </header>

      {!modeInfo.ready ? (
        <ComingSoon icon="route" title={`${modeInfo.label}到站`} text="巴士做好咗先，其他交通工具陸續加入。" />
      ) : mode === 'rail' ? (
        <RailView pick={railPick} />
      ) : mode === 'tram' ? (
        <TramView pick={tramPick} />
      ) : (
      <>
      <ul className="route-list" ref={listRef}>
        {!code && place === null && (
          <li className="nearby-shortcut-item">
            <button className="nearby-shortcut card" onClick={() => onNearby(minibus ? 'gmb' : undefined)}>
              <span className="empty-icon sm">
                <Icon name={minibus ? 'minibus' : 'pin'} size={20} />
              </span>
              <span className="nearby-shortcut-text">
                <strong>{minibus ? '附近小巴站' : '附近巴士站'}</strong>
                <small className="muted">搵你附近 {radiusLabel(nearbyRadius)}內嘅站同每條線下一班車</small>
              </span>
              <Icon name="chevron-right" size={18} className="muted" />
            </button>
          </li>
        )}
        {matches.slice(0, shown).map(({ r, via }) => {
          const co = r.co ?? 'ctb';
          const rg = routeRegion(co, r.route);
          return (
            <li key={`${co}-${r.route}`} className="route-item">
              <Link href={`/${co}/${r.route}`} className="route-id" aria-label={`${rg ? GMB_REGION_NAME[rg] : ''}${routeCode(co, r.route)} 路線`} onPointerDown={() => warmRoute(co, r.route)}>
                <span className="route-num">{routeCode(co, r.route)}</span>
                {/* 小巴全部都係專線小巴：標地區就夠 */}
                {rg ? <RegionTag co={co} route={r.route} /> : <CompanyTag companies={r.companies ?? ['CTB']} />}
              </Link>
              <RouteDirs r={r} co={co} via={via} />
            </li>
          );
        })}
        {matches.length === 0 && !searchingStops && (
          // 小巴數據今日生成唔到（pipeline 跳過）：成個分類冇路線
          <li className="empty">{minibus && !routes.some((r) => routeMode(r.co) === 'minibus') ? '暫時冇專線小巴路線資料，請稍後再試' : '搵唔到路線'}</li>
        )}
        {searchingStops && <li className="loading-more">搵緊經過呢度嘅路線…</li>}
        {shown < matches.length && <li ref={sentinel} className="loading-more">載入中…</li>}
        {shown >= matches.length && matches.length > 0 && (
          <li className="list-end muted">
            共 {matches.length} 條路線{updated ? `・數據更新：${updated}` : ''}
            <br />
            {minibus ? '資料來源：運輸署專線小巴開放數據、GTFS（DATA.GOV.HK）' : '資料來源：運輸署、城巴、九巴（DATA.GOV.HK）'}
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
        <Link key={o.d} href={href(o.d)} className="route-dir" aria-label={`${routeCode(co, r.route)} 往 ${o.to}${via[o.d] ? `，經 ${via[o.d]!.stopName}` : ''}`} onPointerDown={() => warmRoute(co, r.route, { dir: o.d, stopId: via[o.d]?.stopId })}>
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
