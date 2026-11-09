'use client';
import { useEffect, useState } from 'react';
import { LIVE_REFRESH, mtrLine, mtrStationEn, mtrStationLines, mtrStationName, type MtrLineEtas } from '@hknt/core';
import { liveClient } from '@/lib/buses';
import EtaInline from '../EtaInline';
import Icon from '../Icon';

/**
 * 港鐵站到站時間（撳路綫圖個站彈出）：每條綫兩個方向，每班車分鐘同月台；轉車站列晒所有綫。
 * 30 秒更新一次（先問 tracker，出錯退返 /api/mtr）。
 */
export default function MtrStationSheet({ sta, onClose }: { sta: string; onClose: () => void }) {
  const [data, setData] = useState<{ sta: string; lines: MtrLineEtas[]; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.mtr(sta);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, LIVE_REFRESH.etaMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines = data?.sta === sta ? data.lines : null;
  return (
    <div className="sheet-backdrop mtr-backdrop" onClick={onClose}>
      <div className="sheet card mtr-sheet" role="dialog" aria-label={`${mtrStationName(sta)}站到站時間`} onClick={(e) => e.stopPropagation()}>
        <header className="mtr-sheet-head">
          <div>
            <h2>{mtrStationName(sta)}</h2>
            <span className="muted">{mtrStationEn(sta)}</span>
          </div>
          <div className="mtr-chips">
            {mtrStationLines(sta).map((c) => {
              const l = mtrLine(c)!;
              return (
                <span key={c} className="mtr-chip" style={{ background: l.color, color: l.ink }}>
                  {l.zh}
                </span>
              );
            })}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="關閉">
            <Icon name="close" size={20} />
          </button>
        </header>
        {error && <p className="muted">載入失敗：{error}</p>}
        {!lines && !error && <p className="muted">載入中…</p>}
        {lines?.map((l) => {
          const info = mtrLine(l.line)!;
          return (
            <section key={l.line} className="mtr-line-block" style={{ ['--line' as string]: info.color }}>
              <h3>
                <span className="mtr-line-bar" />
                {info.zh}
                {l.delayed && <span className="badge special">延誤</span>}
              </h3>
              {l.dirs.map((d) => {
                const plats = [...new Set(d.trains.map((t) => t.plat))];
                const dests = [...new Set(d.trains.map((t) => t.dest))];
                return (
                  <div key={d.dir} className="mtr-dir">
                    <div className="mtr-dir-head">
                      <b>{d.label}</b>
                      {plats.length === 1 && <span className="mtr-plat">{plats[0]} 號月台</span>}
                    </div>
                    {!d.trains.length ? (
                      <div className="muted">{sta === 'RAC' ? '暫時冇班次（只喺賽馬日開放）' : '暫時冇班次'}</div>
                    ) : dests.length === 1 && plats.length === 1 ? (
                      <div className="mtr-etas">
                        <EtaInline ats={d.trains.map((t) => Date.parse(t.time))} now={now} />
                      </div>
                    ) : (
                      // 同一方向去唔同地方（例如東鐵羅湖／落馬洲）：逐班列
                      <ul className="mtr-trains">
                        {d.trains.map((t, i) => (
                          <li key={i}>
                            <span className="mtr-etas">
                              <EtaInline ats={[Date.parse(t.time)]} now={now} />
                            </span>
                            <span>往 {t.destName}{t.viaRacecourse ? '（經馬場）' : ''}</span>
                            {plats.length > 1 && <span className="mtr-plat">{t.plat} 號月台</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        {data?.failed.length ? <p className="eta-failed">{data.failed.map((c) => mtrLine(c)?.zh ?? c).join('、')}資料暫時攞唔到，稍後會自動再試</p> : null}
        <p className="muted mtr-source">資料來源：港鐵公司（DATA.GOV.HK）。路綫圖係簡化示意圖。</p>
      </div>
    </div>
  );
}
