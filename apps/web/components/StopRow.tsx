'use client';
import { forwardRef } from 'react';
import { formatDistance, shortName, type Eta } from '@hknt/core';

type Props = {
  index: number;
  name: string;
  open: boolean;
  onToggle: () => void;
  /** 打開咗先有：到站時間 */
  etas: Eta[] | null;
  /** 每班車而家喺邊（同 etas 對應），例如「距離 3 個站」 */
  whereLabels: (string | null)[] | null;
  error: string | null;
  now: number;
  selectedVariantId: string | null;
  /** 由打開咗嘅站去呢個站要幾多秒（只有後面嘅站先有） */
  travelSeconds: number | null;
  /** 由打開咗嘅站沿路線去呢個站有幾遠（米） */
  travelMetres: number | null;
  /** 下一班車預計幾時到呢個站（毫秒） */
  nextArrival: number | null;
};

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });

/** 一個站。開定收、到站時間由 StopList 控制。 */
const StopRow = forwardRef<HTMLLIElement, Props>(function StopRow(
  { index, name, open, onToggle, etas, whereLabels, error, now, selectedVariantId, travelSeconds, travelMetres, nextArrival },
  ref,
) {
  return (
    <li className={`stop${open ? ' open' : ''}`} ref={ref}>
      <button onClick={onToggle} aria-expanded={open}>
        <span className="seq">{index + 1}</span>
        <span className="stop-name">
          {name}
          {travelSeconds !== null && travelSeconds > 0 && (
            <span className="travel" title="由打開咗嘅站出發（行車時間係實測平均，僅供參考）">
              +{Math.max(1, Math.round(travelSeconds / 60))} 分
              {travelMetres !== null && travelMetres > 0 && <span className="muted"> · {formatDistance(travelMetres)}</span>}
              {nextArrival !== null && <span className="muted"> · 約 {hhmm(nextArrival)}</span>}
            </span>
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
            const other = Boolean(selectedVariantId && v?.variantId && v.variantId !== selectedVariantId);
            return (
              <div className={`eta-row${other ? ' other' : ''}`} key={i}>
                <span className="eta-min">{mins === 0 ? '即將' : `${mins} 分`}</span>
                <span className="muted">{e.eta!.slice(11, 16)}</span>
                {/* 揀咗嘅走法唔使再標；其他走法先標出嚟 */}
                {v?.name && (!selectedVariantId || v.variantId !== selectedVariantId) && (
                  <span className={`badge${v.special ? ' special' : ''}`} title={v.reason}>
                    {v.special ? shortName({ name: v.name }) : '正常路線'}
                    {v.confidence === 'likely' ? '（推斷）' : ''}
                  </span>
                )}
                {whereLabels?.[i] && <span className="where">{whereLabels[i]}</span>}
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
