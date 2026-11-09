'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatDistance, nearestTramStations, tramRecent, tramStationName } from '@hknt/core';
import TramMap from './TramMap';
import TramStationSheet from './TramStationSheet';
import type { MapFocus, MapInset } from './useMapView';
import Icon from '../Icon';
import { useNearbyStops } from '../home/Nearby';
import { isNarrow, useNarrow } from './RailView';
import { addRecent } from '@/lib/recent';

/**
 * 「路線」分頁 → 電車：電車路綫圖（打直），撳站（或者喺標題列搜尋）睇班次。
 * 附近 600 米內嘅電車站加藍色虛綫圈，左上角膠囊撳去最近嗰個；面板遮住嘅位（inset）俾地圖避開（同港鐵、輕鐵一樣）。
 */
export default function TramView({ pick }: { pick: { sta: string; n: number } | null }) {
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const sheet = useNarrow();
  const [all, setAll] = useState(() => !isNarrow());
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [inset, setInset] = useState<MapInset>({ right: 0, bottom: 0 });

  const { state: nearby } = useNearbyStops(true);
  const near = nearby.kind === 'ok' ? nearestTramStations(nearby.lat, nearby.lng, 600, 4) : [];
  const nearKey = near.map((n) => n.sta).join(',');
  // 第一次知道附近有咩站：唔喺畫面就移過去（唔變大細）；已經揀咗站就唔郁
  const movedNear = useRef(false);
  useEffect(() => {
    const first = nearKey.split(',')[0];
    if (!first || movedNear.current || sta) return;
    movedNear.current = true;
    setFocus({ sta: first, zoom: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey]);

  const open = useCallback((s: string, zoom: boolean) => {
    setFocus({ sta: s, zoom });
    setSta(s);
    if (isNarrow()) setAll(false);
  }, []);
  useEffect(() => {
    if (pick) open(pick.sta, true);
  }, [pick, open]);
  const onStation = useCallback((s: string) => open(s, false), [open]);
  const onClose = useCallback(() => setSta(null), []);

  // 打開咗嘅電車站記入首頁「最近睇過」（同港鐵、輕鐵一樣）
  useEffect(() => {
    if (sta) addRecent(tramRecent(sta));
  }, [sta]);

  useLayoutEffect(() => {
    const w = wrap.current;
    const el = panel.current;
    const set = (v: MapInset) => setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
    if (!w || !el) {
      set({ right: 0, bottom: 0 });
      return;
    }
    const update = () => {
      const a = w.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      set(b.width > a.width * 0.6 ? { right: 0, bottom: Math.max(0, a.bottom - b.top) } : { right: Math.max(0, a.right - b.left), bottom: 0 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(w);
    return () => ro.disconnect();
  }, [sta]);

  return (
    <div className="mtr-wrap" ref={wrap}>
      <TramMap selected={sta} onStation={onStation} focus={focus} inset={inset} near={near.map((n) => n.sta)} start={near[0]?.sta ?? null} />
      <div className="rail-overlay">
        {near[0] && (
          <button className="mtr-near-pill" onClick={() => open(near[0]!.sta, true)} aria-label={`附近電車站：${tramStationName(near[0].sta)}，${formatDistance(near[0].distance)}`}>
            <Icon name="navigate" size={16} />
            附近：{tramStationName(near[0].sta)}
            <span className="muted">· {formatDistance(near[0].distance)}</span>
          </button>
        )}
      </div>
      {sta && <TramStationSheet ref={panel} sta={sta} onClose={onClose} all={all} onAll={setAll} sheet={sheet} onOpposite={(s) => open(s, false)} />}
    </div>
  );
}
