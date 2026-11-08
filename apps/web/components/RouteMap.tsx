'use client';
import { useDark } from '@/lib/prefs';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import maplibregl, { type GeoJSONSource, type LngLatLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BusStabilizer, pointOnPath, stopPathIndices, type LatLng } from '@hknt/core';
import { companyColor, companyInk } from '@/lib/company';
import { BUSES_EVENT, FOCUS_STOP_EVENT, OPEN_STOP_EVENT, latestBuses, latestFocus, type BusesDetail } from '@/lib/events';
import { firstSymbolLayer, loadMapStyle } from '@/lib/map-style';

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

/** 巴士位置每幾耐按時間推前一次 */
const BUS_TICK_MS = 5_000;
/** 打開站時放大到幾多（MapLibre 512px 圖塊，16 ≈ 以前 Leaflet 17） */
const FOCUS_ZOOM = 16;
const CJK_FONTS = '"PingFang HK", "PingFang TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif';

const toLngLat = ([lat, lng]: LatLng | [number, number]): [number, number] => [lng, lat];

type Props = {
  lines: MapLine[];
  stops: MapStop[];
  /** 聯營線：巴士按公司上色 */
  multiCompany?: boolean;
  /** 路線主要公司（走線、箭嘴、巴士預設顏色） */
  company: string;
  /** 有走線來自 OpenStreetMap（港鐵巴士）：底圖本身已經註明 © OpenStreetMap 貢獻者 */
  osm?: boolean;
};


/** 走線方向：細 V 形（向右，MapLibre 沿線擺放時會跟走線方向轉） */
function chevronImage(color: string): ImageData {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(12, 9);
  g.lineTo(19, 16);
  g.lineTo(12, 23);
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

export default function RouteMap({ lines, stops, multiCompany = false, company }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const dark = useDark();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const container = el.current;
    if (!container) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    loadMapStyle(dark)
      .then((style) => {
        if (cancelled) return;
        // 觸控機用兩隻手指縮放，唔使 +／− 掣；電腦先顯示
        const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const bounds = new maplibregl.LngLatBounds();
        for (const s of stops) bounds.extend([s.lng, s.lat]);
        let map: maplibregl.Map;
        try {
          map = new maplibregl.Map({
            container,
            style,
            bounds,
            fitBoundsOptions: { padding: 24 },
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            scrollZoom: false,
            localIdeographFontFamily: CJK_FONTS,
          });
        } catch (e) {
          setFailed((e as Error).message || '瀏覽器唔支援 WebGL');
          return;
        }
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        if (finePointer) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

        const brand = companyColor(company) ?? '#c26a00';
        const ink = companyInk(company);
        const muted = dark ? '#8a9097' : '#7a7f86';
        const casing = '#1a1a1a';
        const sel = lines.find((l) => l.selected);
        // 揀咗嘅走線駁成一條連續折線（巴士位置、箭嘴用）
        const path: LatLng[] = sel ? sel.segments.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))) : [];

        // ---------- 站點、站名標籤 ----------
        let focusIndex: number | null = null;
        const stopData = () => ({
          type: 'FeatureCollection' as const,
          features: stops.map((s, i) => ({
            type: 'Feature' as const,
            properties: { index: s.index, end: i === 0 || i === stops.length - 1, focus: s.index === focusIndex },
            geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
          })),
        });
        const tag = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor: 'bottom', offset: 12, maxWidth: 'none', className: 'map-tag' });
        const hoverTag = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor: 'bottom', offset: 10, maxWidth: 'none', className: 'map-tag' });
        const byIndex = new Map(stops.map((s) => [s.index, s]));

        const focus = (index: number, fly: boolean) => {
          const s = byIndex.get(index);
          if (!s) return;
          focusIndex = index;
          (map.getSource('stops') as GeoJSONSource | undefined)?.setData(stopData());
          hoverTag.remove();
          tag.setLngLat([s.lng, s.lat]).setHTML(stopTag(s, brand, ink)).addTo(map);
          if (fly) map.flyTo({ center: [s.lng, s.lat], zoom: FOCUS_ZOOM, duration: 600 });
        };
        const onFocus = (e: Event) => focus((e as CustomEvent<number>).detail, true);

        // ---------- 巴士 ----------
        const pathIdx = path.length
          ? new Map(stopPathIndices(path, stops.map((s) => [s.lat, s.lng] as LatLng)).map((p, k) => [stops[k]!.index, p]))
          : new Map<number, number>();
        const locate = (from: number, fraction: number): [number, number] | null => {
          const i0 = pathIdx.get(from);
          const i1 = pathIdx.get(from + 1);
          if (i0 !== undefined && i1 !== undefined) {
            const p = pointOnPath(path, i0, i1, fraction);
            if (p) return [p.lng, p.lat];
          }
          // 冇走線：喺兩個站之間直線估
          const a = byIndex.get(from);
          const b = byIndex.get(from + 1);
          return a && b ? [a.lng + (b.lng - a.lng) * fraction, a.lat + (b.lat - a.lat) * fraction] : null;
        };
        let latest: BusesDetail | null = latestBuses();
        let fittedFor: number | null = null;
        let busMarkers: maplibregl.Marker[] = [];
        // 成條線嘅巴士（由 /api/buses 追蹤），每 5 秒按時間推前；只准向前，ETA 推遲就停喺原位
        const stabilizer = new BusStabilizer();
        const lastStop = Math.max(...stops.map((x) => x.index));
        const drawBuses = () => {
          for (const m of busMarkers) m.remove();
          busMarkers = [];
          if (!latest) return;
          const now = Date.now();
          const openIdx = latest.openIndex;
          const target = openIdx !== null ? byIndex.get(openIdx) : undefined;
          let nearest: [number, number] | null = null;
          for (const { bus: b, progress } of stabilizer.update(latest.buses, latest.segSeconds, now)) {
            const from = Math.min(Math.floor(progress), lastStop - 1);
            // 有真實 GPS（港鐵巴士）就直接用，冇先推算
            const where = b.gps ? ([b.gps.lng, b.gps.lat] as [number, number]) : locate(from, Math.min(1, progress - from));
            if (!where) continue;
            const next = byIndex.get(from + 1);
            const mins = Math.max(0, Math.round((b.nextEta - now) / 60000));
            if (openIdx !== null && from < openIdx && !nearest) nearest = where;
            const node = document.createElement('div');
            const isLast = b === latest.lastBus;
            node.className = `map-bus${b.schedule ? ' is-schedule' : ''}${isLast ? ' is-last' : ''}`;
            node.title = (isLast ? '尾班車：' : '') + (b.schedule ? '按時間表估計：' : '') + (mins <= 0 ? `即將到 ${next?.name ?? ''}` : `約 ${mins} 分鐘到 ${next?.name ?? ''}`);
            const bg = (multiCompany && companyColor(b.company)) || brand;
            const fg = multiCompany && b.company ? companyInk(b.company) : ink;
            node.innerHTML = `<span style="background:${bg}" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="${fg}" d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10Zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 11H6V6h12v5Z"/></svg></span>${isLast ? '<b class="map-bus-tag">尾班</b>' : ''}`;
            busMarkers.push(new maplibregl.Marker({ element: node }).setLngLat(where).addTo(map));
          }
          // 打開站後第一次：調整地圖，同時睇到個站同最近嗰架車；左右留位，站名標籤唔會俾地圖邊切走
          if (openIdx !== null && fittedFor !== openIdx && target && nearest) {
            fittedFor = openIdx;
            const side = Math.min(120, container.clientWidth / 4);
            map.fitBounds(new maplibregl.LngLatBounds([target.lng, target.lat], [target.lng, target.lat]).extend(nearest), {
              padding: { top: 64, bottom: 28, left: side, right: side },
              maxZoom: FOCUS_ZOOM,
              duration: 600,
            });
          }
          if (openIdx === null) fittedFor = null;
        };
        const onBuses = (e: Event) => {
          latest = (e as CustomEvent<BusesDetail>).detail;
          drawBuses();
        };

        map.on('load', () => {
          // 出處預設收埋（撳「i」先展開），唔好遮住地圖
          container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          const before = firstSymbolLayer(style);
          // 其他走法：灰色虛線放底
          map.addSource('others', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: lines.filter((l) => !l.selected).map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: l.segments.map((seg) => seg.map(toLngLat)) } })),
            },
          });
          map.addLayer({ id: 'others', type: 'line', source: 'others', paint: { 'line-color': muted, 'line-width': 3, 'line-opacity': 0.5, 'line-dasharray': [1.5, 2] } }, before);
          // 揀咗嘅走法：深色外框 + 公司色（城巴黃色喺淺色地圖上要外框先睇得清）
          const selCoords = sel ? path.map(toLngLat) : stops.map((s) => [s.lng, s.lat]);
          map.addSource('sel', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: selCoords } } });
          if (sel) {
            map.addLayer({ id: 'sel-casing', type: 'line', source: 'sel', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 16, 11], 'line-opacity': 0.35 } }, before);
            map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': brand, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 16, 8] } }, before);
            map.addImage('chevron', chevronImage(ink), { pixelRatio: 2 });
            map.addLayer({
              id: 'sel-arrows',
              type: 'symbol',
              source: 'sel',
              layout: { 'symbol-placement': 'line', 'symbol-spacing': 90, 'icon-image': 'chevron', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map' },
            });
          } else {
            // 揀咗嘅走法冇走線數據：用站點連虛線頂住
            map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', paint: { 'line-color': brand, 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [0.5, 2] } }, before);
          }
          // 站點：中途白點深色邊；起點、終點深色實心白邊；打開咗嘅站公司色大點
          map.addSource('stops', { type: 'geojson', data: stopData() });
          map.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            paint: {
              // zoom 只可以喺最外層 interpolate 用
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['get', 'focus'], 9, ['get', 'end'], 7, 3.5], 16, ['case', ['get', 'focus'], 10, ['get', 'end'], 8, 5.5]],
              'circle-color': ['case', ['get', 'focus'], brand, ['get', 'end'], '#262626', '#ffffff'],
              'circle-stroke-color': ['case', ['get', 'focus'], '#262626', ['get', 'end'], '#ffffff', '#262626'],
              'circle-stroke-width': ['case', ['get', 'end'], 3, 2],
            },
          });
          map.on('click', 'stops', (e) => {
            const idx = e.features?.[0]?.properties?.index;
            if (typeof idx === 'number') window.dispatchEvent(new CustomEvent(OPEN_STOP_EVENT, { detail: idx }));
          });
          map.on('mouseenter', 'stops', (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const idx = e.features?.[0]?.properties?.index;
            const s = typeof idx === 'number' ? byIndex.get(idx) : undefined;
            if (s && idx !== focusIndex) hoverTag.setLngLat([s.lng, s.lat]).setHTML(stopTag(s, brand, ink)).addTo(map);
          });
          map.on('mouseleave', 'stops', () => {
            map.getCanvas().style.cursor = '';
            hoverTag.remove();
          });

          // 地圖載入之前已經打開咗站：補返放大
          const pending = latestFocus();
          if (pending !== null) focus(pending, true);
          drawBuses();
        });

        window.addEventListener(FOCUS_STOP_EVENT, onFocus);
        window.addEventListener(BUSES_EVENT, onBuses);
        const tick = setInterval(drawBuses, BUS_TICK_MS);
        cleanup = () => {
          window.removeEventListener(FOCUS_STOP_EVENT, onFocus);
          window.removeEventListener(BUSES_EVENT, onBuses);
          clearInterval(tick);
          map.remove();
        };
      })
      .catch((e: Error) => {
        if (!cancelled) setFailed(e.message);
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [lines, stops, multiCompany, company, dark]);

  const [help, setHelp] = useState(false);
  return (
    <div className="route-map-wrap">
      <div ref={el} className="route-map card" role="region" aria-label="路線地圖">
        {failed && <p className="map-failed muted">地圖載入唔到（{failed}），站點列表照用得</p>}
      </div>
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
