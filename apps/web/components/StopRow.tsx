'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shortName, type Dir, type Eta } from '@hknt/core';

type Props = {
  /** 喺列表入面嘅位置（由 0 開始），地圖用嚟對應 */
  index: number;
  route: string;
  stopId: string;
  dir: Dir;
  name: string;
  /** 用戶揀咗嘅走法；其他走法嘅班次會淡色顯示 */
  selectedVariantId: string | null;
};

const REFRESH_MS = 30_000;
/** 地圖撳站 → 打開呢行 */
export const OPEN_STOP_EVENT = 'hknt:open-stop';
/** 打開呢行 → 地圖移去呢個站 */
export const FOCUS_STOP_EVENT = 'hknt:focus-stop';

export default function StopRow({ index, route, stopId, dir, name, selectedVariantId }: Props) {
  const [open, setOpen] = useState(false);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLLIElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/eta?company=ctb&route=${encodeURIComponent(route)}&stop=${stopId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setEtas((body.etas as Eta[]).filter((e) => e.dir === dir && e.eta));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setNow(Date.now());
  }, [route, stopId, dir]);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [open, load]);

  // 地圖撳咗呢個站
  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<number>).detail !== index) return;
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(OPEN_STOP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STOP_EVENT, onOpen);
  }, [index]);

  const toggle = () => {
    setOpen((o) => {
      if (!o) window.dispatchEvent(new CustomEvent(FOCUS_STOP_EVENT, { detail: index }));
      return !o;
    });
  };

  return (
    <li className="stop" ref={ref}>
      <button onClick={toggle} aria-expanded={open}>
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
}
