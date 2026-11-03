'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Dir, Eta } from '@hknt/core';

type Props = {
  seq: number;
  route: string;
  stopId: string;
  dir: Dir;
  name: string;
  /** 只有部分走法停呢個站時，列出係邊幾個 */
  onlyVariants: string[];
  /** 停呢個站嘅走法全部都係特別班 */
  onlySpecial: boolean;
};

const REFRESH_MS = 30_000;

export default function StopRow({ seq, route, stopId, dir, name, onlyVariants, onlySpecial }: Props) {
  const [open, setOpen] = useState(false);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  return (
    <li className="stop">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="seq">{seq}</span>
        <span className="stop-name">
          {name}
          {onlyVariants.length > 0 && (
            <>
              {' '}
              <span className={`badge${onlySpecial ? ' special' : ''}`}>只限{onlyVariants.join('、')}</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="etas" aria-live="polite">
          {error && <div className="muted">載入失敗：{error}</div>}
          {!error && etas === null && <div className="muted">載入中…</div>}
          {!error && etas?.length === 0 && <div className="muted">暫時冇班次</div>}
          {etas?.map((e, i) => {
            const mins = Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
            const v = e.variant;
            return (
              <div className="eta-row" key={i}>
                <span className="eta-min">{mins === 0 ? '即將' : `${mins} 分`}</span>
                <span className="muted">{e.eta!.slice(11, 16)}</span>
                {v?.name && (
                  <span className={`badge${v.special ? ' special' : ''}`} title={v.reason}>
                    {v.name.match(/[（(]([^）)]+)[）)]\s*$/)?.[1] ?? v.name}
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
