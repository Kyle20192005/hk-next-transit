'use client';
import { forwardRef, useEffect, useState } from 'react';
import { etaParts, hkClock, hkClockSec, LIVE_REFRESH, oppositeTramStation, TRAM_DIR_ZH, TRAM_JOYYOU_NOTE, tramStation, tramStationName, type TramEta, type TramStopDest } from '@hknt/core';
import { usePrefs } from '@/lib/prefs';
import Icon from '../Icon';
import { useSheetDrag } from './useSheetDrag';

type Data = { sta: string; realtime: TramEta[] | null; schedule: TramStopDest[]; fare: number | null; at: number };

/** 每個方向嘅站喺邊度：西行往堅尼地城方向、東行往筲箕灣方向 */
const DIR_HINT: Record<string, string> = { W: '西行 · 往上環、堅尼地城方向', E: '東行 · 往銅鑼灣、筲箕灣方向', S: '往跑馬地', N: '由跑馬地開出', T: '總站' };

/**
 * 電車站面板（撳電車路綫圖個站或者搜尋）：
 * - 電車公司網站有實時就列每班車（往邊、幾分鐘）
 * - 冇就按時間表：每個目的地下幾班（約）、而家大約幾多分鐘一班、頭尾班
 * 「對面」轉去對面方向最近嘅站。手機貼底拉板、闊螢幕右邊面板（同港鐵、輕鐵面板共用）。
 */
const TramStationSheet = forwardRef<HTMLElement, { sta: string; onClose: () => void; all: boolean; onAll: (all: boolean) => void; sheet: boolean; onOpposite: (sta: string) => void }>(function TramStationSheet(
  { sta, onClose, all, onAll, sheet, onOpposite },
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
        const res = await fetch(`/api/tram?sta=${encodeURIComponent(sta)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) {
          setData({ sta, realtime: body.realtime ?? null, schedule: body.schedule ?? [], fare: body.fare ?? null, at: Date.now() });
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
  }, [sta, nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const st = tramStation(sta);
  const fresh = data?.sta === sta ? data : null;
  const now = fresh?.at ?? 0;
  const opp = oppositeTramStation(sta);

  return (
    <aside ref={setRefs} className={`mtr-panel tram-panel card${full ? ' full' : ''}${dragH !== null ? ' dragging' : ''}`} aria-label={`電車${tramStationName(sta)}站班次`} style={{ height: dragH ?? undefined }}>
      <div className="mtr-grab" {...grab}>
        <span className="mtr-grab-handle" aria-hidden="true" />
        <header className="mtr-panel-head">
          <div className="mtr-panel-title">
            <h2>{tramStationName(sta)}</h2>
            <span className="muted">{st?.en}</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="關閉">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="tram-sub">
          <span className="tram-dir">
            <Icon name="tram" size={16} />
            {st?.alightOnly ? '只落客' : DIR_HINT[st?.dir ?? 'T']}
          </span>
          {opp && (
            <button className="tram-opp" onClick={() => onOpposite(opp)} aria-label={`轉去對面嘅${tramStationName(opp)}站（${TRAM_DIR_ZH[tramStation(opp)!.dir]}）`}>
              <Icon name="swap" size={16} />
              對面（{TRAM_DIR_ZH[tramStation(opp)!.dir]}）
            </button>
          )}
        </div>
      </div>

      <div className="mtr-panel-body">
        {!fresh && !error && <p className="muted mtr-loading">載入中…</p>}
        {!fresh && error && <p className="eta-failed">載入失敗：{error}</p>}
        {fresh?.realtime && (
          <section className="mtr-next" aria-label="下一班電車">
            <div className="mtr-next-head">
              <h3>下一班電車</h3>
            </div>
            {fresh.realtime.map((e, i) => {
              const p = etaParts(e.at, now, etaFormat);
              return (
                <div key={i} className="mtr-next-row tram-row">
                  <span className="mtr-next-dest">往 {e.destZh}</span>
                  <span className="mtr-next-eta">
                    <span className={e.arrived || p.main === '即將' ? 'mtr-eta now' : 'mtr-eta'}>
                      <b>{e.arrived ? '已到站' : p.main}</b>
                      {!e.arrived && p.unit && <small> {p.unit}</small>}
                    </span>
                  </span>
                </div>
              );
            })}
          </section>
        )}
        {fresh && !fresh.realtime && (
          <>
            {!fresh.schedule.length && <p className="muted mtr-nodata">{st?.alightOnly ? '呢個站只落客' : '暫時冇時間表資料'}</p>}
            {fresh.schedule.map((d) => (
              <section key={d.dest} className="mtr-next tram-dest" aria-label={`往${tramStationName(d.dest)}`}>
                <div className="mtr-next-head">
                  <h3>往 {tramStationName(d.dest)}</h3>
                  {d.headway !== null && <span className="tram-headway">約每 {d.headway} 分鐘一班</span>}
                </div>
                {d.next.length ? (
                  <div className="mtr-next-row tram-row">
                    <span className="mtr-next-dest muted">下幾班（約）</span>
                    <span className="tram-times">{d.next.map((t) => (etaFormat === 'clock' ? hkClock(t) : Math.round((t - now) / 60000) <= 0 ? '即將' : `${Math.round((t - now) / 60000)} 分`)).join(' · ')}</span>
                  </div>
                ) : (
                  <div className="mtr-next-row tram-row">
                    <span className="mtr-next-dest muted">今日班次已經完</span>
                  </div>
                )}
                {d.first !== null && d.last !== null && (
                  <p className="muted tram-firstlast">
                    頭班約 {hkClock(d.first)} · 尾班約 {hkClock(d.last)}
                  </p>
                )}
              </section>
            ))}
            {fresh.schedule.length > 0 && <p className="muted tram-note">電車公司冇開放實時到站資料，以上按運輸署時間表推算，實際可能早或者遲幾分鐘。</p>}
          </>
        )}
        {fresh && fresh.fare !== null && (
          <p className="tram-fare">
            <Icon name="ticket" size={16} />
            成人 ${fresh.fare.toFixed(1)}（全程同價，落車付款）· {TRAM_JOYYOU_NOTE}
          </p>
        )}
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
export default TramStationSheet;
