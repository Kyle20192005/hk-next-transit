'use client';
import { useMemo, useRef, useState } from 'react';
import { searchTramStations, TRAM_BRAND, TRAM_DIR_ZH, tramStation, tramStationName } from '@hknt/core';
import Icon from '../Icon';

/**
 * 電車站搜尋（「路線」分頁揀咗電車，喺黃色標題列）：中文、英文或者站代號；同名嘅東行、西行站都出（寫明方向）。
 * 揀咗就清空、收鍵盤，地圖飛去嗰個站並打開班次。鍵盤：上下揀、Enter 確認、Esc 清除。
 */
export default function TramSearch({ onPick }: { onPick: (sta: string) => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchTramStations(q, 10), [q]);
  const pick = (s: string) => {
    setQ('');
    input.current?.blur();
    onPick(s);
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
          placeholder="搜尋電車站，例如 銀行街、跑馬地"
          aria-label="搜尋電車站"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="tram-results"
          autoComplete="off"
        />
        {q && (
          <button className="search-clear" onClick={() => setQ('')} aria-label="清除">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {q.trim() && (
        <ul className="mtr-results card" id="tram-results" role="listbox">
          {results.map((s, i) => (
            <li key={s} role="option" aria-selected={i === hi}>
              <button onClick={() => pick(s)} onMouseEnter={() => setHi(i)}>
                <span className="mtr-result-lines" aria-hidden="true">
                  <i style={{ background: TRAM_BRAND.color }} />
                </span>
                <span className="mtr-result-name">
                  <b>{tramStationName(s)}</b>
                  <small className="muted">{tramStation(s)?.en}</small>
                </span>
                <small className="muted mtr-result-line-names">電車 {TRAM_DIR_ZH[tramStation(s)!.dir]}</small>
              </button>
            </li>
          ))}
          {!results.length && <li className="muted mtr-results-empty">搵唔到「{q.trim()}」</li>}
        </ul>
      )}
    </div>
  );
}
