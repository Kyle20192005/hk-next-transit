'use client';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import type { Co } from '@/lib/data';
import { useCallback, useEffect, useState } from 'react';
import { formatDistance, type Company } from '@hknt/core';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';

export interface NearStop {
  id: string;
  co: Co;
  name: string;
  distance: number;
  routes: { co: Co; route: string; dir: 'O' | 'I'; dest: string; companies: Company[] }[];
}
interface StopEtas {
  routes: { route: string; dir: 'O' | 'I'; etas: { eta: string; company: Company; scheduled: boolean }[] }[];
}

/** 自動載入到站時間嘅站數（其餘撳開先載入，避免一次過 call 太多） */
const AUTO_LOAD = 4;
const REFRESH_MS = 30_000;

export type NearbyState = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[] };

/** 定位 + 搵 600 米內嘅站（首頁同附近頁共用）；auto = 一開就定位 */
export function useNearbyStops(auto = false) {
  const [state, setState] = useState<NearbyState>({ kind: 'idle' });

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ kind: 'error', message: '呢部機唔支援定位' });
      return;
    }
    setState({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          setState({ kind: 'ok', stops: body.stops });
        } catch (e) {
          setState({ kind: 'error', message: (e as Error).message });
        }
      },
      (err) =>
        setState({
          kind: 'error',
          message: err.code === err.PERMISSION_DENIED ? '冇定位權限：請喺瀏覽器設定容許呢個網站使用位置' : '攞唔到位置，請再試',
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(locate, 0);
    return () => clearTimeout(id);
  }, [auto, locate]);

  return { state, locate };
}

/** 附近車站（由首頁或者巴士路線頁撳入嚟，唔係分頁）：定位搵 600 米內嘅站，顯示每條路線下一班車 */
export default function Nearby({ onBack }: { onBack: () => void }) {
  const { state, locate } = useNearbyStops(true);

  const head = (
    <header className="app-bar">
      <button className="bar-btn" onClick={onBack} aria-label="返回">
        <Icon name="back" />
      </button>
      <div className="app-title">
        <h1>附近車站</h1>
        {state.kind === 'ok' && <span className="app-sub">{state.stops.length ? `600 米內 ${state.stops.length} 個車站` : '600 米內冇車站'}</span>}
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
          <p>搵你附近 600 米內嘅巴士站，同埋每條路線下一班車。</p>
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
        const res = await fetch(`/api/stop-etas?co=${stop.co}&stop=${stop.id}`);
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
            const mins = list?.map((e) => Math.max(0, Math.round((Date.parse(e.eta) - now) / 60000)));
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
                    ) : mins && mins.length ? (
                      <>
                        <b>{mins[0] === 0 ? '即將' : mins[0]}</b>
                        {mins[0] !== 0 && <small> 分</small>}
                        {mins.length > 1 && <small className="muted"> · {mins.slice(1).join('、')} 分</small>}
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
