'use client';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import { useCallback, useEffect, useState } from 'react';
import { formatDistance } from '@hknt/core';

interface NearStop {
  id: string;
  name: string;
  distance: number;
  routes: { route: string; dir: 'O' | 'I'; dest: string }[];
}
interface StopEtas {
  routes: { route: string; dir: 'O' | 'I'; dest: string; etas: { eta: string; remark: string }[] }[];
}

/** 自動載入到站時間嘅站數（其餘撳開先載入，避免一次過 call 太多） */
const AUTO_LOAD = 4;
const REFRESH_MS = 30_000;

type State = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[] };

/** 附近車站：用手機定位搵 600 米內嘅城巴站，顯示每條路線下一班車 */
export default function Nearby() {
  const [state, setState] = useState<State>({ kind: 'idle' });

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

  if (state.kind !== 'ok') {
    return (
      <div className="nearby-empty">
        <p>搵你附近 600 米內嘅城巴站，同埋每條路線下一班車。</p>
        {state.kind === 'error' && <p className="error">{state.message}</p>}
        <button className="primary-btn" onClick={locate} disabled={state.kind === 'locating'}>
          {state.kind === 'locating' ? '定位中…' : '📍 搵附近車站'}
        </button>
      </div>
    );
  }

  return (
    <div className="nearby">
      <div className="nearby-head">
        <span className="muted">{state.stops.length ? `附近 ${state.stops.length} 個車站` : '600 米內冇城巴站'}</span>
        <button className="link-btn" onClick={locate}>
          重新定位
        </button>
      </div>
      <ul className="nearby-list">
        {state.stops.map((s, i) => (
          <NearbyStop key={s.id} stop={s} autoLoad={i < AUTO_LOAD} />
        ))}
      </ul>
    </div>
  );
}

function NearbyStop({ stop, autoLoad }: { stop: NearStop; autoLoad: boolean }) {
  const [open, setOpen] = useState(autoLoad);
  const [etas, setEtas] = useState<StopEtas | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/stop-etas?stop=${stop.id}`);
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
  }, [open, stop.id]);

  const etaOf = (route: string, dir: string) => etas?.routes.find((r) => r.route === route && r.dir === dir)?.etas ?? null;

  return (
    <li className="nearby-stop card">
      <button className="nearby-stop-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="nearby-stop-name">{stop.name}</span>
        <span className="muted">{formatDistance(stop.distance)}</span>
      </button>
      {open && (
        <ul className="nearby-routes">
          {stop.routes.map((r) => {
            const list = etaOf(r.route, r.dir);
            const mins = list?.map((e) => Math.max(0, Math.round((Date.parse(e.eta) - now) / 60000)));
            return (
              <li key={`${r.route}-${r.dir}`}>
                <Link href={`/ctb/${r.route}?dir=${r.dir}&stop=${stop.id}`} className="nearby-route">
                  <span className="route-id">
                    <span className="route-num sm">{r.route}</span>
                    <CompanyTag company="CTB" />
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
