'use client';
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { LIVE_REFRESH, LRT_STOPS, hkClockSec, lrtCars, lrtRoute, lrtStopEn, lrtStopName, lrtStopRoutes, lrtTrainEta, type LrtPlatform, type LrtTrain } from '@hknt/core';
import { liveClient } from '@/lib/buses';
import { usePrefs } from '@/lib/prefs';
import Icon from '../Icon';
import { useSheetDrag } from './useSheetDrag';

type Data = { sta: string; platforms: LrtPlatform[]; failed: boolean; at: number };
/** 車費：[八達通成人, 小童, 長者, 殘疾, 學生, 樂悠咭, 單程成人, 單程小童, 單程長者] */
type Fares = Record<string, number[]>;
const fareCache = new Map<string, Promise<Fares>>();
const loadFares = (from: string) => {
  let p = fareCache.get(from);
  if (!p) {
    p = fetch(`/api/lrt/fare?from=${from}`).then(async (r) => {
      if (!r.ok) throw new Error(r.statusText);
      return ((await r.json()) as { fares: Fares }).fares;
    });
    p.catch(() => fareCache.delete(from));
    fareCache.set(from, p);
  }
  return p;
};
const money = (n: number) => `$${n.toFixed(1)}`;
/** 目的地選單：按中文名排 */
const STOP_OPTIONS = Object.keys(LRT_STOPS).sort((a, b) => lrtStopName(a).localeCompare(lrtStopName(b), 'zh-HK'));
/** 車費（揀目的地）：2026-11 用戶要求先隱藏；FareBox 同 /api/lrt/fare 保留（港鐵開放數據 light_rail_fares.csv） */
const SHOW_FARES = false;

/**
 * 輕鐵站面板（撳輕鐵路綫圖個站或者搜尋）：每個月台嘅班次（路線號碼、往邊、單／孖卡、幾分鐘），30 秒更新。
 * 車費（八達通各種、單程票）暫時隱藏（SHOW_FARES）。手機貼底拉板、闊螢幕右邊面板（同港鐵面板共用）。
 */
const LrtStationSheet = forwardRef<HTMLElement, { sta: string; onClose: () => void; all: boolean; onAll: (all: boolean) => void; sheet: boolean }>(function LrtStationSheet(
  { sta, onClose, all, onAll, sheet },
  ref,
) {
  const { etaFormat } = usePrefs();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { setRefs, dragH, full, grab } = useSheetDrag({ ref, sheet, all, onAll, onClose });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await liveClient.lrt(sta);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) {
          setData({ sta, platforms: body.platforms ?? [], failed: !!body.failed, at: Date.now() });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    const id = setInterval(load, LIVE_REFRESH.etaMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // nonce：撳「重新整理」即刻再攞
  }, [sta, nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fresh = data?.sta === sta ? data : null;
  const routes = lrtStopRoutes(sta);
  const now = fresh?.at ?? 0;

  return (
    <aside ref={setRefs} className={`mtr-panel lrt-panel card${full ? ' full' : ''}${dragH !== null ? ' dragging' : ''}`} aria-label={`輕鐵${lrtStopName(sta)}站到站時間`} style={{ height: dragH ?? undefined }}>
      <div className="mtr-grab" {...grab}>
        <span className="mtr-grab-handle" aria-hidden="true" />
        <header className="mtr-panel-head">
          <div className="mtr-panel-title">
            <h2>{lrtStopName(sta)}</h2>
            <span className="muted">{lrtStopEn(sta)}</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="關閉">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="lrt-routes" aria-label="經過路線">
          {routes.map((r) => (
            <RouteChip key={r} r={r} />
          ))}
        </div>
      </div>

      <div className="mtr-panel-body">
        {!fresh && !error && <p className="muted mtr-loading">載入中…</p>}
        {!fresh && error && <p className="eta-failed">載入失敗：{error}</p>}
        {fresh?.failed && <p className="eta-failed">輕鐵資料暫時攞唔到，稍後會自動再試</p>}
        {fresh && !fresh.failed && !fresh.platforms.some((p) => p.trains.length) && <p className="muted mtr-nodata">暫時冇班次</p>}
        {fresh?.platforms
          .filter((p) => p.trains.length)
          .map((p) => (
            <section key={p.platform} className="mtr-next lrt-plat" aria-label={`${p.platform} 號月台`}>
              <div className="mtr-next-head">
                <h3>{p.platform} 號月台</h3>
              </div>
              {p.trains.map((t, i) => (
                <TrainRow key={i} t={t} fmt={etaFormat} now={now} />
              ))}
            </section>
          ))}
        {SHOW_FARES && <FareBox sta={sta} />}
      </div>

      <footer className="mtr-panel-foot">
        <span className="muted">{fresh ? `最後更新 ${hkClockSec(fresh.at)}` : ' '}</span>
        <button
          className="mtr-refresh"
          onClick={() => {
            setLoading(true);
            setNonce((n) => n + 1);
          }}
          disabled={loading}
          aria-label="重新整理"
        >
          <Icon name="refresh" size={16} className={loading ? 'spin' : undefined} />
          重新整理
        </button>
      </footer>
    </aside>
  );
});
export default LrtStationSheet;

/** 路線號碼（路線色邊、白底），同路綫圖嘅號碼一樣 */
export function RouteChip({ r }: { r: string }) {
  return (
    <span className="lrt-chip" style={{ ['--c' as string]: lrtRoute(r)?.color }}>
      {r}
    </span>
  );
}

function TrainRow({ t, fmt, now }: { t: LrtTrain; fmt: 'minutes' | 'clock'; now: number }) {
  const e = lrtTrainEta(t, fmt, now || Date.now());
  return (
    <div className="mtr-next-row lrt-row">
      <RouteChip r={t.route} />
      <span className="mtr-next-dest">往 {t.dest}</span>
      <small className="muted lrt-cars">{lrtCars(t.cars)}</small>
      <span className="mtr-next-eta">
        <span className={e.now ? 'mtr-eta now' : 'mtr-eta'}>
          <b>{e.main}</b>
          {e.unit && <small> {e.unit}</small>}
        </span>
      </span>
    </div>
  );
}

/** 車費：揀目的地，顯示八達通（成人、小童、長者、學生、樂悠咭）同單程票 */
function FareBox({ sta }: { sta: string }) {
  const [to, setTo] = useState('');
  const [fares, setFares] = useState<{ from: string; f: Fares } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    loadFares(sta).then(
      (f) => !off && setFares({ from: sta, f }),
      () => !off && setErr(true),
    );
    return () => {
      off = true;
    };
  }, [sta]);
  const f = fares?.from === sta && to ? fares.f[to] : null;
  const options = useMemo(() => STOP_OPTIONS.filter((id) => id !== sta), [sta]);
  return (
    <section className="lrt-fare" aria-label="車費">
      <label className="lrt-fare-pick">
        <span>車費</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="去邊個站">
          <option value="">揀目的地…</option>
          {options.map((id) => (
            <option key={id} value={id}>
              {lrtStopName(id)}
            </option>
          ))}
        </select>
      </label>
      {err && <p className="muted lrt-fare-note">車費暫時攞唔到</p>}
      {f && (
        <dl className="lrt-fare-grid">
          <div>
            <dt>八達通 成人</dt>
            <dd>{money(f[0]!)}</dd>
          </div>
          <div>
            <dt>小童</dt>
            <dd>{money(f[1]!)}</dd>
          </div>
          <div>
            <dt>長者</dt>
            <dd>{money(f[2]!)}</dd>
          </div>
          <div>
            <dt>學生</dt>
            <dd>{money(f[4]!)}</dd>
          </div>
          <div>
            <dt>樂悠咭</dt>
            <dd>{money(f[5]!)}</dd>
          </div>
          <div>
            <dt>單程票 成人</dt>
            <dd>{money(f[6]!)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
