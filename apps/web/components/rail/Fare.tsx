'use client';
import { forwardRef, useEffect, useState } from 'react';
import { AEL_ONLY_STATIONS, fareMoney, lrtStopName, mtrStationName, RAIL_FARE_TYPES, type FareEnds, type FareRole } from '@hknt/core';
import Icon from '../Icon';
import { useSheetDrag } from './useSheetDrag';

/**
 * 路綫圖車費計算（右上角「車費」）：撳站 → 站上面彈出「起點｜終點」揀；起點、終點喺圖上有紅／藍標記；
 * 揀齊就喺面板顯示車費（港鐵、輕鐵分開，/api/mtr/fare、/api/lrt/fare）。App 版 src/components/Fare.tsx。
 */

/** 起點紅、終點藍（同彈出選單、圖上標記、面板一樣） */
export const FARE_COLOR: Record<FareRole, string> = { from: '#C0392B', to: '#2E6FBF' };
const LABEL: Record<FareRole, string> = { from: '起點', to: '終點' };
const ICON = { from: 'arrow-ne', to: 'arrow-se' } as const;

/** 細方格圖示（紅底箭咀向右上 = 起點、藍底向右下 = 終點） */
export function FareIcon({ role, size = 22 }: { role: FareRole; size?: number }) {
  return (
    <span className="fare-ico" style={{ background: FARE_COLOR[role], width: size, height: size }} aria-hidden="true">
      <Icon name={ICON[role]} size={Math.round(size * 0.78)} />
    </span>
  );
}

/** 撳站之後喺站上面彈出：揀做起點定終點（深色底，下面有尖角指住個站） */
export function FarePopover({ onPick }: { onPick: (role: FareRole) => void }) {
  return (
    // 撳選單唔好傳俾地圖（否則地圖當撳咗個站、或者開始拖）
    <div className="fare-pop" role="menu" aria-label="揀起點定終點" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {(['from', 'to'] as const).map((r, i) => (
        <span key={r} className="fare-pop-item">
          {i > 0 && <span className="fare-pop-sep" aria-hidden="true" />}
          <button role="menuitem" onClick={() => onPick(r)}>
            <FareIcon role={r} size={26} />
            {LABEL[r]}
          </button>
        </span>
      ))}
    </div>
  );
}

/** 圖上起點／終點標記（喺站上面） */
export function FarePin({ role }: { role: FareRole }) {
  return (
    <span className="fare-pin" style={{ ['--fc' as string]: FARE_COLOR[role] }} aria-label={LABEL[role]}>
      <FareIcon role={role} size={20} />
      {LABEL[role]}
    </span>
  );
}

type Table = Record<string, (number | null)[]>;
const cache = new Map<string, Promise<Table>>();
const loadFares = (lrt: boolean, from: string) => {
  const key = `${lrt ? 'lrt' : 'mtr'}:${from}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/${lrt ? 'lrt' : 'mtr'}/fare?from=${from}`).then(async (r) => {
      if (!r.ok) throw new Error(r.statusText);
      return ((await r.json()) as { fares: Table }).fares;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
};

/**
 * 車費面板（手機貼底拉板、闊螢幕右邊，同站面板一樣）：起點 → 終點（可以對調），揀齊就列出八達通、單程票各種車費。
 */
const FareSheet = forwardRef<HTMLElement, { lrt: boolean; ends: FareEnds; onSwap: () => void; onClear: () => void; onClose: () => void; sheet: boolean }>(function FareSheet(
  { lrt, ends, onSwap, onClear, onClose, sheet },
  ref,
) {
  const { setRefs, dragH, full, grab } = useSheetDrag({ ref, sheet, all: false, onAll: () => {}, onClose });
  const [fares, setFares] = useState<{ key: string; f: Table } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = (s: string) => (lrt ? lrtStopName(s) : mtrStationName(s));
  const key = `${lrt ? 'l' : 'm'}:${ends.from}`;
  useEffect(() => {
    if (!ends.from) return;
    let off = false;
    loadFares(lrt, ends.from).then(
      (f) => !off && (setFares({ key, f }), setErr(null)),
      () => !off && setErr('車費暫時攞唔到'),
    );
    return () => {
      off = true;
    };
  }, [lrt, ends.from, key]);
  const loaded = !!ends.from && fares?.key === key;
  const row = ends.from && ends.to && loaded ? fares!.f[ends.to] : undefined;
  // 機場、博覽館：只計到同香港、九龍、青衣（機場快綫）之間
  const ael = !lrt && [ends.from, ends.to].some((s) => s && AEL_ONLY_STATIONS.includes(s));
  const noRow = !!(ends.from && ends.to && loaded && !row);

  return (
    <aside ref={setRefs} className={`mtr-panel fare-panel card${full ? ' full' : ''}${dragH !== null ? ' dragging' : ''}`} aria-label={`${lrt ? '輕鐵' : '港鐵'}車費`} style={{ height: dragH ?? undefined }}>
      <div className="mtr-grab" {...grab}>
        <span className="mtr-grab-handle" aria-hidden="true" />
        <header className="mtr-panel-head">
          <div className="mtr-panel-title">
            <h2>車費</h2>
            <span className="muted">{lrt ? '輕鐵' : '港鐵'} · 撳站揀起點同終點</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="結束車費計算">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="fare-ends">
          <div className="fare-ends-list">
            {(['from', 'to'] as const).map((r) => (
              <div key={r} className={`fare-end${ends[r] ? '' : ' empty'}`}>
                <FareIcon role={r} />
                <span>{ends[r] ? `${name(ends[r]!)}站` : `撳圖上嘅站揀${LABEL[r]}`}</span>
              </div>
            ))}
          </div>
          <button className="fare-swap" onClick={onSwap} disabled={!ends.from && !ends.to} aria-label="起點終點對調">
            <Icon name="swap" size={20} />
          </button>
        </div>
      </div>
      <div className="mtr-panel-body">
        {noRow && <p className="muted fare-note">{ael ? '機場快綫車費只計香港、九龍、青衣、機場、博覽館之間，其他站要分開計。' : '冇呢兩個站之間嘅車費資料。'}</p>}
        {ends.from && ends.to && !loaded && !err && <p className="muted fare-note">載入中…</p>}
        {err && <p className="eta-failed">{err}</p>}
        {row && (
          <>
            <div className="fare-main">
              <span className="muted">八達通（成人）</span>
              <strong>{fareMoney(row[0])}</strong>
            </div>
            {(['八達通', '單程票'] as const).map((g) => (
              <section key={g} className="fare-group" aria-label={g}>
                <h3>{g}</h3>
                <dl>
                  {RAIL_FARE_TYPES.filter((x) => x.group === g).map((x) => (
                    <div key={x.i}>
                      <dt>{x.zh}</dt>
                      <dd>{fareMoney(row[x.i])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            {ael && <p className="muted fare-note">機場快綫只有成人同小童車費。</p>}
            <p className="muted fare-note">車費來自港鐵開放數據，以港鐵公佈為準；未計轉乘優惠同其他折扣。</p>
          </>
        )}
      </div>
      {(ends.from || ends.to) && (
        <footer className="mtr-panel-foot">
          <span className="muted">{lrt ? '輕鐵' : '港鐵'}車費</span>
          <button className="mtr-refresh" onClick={onClear}>
            <Icon name="close" size={16} />
            清除
          </button>
        </footer>
      )}
    </aside>
  );
});
export default FareSheet;
