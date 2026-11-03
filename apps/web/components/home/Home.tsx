'use client';
import { useState } from 'react';
import type { RouteIndex } from '@hknt/core';
import RouteBrowser from './RouteBrowser';
import Nearby from './Nearby';

type Tab = 'routes' | 'nearby';

/** 首頁：「路線」（號碼鍵盤 + 無限捲動）同「附近」（定位搵車站） */
export default function Home({ routes, updated }: { routes: RouteIndex['routes']; updated: string | null }) {
  const [tab, setTab] = useState<Tab>('routes');
  return (
    <main className="home">
      <nav className="seg" role="tablist" aria-label="首頁">
        <button role="tab" aria-selected={tab === 'routes'} onClick={() => setTab('routes')}>
          路線
        </button>
        <button role="tab" aria-selected={tab === 'nearby'} onClick={() => setTab('nearby')}>
          附近
        </button>
      </nav>
      {tab === 'routes' ? <RouteBrowser routes={routes} updated={updated} /> : <Nearby />}
    </main>
  );
}
