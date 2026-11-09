'use client';
import { forwardRef, useEffect, useState } from 'react';
import { LIVE_REFRESH, hkClockSec, mtrLine, mtrStationEn, mtrStationLines, mtrStationName, mtrTrainEta, type MtrDirection, type MtrLineEtas, type MtrTrain } from '@hknt/core';
import { liveClient } from '@/lib/buses';
import { mtrFavorite, useFavorite } from '@/lib/favorites';
import { usePrefs } from '@/lib/prefs';
import Icon from '../Icon';
import { useSheetDrag } from './useSheetDrag';

type Data = { sta: string; lines: MtrLineEtas[]; failed: string[]; at: number };


/**
 * 港鐵站到站時間面板（撳路綫圖個站或者搜尋）：唔遮成幅圖，地圖會移去嗰個站。
 * 手機（sheet）：貼住底邊，有拉柄；半開顯示下班車，向上拉全開見所有班次，向下拉關閉。闊螢幕：右邊面板。
 * 頂部按綫分頁（分頁頂有綫色）；每個方向先顯示下班車（目的地、月台、正在離開／N 分鐘），
 * 「所有班次」展開成個表（目的地｜月台｜下班車，按方向分組）。30 秒更新一次，底部顯示最後更新時間。
 */
const MtrStationSheet = forwardRef<
  HTMLElement,
  { sta: string; onClose: () => void; tab: string | null; onTab: (line: string) => void; all: boolean; onAll: (all: boolean) => void; sheet: boolean }
>(function MtrStationSheet({ sta, onClose, tab, onTab, all, onAll, sheet }, ref) {
  const { etaFormat } = usePrefs();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  // 手機：拉上拉落（同輕鐵面板共用）
  const { setRefs, dragH, full, grab, toggleAll, showTable } = useSheetDrag({ ref, sheet, all, onAll, onClose });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await liveClient.mtr(sta);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) {
          setData({ ...body, sta, at: Date.now() });
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

  const codes = mtrStationLines(sta);
  // 記住上次揀嘅綫（沿住一條綫睇落去）；呢個站冇就揀第一條
  const line = tab && codes.includes(tab) ? tab : codes[0]!;
  const fresh = data?.sta === sta ? data : null;
  const etas = fresh?.lines.find((l) => l.line === line);
  const failed = fresh?.failed.includes(line);
  const info = mtrLine(line)!;
  const empty = sta === 'RAC' ? '暫時冇班次（只喺賽馬日開放）' : '暫時冇班次';

  return (
    <aside
      ref={setRefs}
      className={`mtr-panel card${full ? ' full' : ''}${dragH !== null ? ' dragging' : ''}`}
      aria-label={`${mtrStationName(sta)}站到站時間`}
      style={{ ['--mline' as string]: info.color, ['--mline-ink' as string]: info.ink, height: dragH ?? undefined }}
    >
      {/* 拉柄 + 站名 + 分頁：手機可以拉上拉落 */}
      <div className="mtr-grab" {...grab}>
        <span className="mtr-grab-handle" aria-hidden="true" />
        <header className="mtr-panel-head">
          <div className="mtr-panel-title">
            <h2>{mtrStationName(sta)}</h2>
            <span className="muted">{mtrStationEn(sta)}</span>
          </div>
          <FavButton sta={sta} line={line} />
          <button className="drawer-close" onClick={onClose} aria-label="關閉">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="mtr-tabs" role="tablist" aria-label="路綫">
          {codes.map((c) => {
            const l = mtrLine(c)!;
            return (
              <button key={c} role="tab" aria-selected={c === line} className="mtr-tab" style={{ ['--tab' as string]: l.color }} onClick={() => onTab(c)}>
                {l.zh}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mtr-panel-body" role="tabpanel">
        {etas?.delayed && (
          <p className="mtr-delay">
            <Icon name="warning" size={16} />
            {info.zh}而家有延誤
          </p>
        )}
        {!fresh && !error && <p className="muted mtr-loading">載入中…</p>}
        {!fresh && error && <p className="eta-failed">載入失敗：{error}</p>}
        {fresh && (failed || !etas) && <p className="eta-failed">{info.zh}資料暫時攞唔到，稍後會自動再試</p>}

        {etas?.noData && <p className="muted mtr-nodata">港鐵暫時冇提供{info.zh}嘅到站時間，列車可能照常行駛。</p>}
        {etas && !etas.noData && (
          <>
            <section className="mtr-next" aria-label="下班車">
              {/* 「所有班次」放喺同一行右邊，慳一行位（矮螢幕都見到晒兩個方向） */}
              <div className="mtr-next-head">
                <h3>下班車</h3>
                {etas.dirs.some((d) => d.trains.length > 1) && (
                  <button className="mtr-more" aria-expanded={all} onClick={toggleAll}>
                    {all ? '收埋班次表' : '所有班次'}
                    <Icon name="chevron-down" size={16} />
                  </button>
                )}
              </div>
              {etas.dirs.map((d) => (
                <NextRow key={d.dir} d={d} empty={empty} fmt={etaFormat} />
              ))}
            </section>

            {showTable && etas.dirs.some((d) => d.trains.length) && (
              <table className="mtr-table">
                <thead>
                  <tr>
                    <th>目的地</th>
                    <th>月台</th>
                    <th>下班車</th>
                  </tr>
                </thead>
                {etas.dirs
                  .filter((d) => d.trains.length)
                  .map((d) => (
                    <tbody key={d.dir}>
                      <tr className="mtr-table-dir">
                        <th colSpan={3}>{d.label}</th>
                      </tr>
                      {d.trains.map((t, i) => (
                        <tr key={i}>
                          <td>
                            {t.destName}
                            {t.viaRacecourse && <small className="muted">（經馬場）</small>}
                          </td>
                          <td>
                            <Plat n={t.plat} />
                          </td>
                          <td>
                            <EtaText t={t} fmt={etaFormat} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
              </table>
            )}
          </>
        )}
      </div>

      <footer className="mtr-panel-foot">
        <span className="muted">{fresh ? `最後更新 ${hkClockSec(fresh.at)}` : ' '}</span>
        <button className="mtr-refresh" onClick={() => {
          setLoading(true);
          setNonce((n) => n + 1);
        }} disabled={loading} aria-label="重新整理">
          <Icon name="refresh" size={16} className={loading ? 'spin' : undefined} />
          重新整理
        </button>
      </footer>
    </aside>
  );
});
export default MtrStationSheet;

/** 收藏而家睇緊嗰條綫喺呢個站（同巴士「路線 + 站」一樣；收藏頁、首頁大卡「收藏」會出） */
function FavButton({ sta, line }: { sta: string; line: string }) {
  const [on, toggle] = useFavorite(mtrFavorite(sta, line));
  const what = `${mtrStationName(sta)}站${mtrLine(line)?.zh ?? ''}`;
  return (
    <button className={on ? 'drawer-close mtr-fav on' : 'drawer-close mtr-fav'} onClick={toggle} aria-pressed={on} aria-label={on ? `取消收藏${what}` : `收藏${what}`} title={on ? `取消收藏${what}` : `收藏${what}`}>
      <Icon name={on ? 'star-fill' : 'star'} size={20} />
    </button>
  );
}

/** 下班車：一個方向一行（目的地、月台圈、時間）；後面一班細字 */
function NextRow({ d, empty, fmt }: { d: MtrDirection; empty: string; fmt: 'minutes' | 'clock' }) {
  const [first, second] = d.trains;
  if (!first)
    return (
      <div className="mtr-next-row">
        <span className="mtr-next-dest">{d.label}</span>
        <span className="muted mtr-next-empty">{empty}</span>
      </div>
    );
  const after = second && mtrTrainEta(second, fmt);
  return (
    <div className="mtr-next-row">
      <span className="mtr-next-dest">
        往 {first.destName}
        {first.viaRacecourse && <small className="muted">（經馬場）</small>}
      </span>
      <Plat n={first.plat} />
      <span className="mtr-next-eta">
        <EtaText t={first} fmt={fmt} />
        {after && (
          <small className="muted">
            之後 {after.main}
            {after.unit && ` ${after.unit}`}
          </small>
        )}
      </span>
    </div>
  );
}

function EtaText({ t, fmt }: { t: MtrTrain; fmt: 'minutes' | 'clock' }) {
  const e = mtrTrainEta(t, fmt);
  return (
    <span className={e.now ? 'mtr-eta now' : 'mtr-eta'}>
      <b>{e.main}</b>
      {e.unit && <small> {e.unit}</small>}
    </span>
  );
}

/** 月台：綫色圓圈入面一個數字 */
function Plat({ n }: { n: string }) {
  if (!n) return <span className="mtr-plat-circle empty" />;
  return (
    <span className="mtr-plat-circle" aria-label={`${n} 號月台`} title={`${n} 號月台`}>
      {n}
    </span>
  );
}
