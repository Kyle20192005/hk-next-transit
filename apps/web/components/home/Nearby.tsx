'use client';
import { getPrefs, usePrefs } from '@/lib/prefs';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import RegionTag from '@/components/RegionTag';
import type { Co } from '@/lib/data';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistance, routeCode, withGmbOptIn, lrtDepartureRows, lrtStopName, minutesLabel, mtrDepartureRows, mtrStationName, NEARBY_CACHE_KEY, nearbyCacheUse, nearbyMoved, nearestLrtStops, nearestTramStations, parseNearbyCache, radiusLabel, tramDepartureRows, tramStopTitle, type Company, type DepartureRow, type LrtPlatform, type MtrLineEtas, type NearbyCache, type NearMtr, type TramEta, type TramStopDest } from '@hknt/core';
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

export type NearbyState = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[]; lat: number; lng: number; area: { n: string; en: string | null } | null; mtr: NearMtr[] };

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
    setState({ kind: 'ok', stops: c.stops, lat: c.lat, lng: c.lng, area: c.area, mtr: c.mtr ?? [] });
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
          // gmb=1：呢個版本識專線小巴（舊版 App 冇，伺服器就唔俾小巴站）
          const res = await fetch(withGmbOptIn(`/api/nearby?lat=${lat}&lng=${lng}&r=${radius}`));
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          if (mine !== fetchRef.current) return;
          const c: NearbyCache<NearStop> = { at: Date.now(), radius, lat, lng, stops: body.stops, area: body.area ?? null, mtr: body.mtr ?? [] };
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

/** 附近車站頁一項：巴士站，或者範圍內嘅港鐵站、輕鐵站、電車站（按距離混埋排） */
type NearItem = { kind: 'bus'; stop: NearStop; distance: number } | { kind: 'mtr' | 'lrt' | 'tram'; sta: string; distance: number };

/**
 * 附近車站（由首頁或者巴士路線頁撳入嚟，唔係分頁）：定位搵附近（設定範圍）嘅站，顯示每條路線下一班車。
 * only = 'gmb'：路線分頁揀咗小巴撳「附近小巴站」，淨係出專線小巴站（唔出巴士、鐵路、電車）。
 */
export default function Nearby({ only, onBack, onRail, onTram }: { only?: 'gmb'; onBack: () => void; onRail: (sta: string, lrt?: boolean) => void; onTram: (sta: string) => void }) {
  const { state, locate } = useNearbyStops(true);
  const { nearbyRadius: radius } = usePrefs();
  const gmbOnly = only === 'gmb';
  const items: NearItem[] =
    state.kind === 'ok'
      ? gmbOnly
        ? state.stops.filter((s) => s.co === 'gmb').map((s) => ({ kind: 'bus' as const, stop: s, distance: s.distance }))
        : [
            ...state.stops.map((s) => ({ kind: 'bus' as const, stop: s, distance: s.distance })),
            ...state.mtr.filter((m) => m.distance <= radius).map((m) => ({ kind: 'mtr' as const, sta: m.sta, distance: m.distance })),
            ...nearestLrtStops(state.lat, state.lng, radius, 6).map((m) => ({ kind: 'lrt' as const, sta: m.sta, distance: m.distance })),
            ...nearestTramStations(state.lat, state.lng, radius, 4).map((m) => ({ kind: 'tram' as const, sta: m.sta, distance: m.distance })),
          ].sort((a, b) => a.distance - b.distance)
      : [];
  const noun = gmbOnly ? '小巴站' : '車站';

  const head = (
    <header className="app-bar">
      <button className="bar-btn" onClick={onBack} aria-label="返回">
        <Icon name="back" />
      </button>
      <div className="app-title">
        <h1>附近{noun}</h1>
        {state.kind === 'ok' && <span className="app-sub">{items.length ? `${radiusLabel(radius)}內 ${items.length} 個${noun}` : `${radiusLabel(radius)}內冇${noun}`}</span>}
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
            <Icon name={gmbOnly ? 'minibus' : 'pin'} size={32} />
          </span>
          <p>{gmbOnly ? `搵你附近 ${radiusLabel(radius)}內嘅專線小巴站，同埋每條路線下一班車。` : `搵你附近 ${radiusLabel(radius)}內嘅巴士站、小巴站、港鐵站、輕鐵站同電車站，同埋每條路線下一班車。`}</p>
          {state.kind === 'error' && <p className="error">{state.message}</p>}
          <button className="primary-btn" onClick={locate} disabled={state.kind === 'locating'}>
            <Icon name="locate" size={20} />
            {state.kind === 'locating' ? '定位中…' : `搵附近${noun}`}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="nearby">
        {gmbOnly && items.length === 0 && <p className="empty">{radiusLabel(radius)}內冇專線小巴站，可以喺設定改大「附近車站範圍」</p>}
        <ul className="nearby-list">
          {items.map((it, i) =>
            it.kind === 'bus' ? (
              <NearbyStop key={`${it.stop.co}-${it.stop.id}`} stop={it.stop} autoLoad={i < AUTO_LOAD} />
            ) : (
              <NearbyRail
                key={`${it.kind}-${it.sta}`}
                kind={it.kind}
                sta={it.sta}
                distance={it.distance}
                autoLoad={i < AUTO_LOAD}
                onOpen={it.kind === 'tram' ? () => onTram(it.sta) : () => onRail(it.sta, it.kind === 'lrt')}
              />
            ),
          )}
        </ul>
      </div>
    </>
  );
}

/**
 * 附近嘅港鐵站／輕鐵站／電車站：每條綫（路線）每個方向（電車：每個目的地）下一班，撳一行或者「喺路綫圖打開」入路綫圖嗰個站。
 * 電車冇實時，時間按運輸署時間表推算（DepartureRow.scheduled）：每班標「約」，下面寫明。
 */
function NearbyRail({ kind, sta, distance, autoLoad, onOpen }: { kind: 'mtr' | 'lrt' | 'tram'; sta: string; distance: number; autoLoad: boolean; onOpen: () => void }) {
  const { etaFormat } = usePrefs();
  const [open, setOpen] = useState(autoLoad);
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const now = Date.now();
        if (kind === 'lrt') {
          const res = await liveClient.lrt(sta);
          const body = (await res.json()) as { platforms?: LrtPlatform[] };
          if (!cancelled) setState({ rows: res.ok ? lrtDepartureRows(sta, body.platforms ?? [], now, 8) : [], now });
        } else if (kind === 'tram') {
          // 電車唔經 tracker（冇營辦商實時數據），直接問 Vercel
          const res = await fetch(`/api/tram?sta=${encodeURIComponent(sta)}`);
          const body = (await res.json()) as { realtime?: TramEta[] | null; schedule?: TramStopDest[] };
          if (!cancelled) setState({ rows: res.ok ? tramDepartureRows(sta, body.realtime ?? null, body.schedule ?? [], 8) : [], now });
        } else {
          const res = await liveClient.mtr(sta);
          const body = (await res.json()) as { lines?: MtrLineEtas[] };
          if (!cancelled) setState({ rows: res.ok ? mtrDepartureRows(sta, body.lines ?? [], 8) : [], now });
        }
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, sta, kind]);
  const name = kind === 'tram' ? `電車${tramStopTitle(sta)}` : kind === 'lrt' ? `輕鐵${lrtStopName(sta)}站` : `港鐵${mtrStationName(sta)}站`;
  const estimated = !!state?.rows.some((r) => r.scheduled);
  return (
    <li className="nearby-stop card">
      <button className="nearby-stop-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="nearby-stop-name">
          <Icon name={kind === 'tram' ? 'tram' : kind === 'lrt' ? 'lrt' : 'train'} size={18} />
          {name}
        </span>
        <span className="distance-chip">{formatDistance(distance)}</span>
        <Icon name="chevron-down" size={18} className={`nearby-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="nearby-routes nearby-rail">
          {state === null && <p className="muted nearby-rail-note">…</p>}
          {state?.rows.length === 0 && <p className="muted nearby-rail-note">暫時冇班次</p>}
          {state?.rows.map((r) => (
            <button key={r.key} className="nearby-rail-row" onClick={onOpen}>
              <span className="nc-badge" style={{ background: r.badge.bg, color: r.badge.ink }}>
                {r.badge.text}
              </span>
              <span className="nc-dest">往{r.dest}</span>
              {r.platform && (
                <span className="nc-plat" style={{ background: r.badge.bg, color: r.badge.ink }} aria-label={`${r.platform} 號月台`}>
                  {r.platform}
                </span>
              )}
              <span className={r.nowText ? 'nc-min nc-now' : 'nc-min'}>
                {r.scheduled && <span className="scheduled">{kind === 'tram' ? '約' : '原定'}</span>}
                {r.nowText ?? minutesLabel(r.at, state.now, etaFormat)}
              </span>
            </button>
          ))}
          {estimated && kind === 'tram' && <p className="muted nearby-rail-note">電車冇實時到站資料，以上按運輸署時間表推算</p>}
          <button className="nearby-rail-open" onClick={onOpen}>
            喺路綫圖打開
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}
    </li>
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
          <Icon name={stop.co === 'gmb' ? 'minibus' : 'pin'} size={18} />
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
                    <span className="route-num-row">
                      <span className="route-num sm">{routeCode(r.co, r.route)}</span>
                      <RegionTag co={r.co} route={r.route} />
                    </span>
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
