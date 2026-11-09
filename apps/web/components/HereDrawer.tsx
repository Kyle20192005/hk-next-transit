'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDistance, routeCode, type Company } from '@hknt/core';
import CompanyTag from './CompanyTag';
import RegionTag from './RegionTag';
import Icon from './Icon';
import { warmRoute } from '@/lib/prefetch';
import type { Co } from '@/lib/data';
import EtaInline from './EtaInline';
import { liveClient } from '@/lib/buses';

interface HereRoute {
  co: Co;
  route: string;
  dir: 'O' | 'I';
  dest: string;
  companies: Company[];
  stopId: string;
  stopName: string;
  distance: number;
  etas: { eta: string; company: Company; scheduled: boolean }[];
}

const REFRESH_MS = 30_000;

/**
 * 「喺度搭得」：打開咗嘅站（連 40 米內其他公司嘅站，包括專線小巴站）可以搭嘅所有路線同下一兩班車。
 * 由右邊拉出（同詳細班次一樣）；撳一行入嗰條線，並打開同一個站。
 */
export default function HereDrawer({ lat, lng, name, current }: { lat: number; lng: number; name: string; current: { co: Co; route: string; dir: 'O' | 'I' } }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ routes: HereRoute[]; radius: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.here(lat, lng);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, lat, lng]);

  const isCurrent = (r: HereRoute) => r.co === current.co && r.route === current.route && r.dir === current.dir;
  return (
    <>
      <button className="pill-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {/* 圖示跟而家睇緊嘅路線：專線小巴用小巴（同 App 一樣） */}
        <Icon name={current.co === 'gmb' ? 'minibus' : 'bus'} size={18} />
        喺度搭得
      </button>
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer wide" role="dialog" aria-label="喺度搭得" onClick={(e) => e.stopPropagation()}>
            <header className="drawer-head">
              <span className="here-title">
                <strong>喺度搭得</strong>
                <small className="muted">
                  {name}
                  {data ? ` · 包括 ${data.radius} 米內嘅站` : ''}
                </small>
              </span>
              <button className="drawer-close" onClick={() => setOpen(false)} aria-label="關閉">
                <Icon name="close" size={20} />
              </button>
            </header>
            {error && <p className="muted drawer-note">載入失敗：{error}</p>}
            {!data && !error && <p className="muted drawer-note">載入中…</p>}
            {data && data.routes.length === 0 && <p className="muted drawer-note">搵唔到其他路線</p>}
            {data && (
              <ul className="here-list">
                {/* 而家睇緊嘅線固定排第一，其餘照 API 次序（下一班先後） */}
                {[...data.routes].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a))).map((r) => {
                  return (
                    <li key={`${r.co}-${r.route}-${r.dir}`}>
                      <Link
                        href={`/${r.co}/${r.route}?dir=${r.dir}&stop=${r.stopId}`}
                        className={`here-row${isCurrent(r) ? ' current' : ''}`}
                        onPointerDown={() => warmRoute(r.co, r.route, { dir: r.dir, stopId: r.stopId })}
                        onClick={() => setOpen(false)}
                      >
                        <span className="route-id">
                          <span className="route-num-row">
                            <span className="route-num sm">{routeCode(r.co, r.route)}</span>
                            <RegionTag co={r.co} route={r.route} />
                          </span>
                          <CompanyTag companies={r.companies} />
                        </span>
                        <span className="here-text">
                          <span className="route-to">
                            <small>往</small> {r.dest}
                          </span>
                          {isCurrent(r) ? (
                            <span className="here-sub">而家睇緊</span>
                          ) : (
                            r.distance > 0 && (
                              <span className="here-sub">
                                {r.stopName} · {formatDistance(r.distance)}
                              </span>
                            )
                          )}
                        </span>
                        <span className="nearby-eta">
                          {r.etas.length ? (
                            <>
                              <EtaInline ats={r.etas.map((e) => Date.parse(e.eta))} now={now} />
                              {r.etas[0]?.scheduled && <span className="scheduled"> 原定</span>}
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
          </aside>
        </div>
      )}
    </>
  );
}
