'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BusStabilizer, lineArrows, pointOnPath, stopPathIndices, type LatLng } from '@hknt/core';
import { companyColor, companyInk } from '@/lib/company';
import { BUSES_EVENT, FOCUS_STOP_EVENT, OPEN_STOP_EVENT, latestBuses, latestFocus, type BusesDetail } from '@/lib/events';

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

const OSM_ATTRIBUTION =
  '走線 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap 貢獻者</a>';

/** 箭嘴之間最少相隔幾多 px */
const ARROW_SPACING_PX = 80;
/** 箭嘴同站點最少相隔幾多 px */
const ARROW_STOP_GAP_PX = 14;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 巴士位置每幾耐按時間推前一次 */
const BUS_TICK_MS = 5_000;

type Props = {
  lines: MapLine[];
  stops: MapStop[];
  /** 聯營線：巴士按公司上色 */
  multiCompany?: boolean;
  /** 路線主要公司（走線、箭嘴、巴士預設顏色） */
  company: string;
  /** 有走線來自 OpenStreetMap（港鐵巴士）：要註明出處（ODbL） */
  osm?: boolean;
};

export default function RouteMap({ lines, stops, multiCompany = false, company, osm = false }: Props) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    // 觸控機用兩隻手指縮放，唔使 +／− 掣；電腦先顯示
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const map = L.map(el.current, { zoomControl: finePointer, attributionControl: true, scrollWheelZoom: false, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    // 底圖淡化（CSS .map-base），走線先突出；地名另一層，淡化少啲
    L.tileLayer(`${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`, { maxZoom: 20, maxNativeZoom: 20, minZoom: 10, attribution: ATTRIBUTION, className: 'map-base' }).addTo(map);
    L.tileLayer(`${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`, { maxZoom: 20, maxNativeZoom: 20, minZoom: 10, className: 'map-label' }).addTo(map);
    if (osm) map.attributionControl.addAttribution(OSM_ATTRIBUTION);

    // 走線用公司代表色；城巴黃色喺地圖黃色馬路上唔顯眼，所以底下加一條深色外框
    const brand = companyColor(company) ?? cssVar('--route-line', '#c26a00');
    const ink = companyInk(company);
    const casing = '#1a1a1a';
    const muted = cssVar('--muted', '#61676f');

    // 其他走法：灰色虛線放底；揀咗嘅走法：實線放面
    for (const l of [...lines].sort((a, b) => Number(a.selected) - Number(b.selected))) {
      if (l.selected) {
        L.polyline(l.segments, { color: casing, weight: 10, opacity: 0.4, smoothFactor: 0.5, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(map);
      }
      L.polyline(l.segments, l.selected
        ? { color: brand, weight: 6, opacity: 1, smoothFactor: 0.5, lineJoin: 'round', lineCap: 'round', interactive: false }
        : { color: muted, weight: 3, opacity: 0.45, dashArray: '4 6', interactive: false },
      ).addTo(map);
    }
    // 方向箭嘴：只畫揀咗嘅走法。每次縮放都重新揀，令箭嘴之間有足夠距離、唔會壓住站
    const sel = lines.find((l) => l.selected);
    const arrowLayer = L.layerGroup().addTo(map);
    const candidates = sel ? lineArrows(sel.segments, 40, [0.2, 0.4, 0.6, 0.8]) : [];
    // 箭嘴：走線上面細細嘅 V 形，用走線上面嘅字色（城巴黃線用深色、九巴紅線用白色）
    const arrowColor = ink;
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
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            html: `<svg viewBox="0 0 12 12" width="12" height="12" style="transform:rotate(${a.bearing}deg)" aria-hidden="true"><path d="M3 8 L6 4.5 L9 8" fill="none" stroke="${arrowColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          }),
        }).addTo(arrowLayer);
      }
    };
    map.on('zoomend', drawArrows);

    // 揀咗嘅走法冇走線數據：用站點連直線頂住
    if (!lines.some((l) => l.selected) && stops.length > 1) {
      L.polyline(stops.map((s) => [s.lat, s.lng] as [number, number]), { color: brand, weight: 4, opacity: 0.6, dashArray: '2 8' }).addTo(map);
    }

    // 中途站：白點深色邊；起點、終點：深色實心加白邊，大啲；打開咗嘅站：公司色大點
    const stopStyle = (end: boolean): L.CircleMarkerOptions => ({
      radius: end ? 7 : 4.5,
      color: end ? '#ffffff' : '#262626',
      weight: end ? 3 : 2,
      fillColor: end ? '#262626' : '#ffffff',
      fillOpacity: 1,
    });
    const focusStyle: L.CircleMarkerOptions = { radius: 9, color: '#262626', weight: 3, fillColor: brand, fillOpacity: 1 };
    const markers = stops.map((s, i) => {
      const end = i === 0 || i === stops.length - 1;
      const m = L.circleMarker([s.lat, s.lng], stopStyle(end))
        .bindTooltip(stopTag(s, brand, ink), { direction: 'top', offset: [0, -10], className: 'map-tag', opacity: 1 })
        .on('click', () => window.dispatchEvent(new CustomEvent(OPEN_STOP_EVENT, { detail: s.index })))
        .addTo(map);
      return { stop: s, marker: m, end };
    });

    const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24] });
    drawArrows();

    // 列表打開咗某個站 → 地圖移過去
    const onFocus = (e: Event) => {
      const found = markers.find((m) => m.stop.index === (e as CustomEvent<number>).detail);
      if (!found) return;
      map.flyTo(found.marker.getLatLng(), 17, { duration: 0.6 });
      // 每次只保留一個站名，唔好疊埋一齊
      for (const m of markers) {
        if (m === found) continue;
        m.marker.closeTooltip();
        m.marker.setStyle(stopStyle(m.end));
      }
      found.marker.setStyle(focusStyle).bringToFront();
      found.marker.openTooltip();
    };
    window.addEventListener(FOCUS_STOP_EVENT, onFocus);
    // 地圖載入之前已經打開咗站：補返放大
    const pending = latestFocus();
    if (pending !== null) onFocus(new CustomEvent(FOCUS_STOP_EVENT, { detail: pending }));

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
    const busColor = brand;

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
        // 有真實 GPS（港鐵巴士）就直接用，冇先推算
        const where: L.LatLngExpression | null = b.gps ? [b.gps.lat, b.gps.lng] : locate(from, Math.min(1, progress - from));
        if (!where) continue;
        const next = byIndex.get(from + 1);
        const mins = Math.max(0, Math.round((b.nextEta - now) / 60000));
        // 打開咗站：最近嗰架上游車
        if (openIdx !== null && from < openIdx && !nearest) nearest = where;
        L.marker(where, {
          keyboard: false,
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: b.schedule ? 'map-bus is-schedule' : 'map-bus',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `<span style="background:${(multiCompany && companyColor(b.company)) || busColor}" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="${multiCompany && b.company ? companyInk(b.company) : ink}" d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10Zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 11H6V6h12v5Z"/></svg></span>`,
          }),
        })
          .bindTooltip((b.schedule ? '按時間表估計：' : '') + (mins <= 0 ? `即將到 ${next?.name ?? ''}` : `約 ${mins} 分鐘到 ${next?.name ?? ''}`), { direction: 'top', offset: [0, -14], className: 'map-tip' })
          .addTo(busLayer);
      }
      // 打開站後第一次：調整地圖，同時睇到個站同最近嗰架車
      if (openIdx !== null && fittedFor !== openIdx && target && nearest) {
        fittedFor = openIdx;
        // 左右留多啲位，站名標籤（喺站上面、置中）唔會俾地圖邊切走
        const side = Math.min(120, map.getSize().x / 4);
        map.fitBounds(L.latLngBounds([[target.lat, target.lng], nearest]), { paddingTopLeft: [side, 64], paddingBottomRight: [side, 28], maxZoom: 17 });
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
  }, [lines, stops, multiCompany, company, osm]);

  const [help, setHelp] = useState(false);
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map card" role="region" aria-label="路線地圖" />
      <button className="map-help-btn" onClick={() => setHelp((h) => !h)} aria-expanded={help} aria-label="巴士位置點樣計？">
        <Icon name="info" size={20} />
      </button>
      {help &&
        createPortal(
          <div className="map-help-backdrop" onClick={() => setHelp(false)}>
            <div className="map-help card" role="dialog" aria-modal="true" aria-label="巴士位置點樣計" onClick={(e) => e.stopPropagation()}>
              <MapHelpText company={company} multiCompany={multiCompany} />
              <button className="map-help-close" onClick={() => setHelp(false)}>知道</button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 地圖站名標籤：公司色站號 + 站名（太長就省略） */
function stopTag(s: MapStop, color: string, ink: string): string {
  return `<span class="map-tag-num" style="background:${color};color:${ink}">${s.index + 1}</span><span class="map-tag-name">${esc(s.name)}</span>`;
}

const CO_NAME: Record<string, string> = { CTB: '城巴', KMB: '九巴', NLB: '新大嶼山巴士', MTRB: '港鐵巴士' };

/** 「?」說明：按公司講（港鐵巴士有真 GPS，其他係推算） */
function MapHelpText({ company, multiCompany }: { company: string; multiCompany: boolean }) {
  const src = multiCompany ? '城巴同九巴' : (CO_NAME[company] ?? '巴士公司');
  const estimate = (
    <>
      <li>每 20 秒讀取{src}每個站嘅到站時間，睇邊架車已經過咗邊個站，推算佢喺邊兩個站之間。</li>
      <li>兩站之間嘅位置按嗰段路嘅行車時間估算（到站時間同實測平均）。</li>
      <li>到站時間推遲（例如塞車）時，巴士會停喺原位，唔會倒退，等時間追上先再郁。</li>
    </>
  );
  if (company === 'MTRB') {
    return (
      <>
        <strong>巴士位置點樣嚟？</strong>
        <p>港鐵巴士行緊嘅車有 <b>GPS 位置</b>，地圖直接顯示，每 20 秒更新。</p>
        <ul>
          <li>未開出、或者冇 GPS 嘅車，位置按到站時間推算。</li>
        </ul>
        <p className="muted">僅供參考，以港鐵巴士到站時間為準。</p>
      </>
    );
  }
  if (company === 'NLB') {
    return (
      <>
        <strong>巴士位置點樣計？</strong>
        <p>地圖上嘅巴士位置係<b>推算</b>出嚟：</p>
        <ul>
          <li>有 GPS 嘅車：每 20 秒讀取每個站嘅到站時間，推算佢喺邊兩個站之間。</li>
          <li>新大嶼山巴士好多車冇 GPS，到站時間只係時間表：呢啲車<b>按政府時間表估計</b>，地圖上半透明顯示，實際可能提早、延誤或者取消。</li>
          <li>到站時間推遲時，巴士會停喺原位，唔會倒退。</li>
        </ul>
        <p className="muted">僅供參考，以新大嶼山巴士到站時間為準。</p>
      </>
    );
  }
  return (
    <>
      <strong>巴士位置點樣計？</strong>
      <p>地圖上嘅巴士位置係<b>推算</b>出嚟，唔係 GPS 實時定位：</p>
      <ul>{estimate}</ul>
      <p className="muted">僅供參考，以{src}到站時間為準。</p>
    </>
  );
}
