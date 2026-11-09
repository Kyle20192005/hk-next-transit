'use client';
import { useMemo, useRef, useState } from 'react';
import { mtrLine, mtrStationEn, mtrStationLines, mtrStationName, searchMtrStations } from '@hknt/core';
import Icon from '../Icon';

/**
 * 港鐵站搜尋（「路線」分頁揀咗港鐵，喺黃色標題列，巴士搜尋欄嘅位）：中文、英文或者站代號。
 * 揀咗就清空、收鍵盤，路綫圖飛去嗰個站並打開到站時間。鍵盤：上下揀、Enter 確認、Esc 清除。
 */
export default function MtrSearch({ onPick }: { onPick: (sta: string) => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchMtrStations(q), [q]);

  const pick = (sta: string) => {
    setQ('');
    input.current?.blur();
    onPick(sta);
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
          placeholder="搜尋車站，例如 旺角、Mong Kok"
          aria-label="搜尋港鐵站"
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
          {results.map((c, i) => (
            <li key={c} role="option" aria-selected={i === hi}>
              <button onClick={() => pick(c)} onMouseEnter={() => setHi(i)}>
                <span className="mtr-result-lines" aria-hidden="true">
                  {mtrStationLines(c).map((l) => (
                    <i key={l} style={{ background: mtrLine(l)?.color }} />
                  ))}
                </span>
                <span className="mtr-result-name">
                  <b>{mtrStationName(c)}</b>
                  <small className="muted">{mtrStationEn(c)}</small>
                </span>
                <small className="muted mtr-result-line-names">{mtrStationLines(c).map((l) => mtrLine(l)?.zh).join('・')}</small>
              </button>
            </li>
          ))}
          {!results.length && <li className="muted mtr-results-empty">搵唔到「{q.trim()}」</li>}
        </ul>
      )}
    </div>
  );
}
