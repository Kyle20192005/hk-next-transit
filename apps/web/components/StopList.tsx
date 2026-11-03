'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { busPositions, secondsFrom, type Dir, type Eta } from '@hknt/core';
import { BUS_ETAS_EVENT, FOCUS_STOP_EVENT, OPEN_STOP_EVENT, type BusEtasDetail } from '@/lib/events';
import StopRow from './StopRow';

type Props = {
  route: string;
  stops: { dir: Dir; stopId: string; name: string }[];
  selectedVariantId: string | null;
  /** 累計行車秒數（同 stops 一樣長）；冇數據就 null */
  cum: number[] | null;
};

const REFRESH_MS = 30_000;

/**
 * 站點列表：一次只開一個站。
 * - 打開時：攞到站時間（每 30 秒更新）、地圖放大過去、地圖推算巴士位置
 * - 後面嘅站顯示由打開咗嘅站出發要幾耐，同下一班車大概幾時到
 */
export default function StopList({ route, stops, selectedVariantId, cum }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const openStop = (i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setError(null);
    if (i === null) {
      window.dispatchEvent(new CustomEvent<BusEtasDetail>(BUS_ETAS_EVENT, { detail: { stopIndex: null, etas: [] } }));
      return;
    }
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
        const list = (body.etas as Eta[]).filter((e) => e.dir === open.dir && e.eta);
        setEtas(list);
        setError(null);
        // 地圖只畫揀咗嘅走法（或者推斷唔到走法）嘅車
        const mine = list.filter((e) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId);
        window.dispatchEvent(new CustomEvent<BusEtasDetail>(BUS_ETAS_EVENT, { detail: { stopIndex: openIndex, etas: mine } }));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [openIndex, open, route, selectedVariantId]);

  const travel = useMemo(() => (cum && openIndex !== null ? secondsFrom(cum, openIndex) : null), [cum, openIndex]);
  // 下一班（揀咗嘅走法）喺打開咗嘅站嘅到站時間
  const nextAtOpen = useMemo(() => {
    const mine = etas?.filter((e) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId);
    const t = mine?.map((e) => Date.parse(e.eta!)).filter((x) => x >= now - 60_000).sort((a, b) => a - b)[0];
    return t ?? null;
  }, [etas, selectedVariantId, now]);

  // 每班車而家喺邊（只計揀咗嘅走法，其他走法經過嘅站唔同）
  const whereLabels = useMemo(() => {
    if (!cum || openIndex === null || !etas) return null;
    return etas.map((e) => {
      if (selectedVariantId && e.variant?.variantId && e.variant.variantId !== selectedVariantId) return null;
      const [p] = busPositions(cum, openIndex, [e], new Date(now));
      if (!p) return null;
      if (p.state === 'notDeparted') return '未開出';
      if (p.state === 'at' || (p.state === 'between' && p.from === openIndex - 1 && p.fraction > 0.7)) return '即將到站';
      return `距離 ${openIndex - p.from} 個站`;
    });
  }, [cum, openIndex, etas, selectedVariantId, now]);

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
            nextArrival={openIndex !== null && i > openIndex && tr !== null && nextAtOpen !== null ? nextAtOpen + tr * 1000 : null}
          />
        );
      })}
    </ol>
  );
}
