import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, useColorScheme, View } from 'react-native';
import { Camera, GeoJSONSource, Images, Layer, Map, Marker, ViewAnnotation, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { MAP_STYLE_URL, companyInk, firstSymbolLayer, restyleMap, type MapStyleJson } from '@hknt/core';
import { radius, tabular, useTheme } from '@/lib/theme';
import { BusGlyph } from './Icon';
import { MapHelpButton } from './mapHelp';
import type { RouteMapProps } from './mapTypes';

/** 打開站時放大到幾多（同網頁一樣） */
const FOCUS_ZOOM = 16;

// 底圖：OpenFreeMap Positron + 自己調色（core `restyleMap`，同網頁共用）。樣式 JSON 只攞一次
let baseStyle: Promise<MapStyleJson> | null = null;
function loadStyle(dark: boolean): Promise<StyleSpecification> {
  baseStyle ??= fetch(MAP_STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`地圖樣式載入失敗（${r.status}）`);
    return r.json() as Promise<MapStyleJson>;
  });
  baseStyle.catch(() => (baseStyle = null));
  return baseStyle.then((st) => restyleMap(st, dark) as unknown as StyleSpecification);
}

const CHEVRON = { dark: require('../../assets/map/chevron-dark.png'), light: require('../../assets/map/chevron-light.png') };

/** 路線地圖（原生 MapLibre；只喺開發版本／正式版行，Expo Go 冇呢個原生模組，見 RouteMap.tsx）：同網頁一樣嘅底圖、公司色走線（深色外框）、沿線方向 V 形、站點、站名標籤、巴士 */
export function RouteMap({ lines, stops, buses, color, company, multiCompany, focusIndex, onStopPress, height }: RouteMapProps) {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  const camera = useRef<CameraRef>(null);
  const [style, setStyle] = useState<{ dark: boolean; spec: StyleSpecification } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStyle(dark).then(
      (spec) => !cancelled && setStyle({ dark, spec }),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [dark]);

  const focused = focusIndex !== null ? stops.find((s) => s.index === focusIndex) : undefined;
  useEffect(() => {
    if (focused) camera.current?.flyTo({ center: [focused.lng, focused.lat], zoom: FOCUS_ZOOM, duration: 600 });
  }, [focused]);

  const ink = companyInk(company);
  const muted = dark ? '#8a9097' : '#7a7f86';
  const sel = lines.find((l) => l.selected);
  const selCoords = sel
    ? sel.segments.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))).map((p) => [p.longitude, p.latitude])
    : stops.map((s) => [s.lng, s.lat]);
  const lngs = stops.map((s) => s.lng);
  const lats = stops.map((s) => s.lat);
  const bounds: [number, number, number, number] = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  const before = style ? firstSymbolLayer(style.spec as unknown as MapStyleJson) : undefined;

  return (
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: dark ? '#1e2124' : '#f4f2ed' }}>
      {!style && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {error ? <Text style={{ color: t.muted, fontSize: 13 }}>地圖載入唔到（{error}），站點列表照用得</Text> : <ActivityIndicator />}
        </View>
      )}
      {style && (
        <Map
          key={style.dark ? 'dark' : 'light'}
          style={{ flex: 1 }}
          mapStyle={style.spec}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          logo={false}
          attribution
          attributionPosition={{ bottom: 6, right: 6 }}
        >
          <Camera ref={camera} initialViewState={{ bounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } }} />
          <Images images={{ chevron: ink === '#ffffff' ? CHEVRON.light : CHEVRON.dark }} />
          {/* 其他走法：灰色虛線放底 */}
          <GeoJSONSource
            id="others"
            data={{
              type: 'FeatureCollection',
              features: lines
                .filter((l) => !l.selected)
                .map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: l.segments.map((seg) => seg.map((p) => [p.longitude, p.latitude])) } })),
            }}
          >
            <Layer id="others" type="line" beforeId={before} paint={{ 'line-color': muted, 'line-width': 3, 'line-opacity': 0.5, 'line-dasharray': [1.5, 2] }} />
          </GeoJSONSource>
          {/* 揀咗嘅走法：深色外框 + 公司色；冇走線數據就用站點連虛線 */}
          <GeoJSONSource id="sel" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: selCoords } }}>
            {sel ? (
              <>
                <Layer id="sel-casing" type="line" beforeId={before} layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': '#1a1a1a', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 16, 11], 'line-opacity': 0.35 }} />
                <Layer id="sel-line" type="line" beforeId={before} layout={{ 'line-join': 'round', 'line-cap': 'round' }} paint={{ 'line-color': color, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 16, 8] }} />
                <Layer
                  id="sel-arrows"
                  type="symbol"
                  layout={{ 'symbol-placement': 'line', 'symbol-spacing': 90, 'icon-image': 'chevron', 'icon-size': 0.7, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map' }}
                />
              </>
            ) : (
              <Layer id="sel-line" type="line" beforeId={before} paint={{ 'line-color': color, 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [0.5, 2] }} />
            )}
          </GeoJSONSource>
          {/* 站點：中途白點深色邊；起點、終點深色實心白邊；打開咗嘅站公司色大點 */}
          <GeoJSONSource
            id="stops"
            data={{
              type: 'FeatureCollection',
              features: stops.map((s, i) => ({
                type: 'Feature',
                properties: { index: s.index, end: i === 0 || i === stops.length - 1, focus: s.index === focusIndex },
                geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
              })),
            }}
            onPress={(e) => {
              const idx = e.nativeEvent.features?.[0]?.properties?.index;
              if (typeof idx === 'number') onStopPress(idx);
            }}
          >
            <Layer
              id="stops"
              type="circle"
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['get', 'focus'], 9, ['get', 'end'], 7, 3.5], 16, ['case', ['get', 'focus'], 10, ['get', 'end'], 8, 5.5]],
                'circle-color': ['case', ['get', 'focus'], color, ['get', 'end'], '#262626', '#ffffff'],
                'circle-stroke-color': ['case', ['get', 'focus'], '#262626', ['get', 'end'], '#ffffff', '#262626'],
                'circle-stroke-width': ['case', ['get', 'end'], 3, 2],
              }}
            />
          </GeoJSONSource>
          {buses.map((b) => (
            <Marker key={`bus-${b.key}`} id={`bus-${b.key}`} lngLat={[b.longitude, b.latitude]} anchor="center">
              <View accessibilityLabel={b.label} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff', backgroundColor: b.color, alignItems: 'center', justifyContent: 'center', opacity: b.schedule ? 0.5 : 1 }}>
                <BusGlyph size={15} color={b.ink} />
              </View>
            </Marker>
          ))}
          {/* 站名標籤：公司色站號 + 站名膠囊（同網頁一樣） */}
          {focused && (
            <ViewAnnotation id="stop-tag" lngLat={[focused.lng, focused.lat]} anchor="bottom" offset={[0, -12]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: t.card, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                <View style={{ minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: ink, ...tabular }}>{focused.index + 1}</Text>
                </View>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: t.text }}>
                  {focused.name}
                </Text>
              </View>
            </ViewAnnotation>
          )}
        </Map>
      )}
      <MapHelpButton company={company} multiCompany={multiCompany} />
    </View>
  );
}
