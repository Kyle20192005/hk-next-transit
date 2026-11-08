'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Eta } from '@hknt/core';
import CompanyTag from '@/components/CompanyTag';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';
import { favKey, removeFavorite, useFavorites, type Favorite } from '@/lib/favorites';
import EtaInline from '@/components/EtaInline';
import { liveClient } from '@/lib/buses';

const REFRESH_MS = 30_000;

/** 收藏：收藏咗嘅站直接顯示下一班；收藏咗嘅路線一撳就入 */
export default function Favorites({ onBrowse }: { onBrowse: () => void }) {
  const list = useFavorites();
  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <h1>收藏</h1>
        </div>
      </header>
      {list.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="star" size={32} />
          </span>
          <p>
            喺路線頁撳標題列嘅 <Icon name="star" size={16} /> 收藏路線，
            <br />
            或者打開一個站撳「收藏呢個站」。
          </p>
          <p className="muted">收藏咗嘅站會喺度直接顯示下一班車（只儲存喺呢部機）</p>
          <button className="primary-btn" onClick={onBrowse}>
            去路線列表
          </button>
        </div>
      ) : (
        <ul className="fav-list">
          {list.map((f) => (
            <FavItem key={favKey(f)} f={f} />
          ))}
        </ul>
      )}
    </>
  );
}

export function FavItem({ f }: { f: Favorite }) {
  const href = `/${f.co}/${f.route}?dir=${f.dir}${f.stopId ? `&stop=${f.stopId}` : ''}`;
  return (
    <li className="fav card">
      <Link href={href} className="fav-main" onPointerDown={() => warmRoute(f.co, f.route, { dir: f.dir, stopId: f.stopId })}>
        <span className="route-id">
          <span className="route-num">{f.route}</span>
          <CompanyTag companies={f.companies} />
        </span>
        <span className="fav-text">
          <span className="fav-dest">
            <small>往</small> {f.dest}
          </span>
          {f.stopName ? <span className="fav-stop"><Icon name="pin" size={14} /> {f.stopName}</span> : <span className="fav-stop muted">成條路線</span>}
        </span>
        {f.stopId ? <FavEtas f={f} /> : <Icon name="chevron-right" className="fav-go" />}
      </Link>
      <button className="fav-remove" onClick={() => removeFavorite(f)} aria-label={`取消收藏 ${f.route}${f.stopName ? ` ${f.stopName}` : ''}`}>
        <Icon name="star-fill" size={20} />
      </button>
    </li>
  );
}

/** 收藏咗嘅站：下一兩班（同方向） */
function FavEtas({ f }: { f: Favorite }) {
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.eta(f.co, f.route, f.stopId!);
        const body = (await res.json()) as { etas?: Eta[] };
        if (!cancelled && res.ok) setEtas((body.etas ?? []).filter((e) => e.eta && e.dir === f.dir));
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
  }, [f.co, f.route, f.stopId, f.dir]);

  if (etas === null) return <span className="fav-eta muted">…</span>;
  if (!etas.length) return <span className="fav-eta muted">冇班次</span>;
  return (
    <span className="fav-eta">
      <EtaInline ats={etas.slice(0, 3).map((e) => Date.parse(e.eta!))} now={now} restClass="muted fav-more" sep="" />
      {etas[0]?.scheduled && <span className="scheduled">原定</span>}
    </span>
  );
}
