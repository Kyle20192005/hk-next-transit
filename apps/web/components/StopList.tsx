'use client';
import { getPrefs } from '@/lib/prefs';
import { busesClient } from '@/lib/buses';
import { useEffect, useMemo, useRef, useState } from 'react';
import { alightSummary, companyNames, matchStops, routeTitle, shareText, BusStabilizer, LIVE_REFRESH, type LastBus, parseLiveBuses, busDistanceTo, busFraction, formatDistance, adjustLastBus, labelEtas, lastBusEtaIndex, secondsFrom, type Dir, type Eta, type TrackedBus } from '@hknt/core';
import { OPEN_STOP_EVENT, publishBuses, publishFocus, setOpenStopIndex } from '@/lib/events';
import StopRow, { type RowBus } from './StopRow';
import { companyColor, companyInk } from '@/lib/company';
import type { Co } from '@/lib/data';
import type { Company } from '@hknt/core';
import Icon from './Icon';

type Props = {
  /** 路線檔位置（ctb 包聯營線、kmb 包九巴同龍運） */
  co: Co;
  /** 多過一間公司營辦（聯營線）：每班車標明公司 */
  multiCompany: boolean;
  /** 營辦公司（收藏用） */
  companies: Company[];
  route: string;
  stops: { dir: Dir; stopId: string; name: string; lat?: number; lng?: number }[];
  selectedVariantId: string | null;
  /** 平均行車時間（秒），攞到即時數據之前先用 */
  segSeconds: number[] | null;
  /** 每個站沿走線嘅累計距離（米） */
  cumMetres: number[];
  /** 路線主要公司（時間線同巴士用公司代表色） */
  company: string;
  /** 往邊度（收藏、分享用；同標題列一樣） */
  dest: string;
  /** 最後一個站係終點站（唔上得車）；專線小巴循環線最後一個站之後仲要返總站，唔係 */
  endIsTerminus?: boolean;
  /** 每個站上車嘅車費（同 stops 對應）；joyYou = null 即係唔適用樂悠咭 */
  fares: ({ adult: string; joyYou: string | null } | null)[];
  /** 每個站嘅尾班車（時間表估算；同 stops 對應） */
  lastBus: (LastBus | null)[];
  /** 一開頁就打開嘅站（由「附近」撳入嚟） */
  initialOpen: number | null;
  /** 捲動區最底（資料來源） */
  children?: React.ReactNode;
};

const ETA_REFRESH_MS = LIVE_REFRESH.etaMs;
const MAX_ETAS = LIVE_REFRESH.maxEtas;
/** 最近嘅站要喺幾多米內先算（太遠即係唔喺呢條線附近） */
const NEAREST_MAX_M = 500;
const BUSES_REFRESH_MS = LIVE_REFRESH.busesMs;

/**
 * 站點列表：一次只開一個站。
 * - 成條線嘅巴士位置每 20 秒更新（/api/buses），通知地圖
 * - 打開站時：攞到站時間、地圖放大過去；每班車標示「距離 N 個站／未開出」
 * - 後面嘅站顯示由打開咗嘅站出發要幾耐，同下一班車大概幾時到
 */
export default function StopList({ co, multiCompany, companies, route, stops, selectedVariantId, segSeconds: avgSeg, cumMetres, company, dest, endIsTerminus = true, fares, lastBus, initialOpen, children }: Props) {
  const isEnd = (i: number) => i === stops.length - 1 && endIsTerminus;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<{ buses: TrackedBus[]; segSeconds: number[] } | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  // 落車站：打開站之後撳「揀落車站」，再撳下面一個站
  const [alight, setAlight] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  // 到站時間幾時攞到（「N 秒前更新」）；撳「重新整理」即刻再攞
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const openStop = (i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setError(null);
    setFetchedAt(null);
    setPicking(false);
    setAlight((a) => (i !== null && a !== null && a > i ? a : null));
    if (i === null) return;
    publishFocus(i);
    // 將打開咗嘅站嘅站名對齊列表頂部（只捲站點列表，唔郁成頁）
    requestAnimationFrame(() => {
      const row = rows.current[i];
      const box = row?.closest<HTMLElement>('.stops-scroll');
      if (!row || !box) return;
      const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' });
    });
  };

  // 轉方向（SwapLink）要知而家打開咗邊個站
  useEffect(() => {
    setOpenStopIndex(openIndex);
  }, [openIndex]);
  useEffect(() => () => setOpenStopIndex(null), []);

  // 一開頁就打開指定嘅站
  useEffect(() => {
    if (initialOpen !== null) openStop(initialOpen);
  }, [initialOpen]);

  // ---------- 最近嘅站：用定位搵呢個走法最近嘅站，打開佢 ----------
  const [nearest, setNearest] = useState<{ index: number; metres: number } | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied' | 'far' | 'error'>('idle');
  const findNearest = (openIt: boolean) => {
    if (!('geolocation' in navigator)) return setLocating('error');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: lo } = pos.coords;
        let best: { index: number; metres: number } | null = null;
        stops.forEach((s, i) => {
          if (s.lat === undefined || s.lng === undefined || isEnd(i)) return; // 終點站唔使
          const dy = (s.lat - la) * 111320;
          const dx = (s.lng - lo) * 111320 * Math.cos((la * Math.PI) / 180);
          const m = Math.hypot(dx, dy);
          if (!best || m < best.metres) best = { index: i, metres: m };
        });
        const b = best as { index: number; metres: number } | null;
        if (!b || b.metres > NEAREST_MAX_M) {
          setNearest(null);
          setLocating('far');
          return;
        }
        setNearest(b);
        setLocating('idle');
        if (openIt) openStop(b.index);
      },
      (err) => setLocating(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };
  // 開頁自動搵最近嘅站（第一次瀏覽器會問一次權限）；由「附近」撳入嚟（指定咗站）就唔使打開
  // 用戶拒絕過（denied）就唔再問
  // 設定關咗「自動定位」就唔搵，等用戶自己撳「重新定位」
  useEffect(() => {
    if (!getPrefs().autoLocate) return;
    let cancelled = false;
    const run = () => !cancelled && findNearest(initialOpen === null);
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((p) => (p.state === 'denied' ? !cancelled && setLocating('denied') : run()))
        .catch(run);
    } else {
      run();
    }
    return () => {
      cancelled = true;
    };
    // 只喺開頁時做一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => openStop((e as CustomEvent<number>).detail);
    window.addEventListener(OPEN_STOP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STOP_EVENT, onOpen);
  }, []);

  // 成條線嘅巴士位置
  useEffect(() => {
    if (!selectedVariantId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await busesClient.buses(co, route, selectedVariantId);
        if (!res.ok) return;
        const body = (await res.json()) as { buses: { from: number; nextEta: string; company?: string; gps?: { lat: number; lng: number }; schedule?: boolean }[]; segSeconds: number[] };
        if (cancelled) return;
        setLive({ buses: parseLiveBuses(body.buses), segSeconds: body.segSeconds });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const t = setInterval(tick, BUSES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [co, route, selectedVariantId]);


  // 打開咗嘅站：攞到站時間
  const open = openIndex !== null ? stops[openIndex] : undefined;
  useEffect(() => {
    if (openIndex === null || !open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await busesClient.eta(co, route, open.stopId);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (cancelled) return;
        // 最多顯示 5 班（港鐵巴士會一次過俾成晚嘅班次）
        setEtas((body.etas as Eta[]).filter((e) => e.dir === open.dir && e.eta).slice(0, MAX_ETAS));
        setFailed((body.failed as string[] | undefined) ?? []);
        setError(null);
        setFetchedAt(Date.now());
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, ETA_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [openIndex, open, co, route, refreshKey]);

  const isMine = (e: Eta) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId;
  const seg = live?.segSeconds ?? avgSeg;
  const travel = useMemo(() => {
    if (!seg || openIndex === null) return null;
    const cum = [0];
    for (const s of seg) cum.push(cum[cum.length - 1]! + s);
    return secondsFrom(cum, openIndex);
  }, [seg, openIndex]);

  // 打開咗嘅站嘅尾班：時間表估計再用實測行車時間校正（夜晚車快，中途站估計會遲成十幾分鐘）
  const openLast = useMemo(() => {
    if (openIndex === null) return null;
    const liveMin = live ? live.segSeconds.slice(0, openIndex).reduce((a, b) => a + b, 0) / 60 : null;
    return adjustLastBus(lastBus[openIndex] ?? null, liveMin);
  }, [openIndex, lastBus, live]);
  const lastByTime = useMemo(() => (etas ? lastBusEtaIndex(etas, openLast) : -1), [etas, openLast]);

  // 每班車而家喺邊：用成條線追蹤到嘅巴士對應返呢個站嘅 ETA
  const matched = useMemo(() => {
    if (!live || openIndex === null || !etas) return null;
    // 九巴「原定班次」唔係實時，唔配對巴士位置
    const mine = etas.filter((e) => isMine(e) && !e.scheduled);
    const labels = labelEtas(live.buses, openIndex, mine.map((e) => Date.parse(e.eta!)), live.segSeconds, now);
    // 尾班車：認到邊班 ETA 係尾班，又對到架車，就記住佢（地圖、時間線標「尾班」）
    const lk = lastByTime >= 0 ? mine.indexOf(etas[lastByTime]!) : -1;
    const ll = lk >= 0 ? labels[lk] : undefined;
    const lastTracked = ll && ll.kind !== 'notDeparted' ? ll.bus : null;
    return { mine, labels, lastTracked };
  }, [live, openIndex, etas, selectedVariantId, now, lastByTime]);
  const whereLabels = useMemo(() => {
    if (!live || openIndex === null || !etas || !matched) return null;
    const { mine, labels } = matched;
    return etas.map((e) => {
      const k = mine.indexOf(e);
      if (k < 0) return null;
      const l = labels[k]!;
      if (l.kind === 'notDeparted') return '未開出';
      // 沿路線仲有幾遠
      const m = busDistanceTo(l.bus, busFraction(l.bus, live.segSeconds, now), openIndex, cumMetres);
      const dist = m === null || m < 50 ? '' : ` · ${formatDistance(m)}`;
      return l.kind === 'arriving' ? `即將到站${dist}` : `距離 ${l.stopsAway} 個站${dist}`;
    });
  }, [live, openIndex, etas, matched, now, cumMetres]);

  // 下一班（揀咗嘅走法）喺打開咗嘅站嘅到站時間
  const nextAtOpen = useMemo(() => {
    const t = etas?.filter(isMine).map((e) => Date.parse(e.eta!)).filter((x) => x >= now - 60_000).sort((a, b) => a - b)[0];
    return t ?? null;
  }, [etas, selectedVariantId, now]);

  // 時間線上嘅巴士：每 5 秒按時間推前；同地圖一樣只准向前
  const [busNow, setBusNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setBusNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  const stabilizer = useMemo(() => new BusStabilizer(), []);
  const stable = useMemo(() => (live ? stabilizer.update(live.buses, live.segSeconds, busNow) : []), [live, busNow, stabilizer]);
  // 尾班車：打開站認到之後記住佢（穩定 id），閂咗個站都繼續標，直至佢行完全程
  const [lastId, setLastId] = useState<number | null>(null);
  const trackedId = matched?.lastTracked ? (stable.find((x) => x.bus === matched.lastTracked)?.id ?? null) : null;
  if (trackedId !== null && trackedId !== lastId) setLastId(trackedId);
  const lastStable = stable.find((x) => x.id === (trackedId ?? lastId)) ?? null;
  // 呢個站邊班係尾班：追蹤緊嘅尾班車就係嚟緊呢度嗰架就用佢（最準），否則按時間認
  const lastEtaIndex = useMemo(() => {
    if (etas && matched && lastStable) {
      const k = matched.labels.findIndex((l) => l.kind !== 'notDeparted' && l.bus === lastStable.bus);
      if (k >= 0) return etas.indexOf(matched.mine[k]!);
    }
    return lastByTime;
  }, [etas, matched, lastStable, lastByTime]);

  // 通知地圖
  useEffect(() => {
    if (!live) return;
    publishBuses({ ...live, openIndex, lastBus: lastStable?.bus ?? null });
  }, [live, openIndex, lastStable?.bus]);

  const rowBuses = useMemo(() => {
    const out = new Map<number, RowBus[]>();
    if (!live) return out;
    const last = stops.length - 1;
    for (const { id, bus, progress } of stable) {
      const from = Math.min(Math.floor(progress), last - 1);
      const f = Math.min(1, progress - from);
      // 兩站之間：前半段畫喺上一個站嗰行嘅下半，後半段畫喺下一個站嗰行嘅上半
      const [row, half, t] = f < 0.5 ? [from, 'below' as const, f * 2] : [from + 1, 'above' as const, (f - 0.5) * 2];
      const mins = Math.max(0, Math.round((bus.nextEta - busNow) / 60000));
      const isLast = id === lastStable?.id;
      const label = (isLast ? '尾班車：' : '') + (bus.schedule ? '按時間表估計：' : '') + (mins === 0 ? `即將到 ${stops[from + 1]?.name ?? ''}` : `約 ${mins} 分鐘到 ${stops[from + 1]?.name ?? ''}`);
      const busCo = multiCompany ? (bus.company ?? company) : company;
      out.set(row, [...(out.get(row) ?? []), { key: id, half, t, label, schedule: bus.schedule, last: isLast, company: busCo, color: companyColor(busCo), ink: companyInk(busCo) }]);
    }
    return out;
  }, [live, stable, busNow, stops, multiCompany, company, lastStable?.id]);

  // 落車站摘要（打開咗嘅站顯示）
  const alightInfo =
    openIndex !== null && alight !== null && alight > openIndex
      ? {
          name: stops[alight]?.name ?? '',
          summary: alightSummary({
            nextAt: nextAtOpen,
            travelSeconds: travel?.[alight] ?? null,
            stops: alight - openIndex,
            metres: (cumMetres[alight] ?? 0) - (cumMetres[openIndex] ?? 0) || null,
          }),
        }
      : null;
  const companyLabel = companyNames(companies);
  // 專線小巴：「2（新界）」；其他公司就係路線號碼
  const title = routeTitle(co, route);
  const share = async () => {
    if (openIndex === null) return;
    const s = stops[openIndex]!;
    const url = `${location.origin}/${co}/${route}?dir=${s.dir}&stop=${s.stopId}`;
    const text = shareText({ company: companyLabel, route: title, dest, stop: s.name, nextAt: nextAtOpen, now: Date.now() });
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} 到站時間`, text, url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareNote('已複製連結');
    } catch {
      setShareNote('複製唔到，請手動複製網址');
    }
    setTimeout(() => setShareNote(null), 2500);
  };

  // 站名搜尋（長途線好多站）：打字即刻列出撞中嘅站，撳一個就打開
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const found = useMemo(() => matchStops(stops.map((s) => s.name), query), [stops, query]);
  const pick = (i: number) => {
    setSearching(false);
    setQuery('');
    openStop(i);
  };

  return (
    <>
    <div className="nearest-bar" role="status">
      {searching ? (
        <div className="stop-search">
          <Icon name="search" size={18} className="nearest-icon" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && found[0] !== undefined) pick(found[0]);
              if (e.key === 'Escape') setSearching(false);
            }}
            placeholder="搵站名，例如 黃竹坑"
            aria-label="搵站"
          />
          <button className="link-btn" onClick={() => (setSearching(false), setQuery(''))}>
            取消
          </button>
          {query.trim() && (
            <ul className="stop-search-results" role="listbox">
              {found.length === 0 && <li className="muted">呢條線冇站撞中「{query.trim()}」</li>}
              {found.map((i) => (
                <li key={i}>
                  <button onClick={() => pick(i)}>
                    <span className="seq">{i + 1}</span> {stops[i]!.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
      <>
      <Icon name="pin" size={18} className="nearest-icon" />
      <span className="nearest-text">
        {locating === 'busy' && '搵緊最近嘅站…'}
        {locating === 'denied' && '開咗定位就會自動打開最近嘅站'}
        {locating === 'far' && '附近 500 米內冇呢條線嘅站'}
        {locating === 'error' && '攞唔到位置'}
        {locating === 'idle' && nearest && (
          <>
            最近：<b>{stops[nearest.index]?.name}</b> · {formatDistance(nearest.metres)}
          </>
        )}
        {locating === 'idle' && !nearest && '最近嘅站'}
      </span>
      {locating !== 'busy' && (
        <button className="link-btn" onClick={() => findNearest(true)}>
          {nearest ? '重新定位' : '定位'}
        </button>
      )}
      <button className="bar-icon-btn" onClick={() => setSearching(true)} aria-label="搵站">
        <Icon name="search" size={18} />
      </button>
      </>
      )}
    </div>
    {/* 「最近」嗰行喺捲動區外面：放喺入面用 sticky 嘅話，iPhone 喺頂部拉落去會跟住列表彈 */}
    <div className="stops-scroll">
    <ol className="stops" style={{ ['--line-color' as string]: companyColor(company) ?? 'var(--route-line)' }}>
      {stops.map((s, i) => {
        const tr = travel?.[i] ?? null;
        return (
          <StopRow
            key={`${s.dir}-${s.stopId}-${i}`}
            ref={(el) => {
              rows.current[i] = el;
            }}
            index={i}
            name={s.name}
            multiCompany={multiCompany}
            terminus={i === 0 || isEnd(i)}
            buses={rowBuses.get(i) ?? []}
            open={openIndex === i}
            onToggle={() => {
              // 揀緊落車站：撳下面嘅站 = 揀佢；撳其他 = 取消
              if (picking) {
                setPicking(false);
                if (openIndex !== null && i > openIndex) setAlight(i);
                return;
              }
              openStop(openIndex === i ? null : i);
            }}
            pickable={picking && openIndex !== null && i > openIndex}
            isAlight={alight === i && openIndex !== null && i > openIndex}
            alight={openIndex === i ? alightInfo : null}
            picking={openIndex === i && picking}
            onPickAlight={() => setPicking((p) => !p)}
            onClearAlight={() => setAlight(null)}
            updatedAt={openIndex === i ? fetchedAt : null}
            clockNow={busNow}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            onShare={share}
            shareNote={openIndex === i ? shareNote : null}
            etas={openIndex === i ? etas : null}
            whereLabels={openIndex === i ? whereLabels : null}
            error={openIndex === i ? error : null}
            failed={openIndex === i ? failed : []}
            now={now}
            selectedVariantId={selectedVariantId}
            nearestMetres={nearest?.index === i ? nearest.metres : null}
            here={s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng, name: s.name, current: { co, route, dir: s.dir } } : null}
            fav={!isEnd(i) ? { co, route, dir: s.dir, dest, companies, stopId: s.stopId, stopName: s.name } : null}
            fare={fares[i] ?? null}
            lastBus={openIndex === i ? openLast : null}
            lastEtaIndex={openIndex === i ? lastEtaIndex : -1}
            travelSeconds={openIndex !== null && i > openIndex ? tr : null}
            travelMetres={openIndex !== null && i > openIndex ? (cumMetres[i] ?? 0) - (cumMetres[openIndex] ?? 0) : null}
            nextArrival={openIndex !== null && i > openIndex && tr !== null && nextAtOpen !== null ? nextAtOpen + tr * 1000 : null}
          />
        );
      })}
    </ol>
    {children}
    </div>
    </>
  );
}
