'use client';
import { forwardRef, useEffect, useState } from 'react';
import { shortName, type Dir, type Eta } from '@hknt/core';

type Props = {
  index: number;
  route: string;
  stopId: string;
  dir: Dir;
  name: string;
  /** 用戶揀咗嘅走法；其他走法嘅班次會淡色顯示 */
  selectedVariantId: string | null;
  open: boolean;
  onToggle: () => void;
};

const REFRESH_MS = 30_000;

/** 一個站：撳開顯示實時到站（開住時每 30 秒更新）。開定收由 StopList 控制。 */
const StopRow = forwardRef<HTMLLIElement, Props>(function StopRow(
  { index, route, stopId, dir, name, selectedVariantId, open, onToggle },
  ref,
) {
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/eta?company=ctb&route=${encodeURIComponent(route)}&stop=${stopId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (cancelled) return;
        setEtas((body.etas as Eta[]).filter((e) => e.dir === dir && e.eta));
        setError(null);
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
  }, [open, route, stopId, dir]);

  return (
    <li className={`stop${open ? ' open' : ''}`} ref={ref}>
      <button onClick={onToggle} aria-expanded={open}>
        <span className="seq">{index + 1}</span>
        <span className="stop-name">{name}</span>
      </button>
      {open && (
        <div className="etas" aria-live="polite">
          {error && <div className="muted">載入失敗：{error}</div>}
          {!error && etas === null && <div className="muted">載入中…</div>}
          {!error && etas?.length === 0 && <div className="muted">暫時冇班次</div>}
          {etas?.map((e, i) => {
            const mins = Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
            const v = e.variant;
            const other = Boolean(selectedVariantId && v?.variantId && v.variantId !== selectedVariantId);
            return (
              <div className={`eta-row${other ? ' other' : ''}`} key={i}>
                <span className="eta-min">{mins === 0 ? '即將' : `${mins} 分`}</span>
                <span className="muted">{e.eta!.slice(11, 16)}</span>
                {v?.name && (
                  <span className={`badge${v.special ? ' special' : ''}`} title={v.reason}>
                    {v.special ? shortName({ name: v.name }) : '正常路線'}
                    {v.confidence === 'likely' ? '（推斷）' : ''}
                  </span>
                )}
                {e.remarkTc && <span className="muted">{e.remarkTc}</span>}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
});

export default StopRow;
