'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  busDepartureRows,
  favDepartureRows,
  formatDistance,
  favsForNow,
  groupFavorites,
  groupStopHeads,
  minutesLabel,
  radiusLabel,
  type DepartureRow,
  type Eta,
  type FavGroup,
  type HereRouteLike,
  type StopHead,
} from '@hknt/core';
import Icon from '@/components/Icon';
import type { Co } from '@/lib/data';
import { useFavorites, type Favorite } from '@/lib/favorites';
import { useFavGroups } from '@/lib/fav-groups';
import { warmRoute } from '@/lib/prefetch';
import { usePrefs } from '@/lib/prefs';
import type { NearbyState, NearStop } from './Nearby';
import { groupKey } from './nextcard-key';
import { liveClient } from '@/lib/buses';

const MAX_CARDS = 5;
/** 載入幾多個站頭（有啲冇車，要多攞幾個先夠 5 張） */
const LOAD_HEADS = 8;
const ROWS = 4;
const REFRESH_MS = 30_000;
const TAB_KEY = 'hknt.nextTab';
type Tab = 'next' | 'favs';

/**
 * 首頁大卡（似港鐵 App 嘅「下班車」小工具）：頂部兩個分頁「下班車」（附近）同「收藏」。
 * 入面一行站名（跟住而家睇緊嗰張卡），下面打橫掃嘅到站卡（左右兩邊色條），每張最多 4 行。
 * 卡入咗畫面先載入。App 版 apps/mobile/src/components/NextCard.tsx。
 */
export default function NextCard({
  nearby,
  onLocate,
  onMore,
  onFavs,
  notice,
}: {
  nearby: NearbyState;
  onLocate: () => void;
  onMore: () => void;
  onFavs: () => void;
  /** 下班車分頁下面嘅提示條（例如附近嘅交通消息） */
  notice?: { text: string; onClick: () => void };
}) {
  const favs = useFavorites();
  const { homeCard } = usePrefs();
  const [tab, setTab] = useState<Tab>('next');
  // 設定「首頁大卡預設」：上次睇開（記住）、下班車、收藏
  useEffect(() => {
    if (homeCard !== 'last') return setTab(homeCard);
    try {
      const t = localStorage.getItem(TAB_KEY);
      if (t === 'next' || t === 'favs') setTab(t);
    } catch {
      /* 用預設 */
    }
  }, [homeCard]);
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
      <div className={`nc-tabs ${tab}`} role="tablist">
        {/* 背景：揀咗嗰邊白色，中間斜邊（似港鐵 App），另一邊灰色；揀右邊時成個左右反轉 */}
        <div className="nc-tabs-bg" aria-hidden="true">
          <span className="nc-tabs-on" />
          <svg className="nc-tabs-slant" viewBox="0 0 56 52" preserveAspectRatio="none">
            <path d="M0 0H8Q16 0 19.5 7.5L34.5 44.5Q38 52 46 52H56V53H0Z" />
          </svg>
          <span className="nc-tabs-off" />
        </div>
        <button role="tab" aria-selected={tab === 'next'} className="nc-tab nc-tab-next" onClick={() => pick('next')}>
          <Icon name="clock" size={22} />
          下班車
        </button>
        <button role="tab" aria-selected={tab === 'favs'} className="nc-tab nc-tab-favs" onClick={() => pick('favs')}>
          <Icon name={tab === 'favs' ? 'star-fill' : 'star'} size={22} />
          收藏
        </button>
      </div>
      <div className="nc-body">
        {tab === 'next' ? <NearbyPane state={nearby} onLocate={onLocate} onMore={onMore} /> : <FavPane favs={favs} onAll={onFavs} />}
        {tab === 'next' && notice && (
          <button className="nc-notice" onClick={notice.onClick}>
            <Icon name="warning" size={20} />
            <span>{notice.text}</span>
            <Icon name="chevron-right" size={18} />
          </button>
        )}
      </div>
    </section>
  );
}

function NearbyPane({ state, onLocate, onMore }: { state: NearbyState; onLocate: () => void; onMore: () => void }) {
  const heads = state.kind === 'ok' ? groupStopHeads(state.stops).slice(0, LOAD_HEADS) : [];
  const data = useHeadRows(heads);
  const shown = useRef(new Set<string>());
  const { nearbyRadius: radius } = usePrefs();
  if (state.kind !== 'ok') {
    return (
      <Message
        text={state.kind === 'error' ? state.message : state.kind === 'locating' ? '定位中…' : '搵你附近嘅巴士站同下一班車'}
        error={state.kind === 'error'}
        action={state.kind === 'locating' ? undefined : { label: state.kind === 'error' ? '再試' : '定位', onClick: onLocate }}
      />
    );
  }
  if (!heads.length) return <Message text={`${radiusLabel(radius)}內冇巴士站`} />;
  // 冇班次嘅站頭唔出卡。全部載入完先出（逐張加會推走畫面）；出咗嘅卡之後冇車都保留，唔好令卡跳位
  const ready = heads.every((h) => data[h.key]);
  if (!ready && !shown.current.size) return <Message text="載入中…" />;
  const cards = heads.filter((h) => data[h.key]?.rows.length || shown.current.has(h.key)).slice(0, MAX_CARDS);
  cards.forEach((h) => shown.current.add(h.key));
  if (!cards.length) return <Message text="附近暫時冇班次" />;
  return (
    <Swiper
      items={cards}
      header={(h) => (
        <>
          <Icon name="navigate" size={18} className="nc-loc-icon" />
          <strong>{h.name}</strong>
          <span className="muted">{formatDistance(h.distance)}</span>
        </>
      )}
      action={{ label: '更多', onClick: onMore }}
      card={(h) => <RowsCard rows={data[h.key]?.rows ?? null} now={data[h.key]?.now ?? 0} />}
    />
  );
}

/** 附近幾個站頭一齊載入（先知邊啲有車），每 30 秒更新 */
function useHeadRows(heads: StopHead<NearStop>[]): Record<string, { rows: DepartureRow[]; now: number }> {
  const [data, setData] = useState<Record<string, { rows: DepartureRow[]; now: number }>>({});
  const key = heads.map((h) => h.key).join('|');
  const headsRef = useRef(heads);
  useEffect(() => {
    headsRef.current = heads;
  });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const tick = () =>
      headsRef.current.forEach(async (h) => {
        let rows: DepartureRow[] = [];
        try {
          const res = await liveClient.here(h.lat, h.lng);
          const body = (await res.json()) as { routes?: HereRouteLike[] };
          if (res.ok) rows = busDepartureRows(body.routes ?? [], Date.now(), ROWS);
        } catch {
          /* 當冇車，下次再試 */
        }
        if (!cancelled) setData((d) => ({ ...d, [h.key]: { rows, now: Date.now() } }));
      });
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [key]);
  return data;
}

function FavPane({ favs, onAll }: { favs: Favorite[]; onAll: () => void }) {
  // 收藏分組：而家時段嘅組（例如朝早「返工」）排最前，卡頂標組名
  const favGroups = useFavGroups();
  const [now] = useState(() => Date.now());
  const { favs: ordered, active } = favsForNow(favs, favGroups, now);
  const groups = groupFavorites(ordered);
  if (!groups.length) return <Message text="喺路線頁撳星號收藏路線，或者打開一個站撳「收藏呢個站」，就會喺度見到下一班車。" />;
  return (
    <Swiper
      items={groups}
      header={(g) => (
        <>
          <Icon name={g.isStop ? 'pin' : 'route'} size={18} className="nc-loc-icon" />
          <strong>{g.name}</strong>
          {active && g.favs.some((f) => f.group === active.id) && <span className="nc-group-tag">{active.name}</span>}
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
  const goTo = (i: number) => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    el.scrollTo({ left: Math.max(0, Math.min(items.length - 1, i)) * (first.offsetWidth + 10), behavior: 'smooth' });
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
      <div className="nc-track-wrap">
        <div className="nc-track" ref={track} onScroll={onScroll}>
          {items.map((it, i) => (
            <div key={it.key} className="nc-slot">
              {card(it, i <= reached)}
            </div>
          ))}
        </div>
        {/* 電腦冇得打橫掃：左右箭嘴（只喺有滑鼠嘅裝置顯示） */}
        {items.length > 1 && (
          <>
            <button className="nc-arrow prev" onClick={() => goTo(index - 1)} disabled={index <= 0} aria-label="上一個">
              <Icon name="back" size={20} />
            </button>
            <button className="nc-arrow next" onClick={() => goTo(index + 1)} disabled={index >= items.length - 1} aria-label="下一個">
              <Icon name="chevron-right" size={20} />
            </button>
          </>
        )}
      </div>
      {items.length > 1 && (
        <div className="nc-dots">
          {items.map((it, i) => (
            <button key={it.key} className={i === index ? 'on' : undefined} onClick={() => goTo(i)} aria-label={`第 ${i + 1} 個`} />
          ))}
        </div>
      )}
    </>
  );
}

function FavCard({ group, active }: { group: FavGroup<Favorite>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(active, groupKey(group), async () => {
    const items = await Promise.all(
      group.favs.map(async (fav) => {
        if (!fav.stopId) return { fav, etas: null };
        try {
          const res = await liveClient.eta(fav.co, fav.route, fav.stopId);
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
  const { etaFormat } = usePrefs();
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
            {r.noService ? <span className="muted nc-none">冇班次</span> : r.at === null ? <Icon name="chevron-right" size={18} className="muted" /> : minutesLabel(r.at, now, etaFormat)}
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
