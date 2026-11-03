'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { busDistanceTo, busFraction, formatDistance, labelEtas, secondsFrom, type Dir, type Eta, type TrackedBus } from '@hknt/core';
import { FOCUS_STOP_EVENT, OPEN_STOP_EVENT, publishBuses } from '@/lib/events';
import StopRow from './StopRow';

type Props = {
  route: string;
  stops: { dir: Dir; stopId: string; name: string }[];
  selectedVariantId: string | null;
  /** 平均行車時間（秒），攞到即時數據之前先用 */
  segSeconds: number[] | null;
  /** 每個站沿走線嘅累計距離（米） */
  cumMetres: number[];
};

const ETA_REFRESH_MS = 30_000;
const BUSES_REFRESH_MS = 20_000;

/**
 * 站點列表：一次只開一個站。
 * - 成條線嘅巴士位置每 20 秒更新（/api/buses），通知地圖
 * - 打開站時：攞到站時間、地圖放大過去；每班車標示「距離 N 個站／未開出」
 * - 後面嘅站顯示由打開咗嘅站出發要幾耐，同下一班車大概幾時到
 */
export default function StopList({ route, stops, selectedVariantId, segSeconds: avgSeg, cumMetres }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<{ buses: TrackedBus[]; segSeconds: number[] } | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const openStop = (i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setError(null);
    if (i === null) return;
    window.dispatchEvent(new CustomEvent(FOCUS_STOP_EVENT, { detail: i }));
    // 將打開咗嘅站嘅站名對齊列表頂部（只捲站點列表，唔郁成頁）
    requestAnimationFrame(() => {
      const row = rows.current[i];
      const box = row?.closest<HTMLElement>('.route-stops');
      if (!row || !box) return;
      const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' });
    });
  };

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
        const res = await fetch(`/api/buses?company=ctb&route=${encodeURIComponent(route)}&v=${selectedVariantId}`);
        if (!res.ok) return;
        const body = (await res.json()) as { buses: { from: number; nextEta: string }[]; segSeconds: number[] };
        if (cancelled) return;
        setLive({ buses: body.buses.map((b) => ({ from: b.from, nextEta: Date.parse(b.nextEta) })), segSeconds: body.segSeconds });
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
  }, [route, selectedVariantId]);

  // 通知地圖
  useEffect(() => {
    if (!live) return;
    publishBuses({ ...live, openIndex });
  }, [live, openIndex]);

  // 打開咗嘅站：攞到站時間
  const open = openIndex !== null ? stops[openIndex] : undefined;
  useEffect(() => {
    if (openIndex === null || !open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/eta?company=ctb&route=${encodeURIComponent(route)}&stop=${open.stopId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (cancelled) return;
        setEtas((body.etas as Eta[]).filter((e) => e.dir === open.dir && e.eta));
        setError(null);
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
  }, [openIndex, open, route]);

  const isMine = (e: Eta) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId;
  const seg = live?.segSeconds ?? avgSeg;
  const travel = useMemo(() => {
    if (!seg || openIndex === null) return null;
    const cum = [0];
    for (const s of seg) cum.push(cum[cum.length - 1]! + s);
    return secondsFrom(cum, openIndex);
  }, [seg, openIndex]);

  // 每班車而家喺邊：用成條線追蹤到嘅巴士對應返呢個站嘅 ETA
  const whereLabels = useMemo(() => {
    if (!live || openIndex === null || !etas) return null;
    const mine = etas.filter(isMine);
    const labels = labelEtas(live.buses, openIndex, mine.map((e) => Date.parse(e.eta!)));
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
  }, [live, openIndex, etas, selectedVariantId, now, cumMetres]);

  // 下一班（揀咗嘅走法）喺打開咗嘅站嘅到站時間
  const nextAtOpen = useMemo(() => {
    const t = etas?.filter(isMine).map((e) => Date.parse(e.eta!)).filter((x) => x >= now - 60_000).sort((a, b) => a - b)[0];
    return t ?? null;
  }, [etas, selectedVariantId, now]);

  return (
    <ol className="stops">
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
            open={openIndex === i}
            onToggle={() => openStop(openIndex === i ? null : i)}
            etas={openIndex === i ? etas : null}
            whereLabels={openIndex === i ? whereLabels : null}
            error={openIndex === i ? error : null}
            now={now}
            selectedVariantId={selectedVariantId}
            travelSeconds={openIndex !== null && i > openIndex ? tr : null}
            travelMetres={openIndex !== null && i > openIndex ? (cumMetres[i] ?? 0) - (cumMetres[openIndex] ?? 0) : null}
            nextArrival={openIndex !== null && i > openIndex && tr !== null && nextAtOpen !== null ? nextAtOpen + tr * 1000 : null}
          />
        );
      })}
    </ol>
  );
}
