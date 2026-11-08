'use client';
import { getPrefs, usePrefs } from '@/lib/prefs';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import type { Co } from '@/lib/data';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistance, NEARBY_CACHE_KEY, nearbyCacheUse, nearbyMoved, parseNearbyCache, radiusLabel, type Company, type NearbyCache } from '@hknt/core';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';
import EtaInline from '@/components/EtaInline';
import { liveClient } from '@/lib/buses';

export interface NearStop {
  id: string;
  co: Co;
  name: string;
  lat: number;
  lng: number;
  distance: number;
  routes: { co: Co; route: string; dir: 'O' | 'I'; dest: string; companies: Company[] }[];
}
interface StopEtas {
  routes: { route: string; dir: 'O' | 'I'; etas: { eta: string; company: Company; scheduled: boolean }[] }[];
}

/** 自動載入到站時間嘅站數（其餘撳開先載入，避免一次過 call 太多） */
const AUTO_LOAD = 4;
const REFRESH_MS = 30_000;

export type NearbyState = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[]; lat: number; lng: number; area: { n: string; en: string | null } | null };

/** 上次「附近」結果（core nearby-cache.ts）：localStorage，只喺呢部機 */
function readCache(): NearbyCache<NearStop> | null {
  try {
    return parseNearbyCache<NearStop>(localStorage.getItem(NEARBY_CACHE_KEY));
  } catch {
    return null;
  }
}
function writeCache(c: NearbyCache<NearStop>) {
  try {
    localStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 私人瀏覽等：唔記都得 */
  }
}

/**
 * 定位 + 搵附近嘅站（範圍跟設定，預設 600 米；首頁同附近頁共用）；auto = 一開就定位（設定關咗自動定位就唔會）。
 * 快：上次結果 15 分鐘內即刻顯示（1 分鐘內唔再定位，否則背景靜靜雞更新）；
 * 定位分兩步：先攞網絡／上次位置（幾百毫秒）顯示，再等 GPS，郁咗超過 40 米先再問 /api/nearby。
 */
export function useNearbyStops(auto = false) {
  const [state, setState] = useState<NearbyState>({ kind: 'idle' });
  /** 而家顯示緊嘅結果係邊個位置 */
  const shown = useRef<{ lat: number; lng: number } | null>(null);
  /** 每次定位一個號碼、每次問 /api/nearby 一個號碼：遲返嚟嘅舊結果唔好蓋過新嘅 */
  const runRef = useRef(0);
  const fetchRef = useRef(0);
  /** 問緊 /api/nearby 嘅位置（快、準兩個位置差唔多就唔使問兩次） */
  const pending = useRef<{ lat: number; lng: number } | null>(null);

  const show = useCallback((c: NearbyCache<NearStop>) => {
    shown.current = { lat: c.lat, lng: c.lng };
    setState({ kind: 'ok', stops: c.stops, lat: c.lat, lng: c.lng, area: c.area });
  }, []);

  const locate = useCallback(
    (quiet = false) => {
      if (!('geolocation' in navigator)) {
        if (!quiet) setState({ kind: 'error', message: '呢部機唔支援定位' });
        return;
      }
      if (!quiet) setState((s) => (s.kind === 'ok' ? s : { kind: 'locating' }));
      const run = ++runRef.current;
      let best = Infinity; // 用咗嘅位置準確度（米），越細越準
      let got = false;
      const onFix = async (pos: GeolocationPosition) => {
        if (run !== runRef.current) return;
        const acc = pos.coords.accuracy || 9999;
        if (acc > best) return; // 已經有更準嘅
        best = acc;
        got = true;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const radius = getPrefs().nearbyRadius;
        // 同顯示緊（或者問緊）嘅位置比較
        const cur = pending.current ?? shown.current;
        if (cur && !nearbyMoved(cur, { lat, lng })) {
          // 冇郁過：唔使再問，只更新時間
          const c = readCache();
          if (c && c.radius === radius) writeCache({ ...c, at: Date.now() });
          return;
        }
        const mine = ++fetchRef.current;
        pending.current = { lat, lng };
        try {
          const res = await fetch(`/api/nearby?lat=${lat}&lng=${lng}&r=${radius}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          if (mine !== fetchRef.current) return;
          const c: NearbyCache<NearStop> = { at: Date.now(), radius, lat, lng, stops: body.stops, area: body.area ?? null };
          writeCache(c);
          show(c);
        } catch (e) {
          if (!quiet && mine === fetchRef.current && !shown.current) setState({ kind: 'error', message: (e as Error).message });
        } finally {
          if (mine === fetchRef.current) pending.current = null;
        }
      };
      const onError = (err: GeolocationPositionError) => {
        if (quiet || got || shown.current) return;
        setState({ kind: 'error', message: err.code === err.PERMISSION_DENIED ? '冇定位權限：請喺瀏覽器設定容許呢個網站使用位置' : '攞唔到位置，請再試' });
      };
      // 1. 快：網絡定位或者兩分鐘內嘅位置
      navigator.geolocation.getCurrentPosition((p) => void onFix(p), () => {}, { enableHighAccuracy: false, timeout: 5_000, maximumAge: 120_000 });
      // 2. 準：GPS（郁咗先更新）
      navigator.geolocation.getCurrentPosition((p) => void onFix(p), onError, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 });
    },
    [show],
  );

  useEffect(() => {
    if (!auto || !getPrefs().autoLocate) return;
    const id = setTimeout(() => {
      const c = readCache();
      const use = nearbyCacheUse(c, Date.now(), getPrefs().nearbyRadius);
      if (use) show(c!);
      if (use !== 'fresh') locate(use === 'stale');
    }, 0);
    return () => clearTimeout(id);
  }, [auto, locate, show]);

  return { state, locate: useCallback(() => locate(false), [locate]) };
}

/** 附近車站（由首頁或者巴士路線頁撳入嚟，唔係分頁）：定位搵附近（設定範圍）嘅站，顯示每條路線下一班車 */
export default function Nearby({ onBack }: { onBack: () => void }) {
  const { state, locate } = useNearbyStops(true);
  const { nearbyRadius: radius } = usePrefs();

  const head = (
    <header className="app-bar">
      <button className="bar-btn" onClick={onBack} aria-label="返回">
        <Icon name="back" />
      </button>
      <div className="app-title">
        <h1>附近車站</h1>
        {state.kind === 'ok' && <span className="app-sub">{state.stops.length ? `${radiusLabel(radius)}內 ${state.stops.length} 個車站` : `${radiusLabel(radius)}內冇車站`}</span>}
      </div>
      {state.kind === 'ok' && (
        <button className="bar-btn" onClick={locate} aria-label="重新定位">
          <Icon name="locate" />
        </button>
      )}
    </header>
  );

  if (state.kind !== 'ok') {
    return (
      <>
        {head}
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="pin" size={32} />
          </span>
          <p>搵你附近 {radiusLabel(radius)}內嘅巴士站，同埋每條路線下一班車。</p>
          {state.kind === 'error' && <p className="error">{state.message}</p>}
          <button className="primary-btn" onClick={locate} disabled={state.kind === 'locating'}>
            <Icon name="locate" size={20} />
            {state.kind === 'locating' ? '定位中…' : '搵附近車站'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="nearby">
        <ul className="nearby-list">
          {state.stops.map((s, i) => (
            <NearbyStop key={`${s.co}-${s.id}`} stop={s} autoLoad={i < AUTO_LOAD} />
          ))}
        </ul>
      </div>
    </>
  );
}

export function NearbyStop({ stop, autoLoad }: { stop: NearStop; autoLoad: boolean }) {
  const [open, setOpen] = useState(autoLoad);
  const [etas, setEtas] = useState<StopEtas | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.stopEtas(stop.co, stop.id);
        if (res.ok && !cancelled) setEtas(await res.json());
      } catch {
        /* 下次再試 */
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, stop.id, stop.co]);

  const etaOf = (route: string, dir: string) => etas?.routes.find((r) => r.route === route && r.dir === dir)?.etas ?? null;

  return (
    <li className="nearby-stop card">
      <button className="nearby-stop-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="nearby-stop-name">
          <Icon name="pin" size={18} />
          {stop.name}
        </span>
        <span className="distance-chip">{formatDistance(stop.distance)}</span>
        <Icon name="chevron-down" size={18} className={`nearby-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <ul className="nearby-routes">
          {stop.routes.map((r) => {
            const list = etaOf(r.route, r.dir);
            return (
              <li key={`${r.co}-${r.route}-${r.dir}`}>
                <Link href={`/${r.co}/${r.route}?dir=${r.dir}&stop=${stop.id}`} className="nearby-route" onPointerDown={() => warmRoute(r.co, r.route, { dir: r.dir, stopId: stop.id })}>
                  <span className="route-id">
                    <span className="route-num sm">{r.route}</span>
                    <CompanyTag companies={r.companies} />
                  </span>
                  <span className="route-to">往 {r.dest}</span>
                  <span className="nearby-eta">
                    {list === null ? (
                      <span className="muted">…</span>
                    ) : list.length ? (
                      <>
                        <EtaInline ats={list.map((e) => Date.parse(e.eta))} now={now} />
                        {list[0]?.scheduled && <span className="scheduled"> 原定</span>}
                      </>
                    ) : (
                      <span className="muted">冇班次</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
