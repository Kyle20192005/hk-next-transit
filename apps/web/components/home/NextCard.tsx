'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  busDepartureRows,
  favDepartureRows,
  formatDistance,
  groupFavorites,
  groupStopHeads,
  minutesLabel,
  type DepartureRow,
  type Eta,
  type FavGroup,
  type HereRouteLike,
  type StopHead,
} from '@hknt/core';
import Icon from '@/components/Icon';
import type { Co } from '@/lib/data';
import { useFavorites, type Favorite } from '@/lib/favorites';
import { warmRoute } from '@/lib/prefetch';
import type { NearbyState, NearStop } from './Nearby';
import { groupKey } from './nextcard-key';

const MAX_CARDS = 5;
const ROWS = 4;
const REFRESH_MS = 30_000;
const TAB_KEY = 'hknt.nextTab';
type Tab = 'next' | 'favs';

/**
 * 首頁大卡（似港鐵 App 嘅「下班車」小工具）：頂部兩個分頁「下班車」（附近）同「收藏」。
 * 入面一行站名（跟住而家睇緊嗰張卡），下面打橫掃嘅到站卡（左右兩邊色條），每張最多 4 行。
 * 卡入咗畫面先載入。App 版 apps/mobile/src/components/NextCard.tsx。
 */
export default function NextCard({ nearby, onLocate, onMore, onFavs }: { nearby: NearbyState; onLocate: () => void; onMore: () => void; onFavs: () => void }) {
  const favs = useFavorites();
  const [tab, setTab] = useState<Tab>('next');
  useEffect(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      if (t === 'next' || t === 'favs') setTab(t);
    } catch {
      /* 用預設 */
    }
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };

  return (
    <section className="next-card">
      <div className="nc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'next'} className="nc-tab" onClick={() => pick('next')}>
          <Icon name="clock" size={22} />
          下班車
        </button>
        <button role="tab" aria-selected={tab === 'favs'} className="nc-tab" onClick={() => pick('favs')}>
          <Icon name="star" size={22} />
          收藏
        </button>
      </div>
      <div className="nc-body">{tab === 'next' ? <NearbyPane state={nearby} onLocate={onLocate} onMore={onMore} /> : <FavPane favs={favs} onAll={onFavs} />}</div>
    </section>
  );
}

function NearbyPane({ state, onLocate, onMore }: { state: NearbyState; onLocate: () => void; onMore: () => void }) {
  if (state.kind !== 'ok') {
    return (
      <Message
        text={state.kind === 'error' ? state.message : state.kind === 'locating' ? '定位中…' : '搵你附近嘅巴士站同下一班車'}
        error={state.kind === 'error'}
        action={state.kind === 'locating' ? undefined : { label: state.kind === 'error' ? '再試' : '定位', onClick: onLocate }}
      />
    );
  }
  const heads = groupStopHeads(state.stops).slice(0, MAX_CARDS);
  if (!heads.length) return <Message text="600 米內冇巴士站" />;
  return (
    <Swiper
      items={heads}
      header={(h) => (
        <>
          <Icon name="navigate" size={18} className="nc-loc-icon" />
          <strong>{h.name}</strong>
          <span className="muted">{formatDistance(h.distance)}</span>
        </>
      )}
      action={{ label: '更多', onClick: onMore }}
      card={(h, active) => <HereCard head={h} active={active} />}
    />
  );
}

function FavPane({ favs, onAll }: { favs: Favorite[]; onAll: () => void }) {
  const groups = groupFavorites(favs);
  if (!groups.length) return <Message text="喺路線頁撳星號收藏路線，或者打開一個站撳「收藏呢個站」，就會喺度見到下一班車。" />;
  return (
    <Swiper
      items={groups}
      header={(g) => (
        <>
          <Icon name={g.isStop ? 'pin' : 'route'} size={18} className="nc-loc-icon" />
          <strong>{g.name}</strong>
        </>
      )}
      action={{ label: '全部', onClick: onAll }}
      card={(g, active) => <FavCard group={g} active={active} />}
    />
  );
}

/** 打橫掃嘅卡；頂部一行跟住而家睇緊嗰張；卡入咗畫面先 active（載入數據） */
function Swiper<T extends { key: string }>({ items, header, action, card }: { items: T[]; header: (item: T) => ReactNode; action: { label: string; onClick: () => void }; card: (item: T, active: boolean) => ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(1);
  const cur = items[Math.min(index, items.length - 1)]!;
  const onScroll = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const i = Math.round(el.scrollLeft / (first.offsetWidth + 10));
    setIndex(i);
    setReached((r) => Math.max(r, i + 1));
  };
  return (
    <>
      <div className="nc-head">
        <span className="nc-loc">{header(cur)}</span>
        <button className="text-btn" onClick={action.onClick}>
          {action.label}
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="nc-track" ref={track} onScroll={onScroll}>
        {items.map((it, i) => (
          <div key={it.key} className="nc-slot">
            {card(it, i <= reached)}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="nc-dots" aria-hidden="true">
          {items.map((it, i) => (
            <span key={it.key} className={i === index ? 'on' : undefined} />
          ))}
        </div>
      )}
    </>
  );
}

function HereCard({ head, active }: { head: StopHead<NearStop>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(active, `${head.lat},${head.lng}`, async () => {
    const res = await fetch(`/api/here?lat=${head.lat}&lng=${head.lng}`);
    const body = (await res.json()) as { routes?: HereRouteLike[] };
    if (!res.ok) throw new Error();
    const now = Date.now();
    setState({ rows: busDepartureRows(body.routes ?? [], now, ROWS), now });
  }, () => setState((s) => s ?? { rows: [], now: Date.now() }));
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} />;
}

function FavCard({ group, active }: { group: FavGroup<Favorite>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(active, groupKey(group), async () => {
    const items = await Promise.all(
      group.favs.map(async (fav) => {
        if (!fav.stopId) return { fav, etas: null };
        try {
          const res = await fetch(`/api/eta?co=${fav.co}&route=${encodeURIComponent(fav.route)}&stop=${encodeURIComponent(fav.stopId)}`);
          const body = (await res.json()) as { etas?: Eta[] };
          return { fav, etas: (body.etas ?? []).filter((e) => e.eta && e.dir === fav.dir) };
        } catch {
          return { fav, etas: [] };
        }
      }),
    );
    const now = Date.now();
    setState({ rows: favDepartureRows(items, now), now });
  });
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} empty="暫時冇班次" />;
}

/** active 時即刻 call 一次，之後每 30 秒 */
function usePoll(active: boolean, key: string, run: () => Promise<void>, onError?: () => void) {
  const runRef = useRef(run);
  const errRef = useRef(onError);
  useEffect(() => {
    runRef.current = run;
    errRef.current = onError;
  });
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = () => runRef.current().catch(() => !cancelled && errRef.current?.());
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, key]);
}

/** 一張到站卡：左右兩邊色條（第一班嘅公司色），每行 標籤、往邊、分鐘 */
function RowsCard({ rows, now, empty = '暫時冇班次' }: { rows: DepartureRow[] | null; now: number; empty?: string }) {
  const accent = rows?.[0]?.badge.bg ?? 'var(--line)';
  return (
    <div className="nc-card" style={{ ['--nc-accent' as string]: accent }}>
      {rows === null && <div className="nc-empty muted">載入中…</div>}
      {rows?.length === 0 && <div className="nc-empty muted">{empty}</div>}
      {rows?.map((r) => (
        <Link
          key={r.key}
          href={`/${r.link.co}/${r.link.route}?dir=${r.link.dir}${r.link.stop ? `&stop=${r.link.stop}` : ''}`}
          className="nc-row"
          onPointerDown={() => warmRoute(r.link.co as Co, r.link.route, { dir: r.link.dir, stopId: r.link.stop })}
        >
          <span className="nc-badge" style={{ background: r.badge.bg, color: r.badge.ink }}>
            {r.badge.text}
          </span>
          <span className="nc-dest">往{r.dest}</span>
          <span className="nc-min">
            {r.scheduled && <span className="scheduled">原定</span>}
            {r.noService ? <span className="muted nc-none">冇班次</span> : r.at === null ? <Icon name="chevron-right" size={18} className="muted" /> : minutesLabel(r.at, now)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function Message({ text, error, action }: { text: string; error?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="nc-message">
      <span className={error ? 'error' : 'muted'}>{text}</span>
      {action && (
        <button className="text-btn" onClick={action.onClick}>
          <Icon name="locate" size={18} /> {action.label}
        </button>
      )}
    </div>
  );
}
