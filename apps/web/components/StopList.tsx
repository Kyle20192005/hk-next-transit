'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BusStabilizer, busDistanceTo, busFraction, formatDistance, labelEtas, secondsFrom, type Dir, type Eta, type TrackedBus } from '@hknt/core';
import { OPEN_STOP_EVENT, publishBuses, publishFocus } from '@/lib/events';
import StopRow, { type RowBus } from './StopRow';
import { companyColor, companyInk } from '@/lib/company';

type Props = {
  /** 路線檔位置（ctb 包聯營線、kmb 包九巴同龍運） */
  co: 'ctb' | 'kmb';
  /** 多過一間公司營辦（聯營線）：每班車標明公司 */
  multiCompany: boolean;
  route: string;
  stops: { dir: Dir; stopId: string; name: string }[];
  selectedVariantId: string | null;
  /** 平均行車時間（秒），攞到即時數據之前先用 */
  segSeconds: number[] | null;
  /** 每個站沿走線嘅累計距離（米） */
  cumMetres: number[];
  /** 路線主要公司（時間線同巴士用公司代表色） */
  company: string;
  /** 一開頁就打開嘅站（由「附近」撳入嚟） */
  initialOpen: number | null;
};

const ETA_REFRESH_MS = 30_000;
const BUSES_REFRESH_MS = 20_000;

/**
 * 站點列表：一次只開一個站。
 * - 成條線嘅巴士位置每 20 秒更新（/api/buses），通知地圖
 * - 打開站時：攞到站時間、地圖放大過去；每班車標示「距離 N 個站／未開出」
 * - 後面嘅站顯示由打開咗嘅站出發要幾耐，同下一班車大概幾時到
 */
export default function StopList({ co, multiCompany, route, stops, selectedVariantId, segSeconds: avgSeg, cumMetres, company, initialOpen }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<{ buses: TrackedBus[]; segSeconds: number[] } | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const openStop = (i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setError(null);
    if (i === null) return;
    publishFocus(i);
    // 將打開咗嘅站嘅站名對齊列表頂部（只捲站點列表，唔郁成頁）
    requestAnimationFrame(() => {
      const row = rows.current[i];
      const box = row?.closest<HTMLElement>('.route-stops');
      if (!row || !box) return;
      const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' });
    });
  };

  // 一開頁就打開指定嘅站
  useEffect(() => {
    if (initialOpen !== null) openStop(initialOpen);
  }, [initialOpen]);

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
        const res = await fetch(`/api/buses?co=${co}&route=${encodeURIComponent(route)}&v=${selectedVariantId}`);
        if (!res.ok) return;
        const body = (await res.json()) as { buses: { from: number; nextEta: string; company?: string }[]; segSeconds: number[] };
        if (cancelled) return;
        setLive({ buses: body.buses.map((b) => ({ from: b.from, nextEta: Date.parse(b.nextEta), company: b.company })), segSeconds: body.segSeconds });
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
        const res = await fetch(`/api/eta?co=${co}&route=${encodeURIComponent(route)}&stop=${open.stopId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (cancelled) return;
        setEtas((body.etas as Eta[]).filter((e) => e.dir === open.dir && e.eta));
        setFailed((body.failed as string[] | undefined) ?? []);
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
  }, [openIndex, open, co, route]);

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
    // 九巴「原定班次」唔係實時，唔配對巴士位置
    const mine = etas.filter((e) => isMine(e) && !e.scheduled);
    const labels = labelEtas(live.buses, openIndex, mine.map((e) => Date.parse(e.eta!)), live.segSeconds, now);
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

  // 時間線上嘅巴士：每 5 秒按時間推前；同地圖一樣只准向前
  const [busNow, setBusNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setBusNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  const stabilizer = useMemo(() => new BusStabilizer(), []);
  const rowBuses = useMemo(() => {
    const out = new Map<number, RowBus[]>();
    if (!live) return out;
    const last = stops.length - 1;
    for (const { id, bus, progress } of stabilizer.update(live.buses, live.segSeconds, busNow)) {
      const from = Math.min(Math.floor(progress), last - 1);
      const f = Math.min(1, progress - from);
      // 兩站之間：前半段畫喺上一個站嗰行嘅下半，後半段畫喺下一個站嗰行嘅上半
      const [row, half, t] = f < 0.5 ? [from, 'below' as const, f * 2] : [from + 1, 'above' as const, (f - 0.5) * 2];
      const mins = Math.max(0, Math.round((bus.nextEta - busNow) / 60000));
      const label = mins === 0 ? `即將到 ${stops[from + 1]?.name ?? ''}` : `約 ${mins} 分鐘到 ${stops[from + 1]?.name ?? ''}`;
      out.set(row, [...(out.get(row) ?? []), { key: id, half, t, label, color: companyColor(multiCompany ? (bus.company ?? company) : company), ink: companyInk(multiCompany ? (bus.company ?? company) : company) }]);
    }
    return out;
  }, [live, busNow, stabilizer, stops, multiCompany, company]);

  return (
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
            terminus={i === 0 || i === stops.length - 1}
            buses={rowBuses.get(i) ?? []}
            open={openIndex === i}
            onToggle={() => openStop(openIndex === i ? null : i)}
            etas={openIndex === i ? etas : null}
            whereLabels={openIndex === i ? whereLabels : null}
            error={openIndex === i ? error : null}
            failed={openIndex === i ? failed : []}
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
