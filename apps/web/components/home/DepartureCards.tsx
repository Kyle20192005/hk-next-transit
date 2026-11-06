'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { busDepartureRows, formatDistance, groupStopHeads, minutesLabel, type DepartureRow, type HereRouteLike, type StopHead } from '@hknt/core';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';
import type { Co } from '@/lib/data';
import type { NearStop } from './Nearby';

const MAX_CARDS = 5;
const ROWS = 4;
const REFRESH_MS = 30_000;

/**
 * 首頁「附近」：一張卡 = 一個站頭（40 米內各公司嘅站併埋），每張只顯示最快到嘅 4 班（每條線一班）。
 * 打橫掃睇第二、第三近；卡入咗畫面先載入到站時間（`/api/here`），避免一次過 call 太多。
 * 卡嘅結構通用（core `DepartureRow`），將來港鐵站卡用同一款。App 版 apps/mobile/src/components/DepartureCards.tsx。
 */
export default function DepartureCards({ stops }: { stops: NearStop[] }) {
  const heads = groupStopHeads(stops).slice(0, MAX_CARDS);
  return (
    <div className="dep-cards" role="list" aria-label="附近站頭">
      {heads.map((h, i) => (
        <DepartureCard key={h.key} head={h} eager={i < 2} />
      ))}
    </div>
  );
}

function DepartureCard({ head, eager }: { head: StopHead<NearStop>; eager: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  const [rows, setRows] = useState<DepartureRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/here?lat=${head.lat}&lng=${head.lng}`);
        const body = (await res.json()) as { routes?: HereRouteLike[] };
        const t = Date.now();
        if (!cancelled && res.ok) {
          setRows(busDepartureRows(body.routes ?? [], t, ROWS));
          setNow(t);
        }
      } catch {
        if (!cancelled) setRows((r) => r ?? []);
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible, head.lat, head.lng]);

  const accent = rows?.[0]?.badge.bg ?? 'var(--line)';
  return (
    <div className="dep-card card" role="listitem" ref={ref} style={{ ['--dep-accent' as string]: accent }}>
      <div className="dep-head">
        <Icon name="pin" size={18} />
        <strong>{head.name}</strong>
        <span className="muted">· {formatDistance(head.distance)}</span>
      </div>
      <div className="dep-rows">
        {rows === null && <div className="dep-empty muted">載入中…</div>}
        {rows?.length === 0 && <div className="dep-empty muted">暫時冇班次</div>}
        {rows?.map((r) => (
          <Link
            key={r.key}
            href={`/${r.link.co}/${r.link.route}?dir=${r.link.dir}${r.link.stop ? `&stop=${r.link.stop}` : ''}`}
            className="dep-row"
            onPointerDown={() => warmRoute(r.link.co as Co, r.link.route, { dir: r.link.dir, stopId: r.link.stop })}
          >
            <span className="dep-badge" style={{ background: r.badge.bg, color: r.badge.ink }}>
              {r.badge.text}
            </span>
            <span className="dep-dest">往 {r.dest}</span>
            <span className="dep-min">
              {r.scheduled && <span className="scheduled">原定</span>}
              {minutesLabel(r.at, now)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
