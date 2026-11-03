'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RouteIndex } from '@hknt/core';

export default function RouteSearch({ routes }: { routes: RouteIndex['routes'] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return routes.slice(0, 60);
    return routes.filter((r) => r.route.startsWith(s) || r.origTc?.includes(q) || r.destTc?.includes(q)).slice(0, 100);
  }, [q, routes]);
  return (
    <>
      <input className="search" placeholder="輸入路線或地點，例如 38、北角" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" aria-label="搜尋路線" />
      <ul className="route-list card">
        {shown.map((r) => (
          <li key={r.route}>
            <Link href={`/ctb/${r.route}`}>
              <span className="route-no">{r.route}</span>
              <span style={{ flex: 1 }}>{r.origTc} ⇄ {r.destTc}</span>
              {r.special > 0 && <span className="badge special">{r.special} 個特別走法</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
