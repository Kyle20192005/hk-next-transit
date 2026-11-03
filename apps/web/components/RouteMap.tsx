'use client';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BusStabilizer, lineArrows, pointOnPath, stopPathIndices, type LatLng } from '@hknt/core';
import { BUSES_EVENT, FOCUS_STOP_EVENT, OPEN_STOP_EVENT, latestBuses, type BusesDetail } from '@/lib/events';

export interface MapStop {
  index: number;
  name: string;
  lat: number;
  lng: number;
}

export interface MapLine {
  id: string;
  selected: boolean;
  special: boolean;
  /** [lat, lng]，每段 = 一個站去下一個站 */
  segments: [number, number][][];
}

// 地政總署地圖 API（免費，唔使 key）：底圖 + 中文地名
const LANDSD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz';
const ATTRIBUTION =
  '<a href="https://api.portal.hkmapservice.gov.hk/disclaimer" target="_blank" rel="noopener">© 地政總署</a>';

/** 箭嘴之間最少相隔幾多 px */
const ARROW_SPACING_PX = 60;
/** 箭嘴同站點最少相隔幾多 px */
const ARROW_STOP_GAP_PX = 6;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 巴士位置每幾耐按時間推前一次 */
const BUS_TICK_MS = 5_000;

type Props = {
  lines: MapLine[];
  stops: MapStop[];
};

export default function RouteMap({ lines, stops }: Props) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25 });
    L.tileLayer(`${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`, { maxZoom: 20, maxNativeZoom: 20, minZoom: 10, attribution: ATTRIBUTION }).addTo(map);
    L.tileLayer(`${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`, { maxZoom: 20, maxNativeZoom: 20, minZoom: 10 }).addTo(map);

    const brand = cssVar('--brand', '#0b57d0');
    const special = cssVar('--special', '#b3261e');
    const muted = cssVar('--muted', '#61676f');

    // 其他走法：灰色虛線放底；揀咗嘅走法：實線放面
    for (const l of [...lines].sort((a, b) => Number(a.selected) - Number(b.selected))) {
      L.polyline(l.segments, l.selected
        ? { color: l.special ? special : brand, weight: 6, opacity: 0.9, smoothFactor: 0.5, lineJoin: 'round', lineCap: 'round' }
        : { color: muted, weight: 3, opacity: 0.5, dashArray: '6 6' },
      ).addTo(map);
    }
    // 方向箭嘴：只畫揀咗嘅走法。每次縮放都重新揀，令箭嘴之間有足夠距離、唔會壓住站
    const sel = lines.find((l) => l.selected);
    const arrowLayer = L.layerGroup().addTo(map);
    const candidates = sel ? lineArrows(sel.segments, 40, [0.2, 0.4, 0.6, 0.8]) : [];
    const arrowColor = sel?.special ? special : brand;
    const drawArrows = () => {
      arrowLayer.clearLayers();
      const stopPts = stops.map((s) => map.latLngToLayerPoint([s.lat, s.lng]));
      let last: L.Point | null = null;
      for (const a of candidates) {
        const pt = map.latLngToLayerPoint([a.lat, a.lng]);
        if (last && pt.distanceTo(last) < ARROW_SPACING_PX) continue;
        if (stopPts.some((sp) => sp.distanceTo(pt) < ARROW_STOP_GAP_PX)) continue;
        last = pt;
        L.marker([a.lat, a.lng], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'map-arrow',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            html: `<svg viewBox="0 0 18 18" width="18" height="18" style="transform:rotate(${a.bearing}deg)" aria-hidden="true"><path d="M9 2 L15 14 L9 11 L3 14 Z" fill="${arrowColor}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
          }),
        }).addTo(arrowLayer);
      }
    };
    map.on('zoomend', drawArrows);

    // 揀咗嘅走法冇走線數據：用站點連直線頂住
    if (!lines.some((l) => l.selected) && stops.length > 1) {
      L.polyline(stops.map((s) => [s.lat, s.lng] as [number, number]), { color: brand, weight: 4, opacity: 0.6, dashArray: '2 8' }).addTo(map);
    }

    const markers = stops.map((s, i) => {
      const end = i === 0 || i === stops.length - 1;
      const m = L.circleMarker([s.lat, s.lng], {
        radius: end ? 8 : 6,
        color: '#1f1f1f',
        weight: 2,
        fillColor: end ? '#ffd23f' : '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip(`${s.index + 1}. ${s.name}`, { direction: 'top', offset: [0, -6] })
        .on('click', () => window.dispatchEvent(new CustomEvent(OPEN_STOP_EVENT, { detail: s.index })))
        .addTo(map);
      return { stop: s, marker: m };
    });

    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24] });
    drawArrows();

    // 列表打開咗某個站 → 地圖移過去
    const onFocus = (e: Event) => {
      const found = markers.find((m) => m.stop.index === (e as CustomEvent<number>).detail);
      if (!found) return;
      map.flyTo(found.marker.getLatLng(), 17, { duration: 0.6 });
      found.marker.openTooltip();
    };
    window.addEventListener(FOCUS_STOP_EVENT, onFocus);

    // ---------- 巴士位置：由打開咗嘅站嘅 ETA 倒推，喺走線上顯示 ----------
    // 揀咗嘅走線駁成一條連續折線，再搵每個站喺折線上嘅位置
    const path: LatLng[] = sel ? sel.segments.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))) : [];
    const byIndex = new Map(stops.map((s) => [s.index, s]));
    const pathIdx = path.length
      ? new Map(stopPathIndices(path, stops.map((s) => [s.lat, s.lng] as LatLng)).map((p, k) => [stops[k]!.index, p]))
      : new Map<number, number>();
    const busLayer = L.layerGroup().addTo(map);
    let latest: BusesDetail | null = latestBuses();
    let fittedFor: number | null = null;
    const busColor = sel?.special ? special : brand;

    const locate = (from: number, fraction: number): L.LatLngExpression | null => {
      const i0 = pathIdx.get(from);
      const i1 = pathIdx.get(from + 1);
      if (i0 !== undefined && i1 !== undefined) {
        const p = pointOnPath(path, i0, i1, fraction);
        if (p) return [p.lat, p.lng];
      }
      // 冇走線：喺兩個站之間直線估
      const a = byIndex.get(from);
      const b = byIndex.get(from + 1);
      return a && b ? [a.lat + (b.lat - a.lat) * fraction, a.lng + (b.lng - a.lng) * fraction] : null;
    };

    // 成條線嘅巴士（由 /api/buses 追蹤），每 5 秒按時間推前；只准向前，ETA 推遲就停喺原位
    const stabilizer = new BusStabilizer();
    const lastStop = Math.max(...stops.map((x) => x.index));
    const drawBuses = () => {
      busLayer.clearLayers();
      if (!latest) return;
      const now = Date.now();
      const openIdx = latest.openIndex;
      const target = openIdx !== null ? byIndex.get(openIdx) : undefined;
      let nearest: L.LatLngExpression | null = null;
      for (const { bus: b, progress } of stabilizer.update(latest.buses, latest.segSeconds, now)) {
        const from = Math.min(Math.floor(progress), lastStop - 1);
        const where = locate(from, Math.min(1, progress - from));
        if (!where) continue;
        const next = byIndex.get(from + 1);
        const mins = Math.max(0, Math.round((b.nextEta - now) / 60000));
        // 打開咗站：最近嗰架上游車
        if (openIdx !== null && from < openIdx && !nearest) nearest = where;
        L.marker(where, {
          keyboard: false,
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: 'map-bus',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `<span style="background:${busColor}" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="#fff" d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10Zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 11H6V6h12v5Z"/></svg></span>`,
          }),
        })
          .bindTooltip(mins <= 0 ? `即將到 ${next?.name ?? ''}` : `約 ${mins} 分鐘到 ${next?.name ?? ''}`, { direction: 'top', offset: [0, -12] })
          .addTo(busLayer);
      }
      // 打開站後第一次：調整地圖，同時睇到個站同最近嗰架車
      if (openIdx !== null && fittedFor !== openIdx && target && nearest) {
        fittedFor = openIdx;
        map.fitBounds(L.latLngBounds([[target.lat, target.lng], nearest]), { padding: [36, 36], maxZoom: 17 });
      }
      if (openIdx === null) fittedFor = null;
    };
    const onBuses = (e: Event) => {
      latest = (e as CustomEvent<BusesDetail>).detail;
      drawBuses();
    };
    window.addEventListener(BUSES_EVENT, onBuses);
    const tick = setInterval(drawBuses, BUS_TICK_MS);
    drawBuses();

    return () => {
      window.removeEventListener(FOCUS_STOP_EVENT, onFocus);
      window.removeEventListener(BUSES_EVENT, onBuses);
      clearInterval(tick);
      map.off('zoomend', drawArrows);
      map.remove();
    };
  }, [lines, stops]);

  const [help, setHelp] = useState(false);
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map card" role="region" aria-label="路線地圖" />
      <button className="map-help-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help} aria-label="巴士位置點樣計？">
        ?
      </button>
      {help && (
        <div className="map-help card" role="dialog" aria-label="巴士位置點樣計">
          <strong>巴士位置點樣計？</strong>
          <p>地圖上嘅巴士位置係<b>推算</b>出嚟，唔係 GPS 實時定位：</p>
          <ul>
            <li>每 20 秒讀取城巴每個站嘅到站時間，睇邊架車已經過咗邊個站，推算佢喺邊兩個站之間。</li>
            <li>兩站之間嘅位置按嗰段路嘅行車時間估算（城巴到站時間同實測平均）。</li>
            <li>到站時間推遲（例如塞車）時，巴士會停喺原位，唔會倒退，等時間追上先再郁。</li>
          </ul>
          <p className="muted">僅供參考，以城巴到站時間為準。</p>
          <button className="map-help-close" onClick={() => setHelp(false)}>知道</button>
        </div>
      )}
    </div>
  );
}
