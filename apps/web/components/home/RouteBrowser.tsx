'use client';
import Link from 'next/link';
import CompanyTag from '@/components/CompanyTag';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteIndex } from '@hknt/core';
import Keypad from './Keypad';

type Routes = RouteIndex['routes'];
const PAGE = 40;

/**
 * 路線列表：
 * - 搜尋欄固定喺頂部；預設用巴士號碼鍵盤（唔會彈系統鍵盤），撳「地點」轉做打字搜起點／終點
 * - 號碼鍵盤只開可以接落去嘅數字同字母
 * - 無限捲動：每次載入 40 條
 */
export default function RouteBrowser({ routes, updated }: { routes: Routes; updated: string | null }) {
  const [code, setCode] = useState(''); // 路線號碼（鍵盤）
  const [place, setPlace] = useState<string | null>(null); // 地點搜尋（null = 用緊號碼鍵盤）
  const [shown, setShown] = useState(PAGE);
  const listRef = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const placeInput = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (place !== null) {
      const q = place.trim();
      return q ? routes.filter((r) => r.origTc?.includes(q) || r.destTc?.includes(q) || r.route.includes(q.toUpperCase())) : routes;
    }
    return code ? routes.filter((r) => r.route.startsWith(code)) : routes;
  }, [routes, code, place]);

  // 下一個可以打嘅字：所有以而家號碼開頭嘅路線嘅下一個字
  const nextChars = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes) if (r.route.startsWith(code) && r.route.length > code.length) set.add(r.route[code.length]!);
    return set;
  }, [routes, code]);

  // 搜尋條件變咗：由頭顯示
  useEffect(() => {
    setShown(PAGE);
    listRef.current?.scrollTo({ top: 0 });
  }, [code, place]);

  // 無限捲動：見到列表尾就載入多啲
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setShown((n) => n + PAGE), {
      root: listRef.current,
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [matches]);

  const usePlace = () => {
    setPlace('');
    setCode('');
    requestAnimationFrame(() => placeInput.current?.focus());
  };

  return (
    <>
      <div className="search-bar">
        {place === null ? (
          <button className="search-field" onClick={usePlace} aria-label="搜尋路線">
            <span className={code ? 'search-code' : 'search-placeholder'}>{code || '輸入路線號碼'}</span>
            {code && (
              <span
                className="search-clear"
                role="button"
                aria-label="清除"
                onClick={(e) => {
                  e.stopPropagation();
                  setCode('');
                }}
              >
                ✕
              </span>
            )}
          </button>
        ) : (
          <div className="search-field">
            <input
              ref={placeInput}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="輸入地點，例如 北角、中環"
              aria-label="搜尋地點"
              enterKeyHint="search"
            />
            <button className="search-clear" onClick={() => setPlace(null)} aria-label="轉返號碼鍵盤">
              123
            </button>
          </div>
        )}
      </div>

      <ul className="route-list" ref={listRef}>
        {matches.slice(0, shown).map((r) => (
          <li key={r.route}>
            <Link href={`/ctb/${r.route}`} className="route-item">
              <span className="route-id">
                <span className="route-num">{r.route}</span>
                <CompanyTag company="CTB" />
              </span>
              <RouteEnds r={r} />
            </Link>
          </li>
        ))}
        {matches.length === 0 && <li className="empty">搵唔到路線</li>}
        {shown < matches.length && <li ref={sentinel} className="loading-more">載入中…</li>}
        {shown >= matches.length && matches.length > 0 && (
          <li className="list-end muted">
            共 {matches.length} 條路線{updated ? `・數據更新：${updated}` : ''}
            <br />
            資料來源：運輸署、城巴（DATA.GOV.HK）
          </li>
        )}
      </ul>

      {place === null && (
        <Keypad
          nextChars={nextChars}
          onKey={(k) => setCode((c) => c + k)}
          onBack={() => setCode((c) => c.slice(0, -1))}
          onPlace={usePlace}
          canBack={code.length > 0}
        />
      )}
    </>
  );
}

/**
 * 起訖點：
 * - 雙向：「中環 (港澳碼頭)」/「⇄ 跑馬地 (上)」
 * - 單向：「往 X」/「由 Y」
 * - 循環線（起訖點一樣）：「X」/「循環線」
 */
function RouteEnds({ r }: { r: Routes[number] }) {
  const dirs = r.dirs ?? ['O'];
  if (r.origTc === r.destTc) {
    return (
      <span className="route-text">
        <span className="route-to">{r.origTc}</span>
        <span className="route-from">循環線</span>
      </span>
    );
  }
  if (dirs.includes('O') && dirs.includes('I')) {
    return (
      <span className="route-text" aria-label={`來往 ${r.origTc} 及 ${r.destTc}`}>
        <span className="route-to">{r.origTc}</span>
        <span className="route-to">
          <span className="route-arrow" aria-hidden="true">⇄</span> {r.destTc}
        </span>
      </span>
    );
  }
  // 單向：只有回程（I）就倒轉
  const [from, to] = dirs.includes('I') ? [r.destTc, r.origTc] : [r.origTc, r.destTc];
  return (
    <span className="route-text">
      <span className="route-to">往 {to}</span>
      <span className="route-from">由 {from}</span>
    </span>
  );
}
