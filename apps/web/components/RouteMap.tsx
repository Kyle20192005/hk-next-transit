'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { lineArrows } from '@hknt/core';
import { FOCUS_STOP_EVENT, OPEN_STOP_EVENT } from '@/lib/events';

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

export default function RouteMap({ lines, stops }: { lines: MapLine[]; stops: MapStop[] }) {
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
        ? { color: l.special ? special : brand, weight: 6, opacity: 0.9 }
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

    return () => {
      window.removeEventListener(FOCUS_STOP_EVENT, onFocus);
      map.off('zoomend', drawArrows);
      map.remove();
    };
  }, [lines, stops]);

  return <div ref={el} className="route-map card" role="region" aria-label="路線地圖" />;
}
