'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FOCUS_STOP_EVENT, OPEN_STOP_EVENT } from './StopRow';

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

    // 列表打開咗某個站 → 地圖移過去
    const onFocus = (e: Event) => {
      const found = markers.find((m) => m.stop.index === (e as CustomEvent<number>).detail);
      if (!found) return;
      map.flyTo(found.marker.getLatLng(), Math.max(map.getZoom(), 16), { duration: 0.6 });
      found.marker.openTooltip();
    };
    window.addEventListener(FOCUS_STOP_EVENT, onFocus);

    return () => {
      window.removeEventListener(FOCUS_STOP_EVENT, onFocus);
      map.remove();
    };
  }, [lines, stops]);

  return <div ref={el} className="route-map card" role="region" aria-label="路線地圖" />;
}
