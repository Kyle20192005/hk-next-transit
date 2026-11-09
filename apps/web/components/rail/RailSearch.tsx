'use client';
import { useMemo, useRef, useState } from 'react';
import { lrtRoute, lrtStopEn, lrtStopName, lrtStopRoutes, mtrLine, mtrStationEn, mtrStationLines, mtrStationName, searchLrtStops, searchMtrStations } from '@hknt/core';
import Icon from '../Icon';

type Hit = { sta: string; lrt: boolean };

/**
 * 港鐵站同輕鐵站搜尋（「路線」分頁揀咗港鐵・輕鐵，喺黃色標題列，巴士搜尋欄嘅位）：中文、英文或者站代號。
 * 港鐵站排先、輕鐵站跟住（同名嘅例如屯門、元朗兩樣都出）。揀咗就清空、收鍵盤，切換去嗰幅路綫圖、飛去嗰個站並打開到站時間。
 * 鍵盤：上下揀、Enter 確認、Esc 清除。
 */
export default function RailSearch({ onPick }: { onPick: (sta: string, lrt: boolean) => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo<Hit[]>(() => [...searchMtrStations(q, 6).map((sta) => ({ sta, lrt: false })), ...searchLrtStops(q, 6).map((sta) => ({ sta, lrt: true }))], [q]);

  const pick = (h: Hit) => {
    setQ('');
    input.current?.blur();
    onPick(h.sta, h.lrt);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    } else if (e.key === 'Enter' && results.length) {
      e.preventDefault();
      pick(results[Math.min(hi, results.length - 1)]!);
    } else if (e.key === 'Escape') setQ('');
  };

  return (
    <div className="mtr-search">
      <div className="search-field">
        <Icon name="search" size={20} className="search-icon" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          onKeyDown={onKey}
          placeholder="搜尋港鐵站、輕鐵站，例如 旺角、天水圍"
          aria-label="搜尋港鐵站同輕鐵站"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="mtr-results"
          autoComplete="off"
        />
        {q && (
          <button className="search-clear" onClick={() => setQ('')} aria-label="清除">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {q.trim() && (
        <ul className="mtr-results card" id="mtr-results" role="listbox">
          {results.map((h, i) => {
            const colors = h.lrt ? lrtStopRoutes(h.sta).map((r) => lrtRoute(r)?.color) : mtrStationLines(h.sta).map((l) => mtrLine(l)?.color);
            return (
              <li key={`${h.lrt ? 'l' : 'm'}${h.sta}`} role="option" aria-selected={i === hi}>
                <button onClick={() => pick(h)} onMouseEnter={() => setHi(i)}>
                  <span className="mtr-result-lines" aria-hidden="true">
                    {colors.slice(0, 4).map((c, k) => (
                      <i key={k} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="mtr-result-name">
                    <b>{h.lrt ? lrtStopName(h.sta) : mtrStationName(h.sta)}</b>
                    <small className="muted">{h.lrt ? lrtStopEn(h.sta) : mtrStationEn(h.sta)}</small>
                  </span>
                  <small className="muted mtr-result-line-names">{h.lrt ? `輕鐵 ${lrtStopRoutes(h.sta).join('・')}` : mtrStationLines(h.sta).map((l) => mtrLine(l)?.zh).join('・')}</small>
                </button>
              </li>
            );
          })}
          {!results.length && <li className="muted mtr-results-empty">搵唔到「{q.trim()}」</li>}
        </ul>
      )}
    </div>
  );
}
