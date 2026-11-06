import { useEffect, useRef } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { companyInk } from '@hknt/core';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { radius, useTheme } from '@/lib/theme';
import { BusGlyph } from './Icon';
import { MapHelpButton } from './mapHelp';

export interface MapStop {
  index: number;
  name: string;
  lat: number;
  lng: number;
}
export interface MapArrow {
  latitude: number;
  longitude: number;
  bearing: number;
}
export interface MapBus {
  key: number;
  latitude: number;
  longitude: number;
  color: string;
  ink: string;
  /** 按時間表推算：半透明 */
  schedule: boolean;
  label: string;
}
export interface MapLine {
  id: string;
  selected: boolean;
  special: boolean;
  segments: { latitude: number; longitude: number }[][];
}

export type RouteMapProps = {
  lines: MapLine[];
  stops: MapStop[];
  arrows: MapArrow[];
  buses: MapBus[];
  /** 路線公司代表色（走線、箭嘴） */
  color: string;
  company: string;
  multiCompany: boolean;
  /** 有走線來自 OpenStreetMap：要註明出處 */
  osm: boolean;
  focusIndex: number | null;
  onStopPress: (index: number) => void;
  height: number;
};

// 地政總署地圖 API（免費，唔使 key）：底圖 + 中文地名
const LANDSD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz';

/** 路線地圖（原生）：地政總署底圖、公司色走線（深色外框）、方向箭嘴、站點、巴士 */
export function RouteMap({ lines, stops, arrows, buses, color, company, multiCompany, osm, focusIndex, onStopPress, height }: RouteMapProps) {
  const t = useTheme();
  const isDark = useColorScheme() === 'dark';
  const ink = companyInk(company);
  const map = useRef<MapView>(null);
  const coords = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
  const fit = () => map.current?.fitToCoordinates(coords, { edgePadding: { top: 36, right: 36, bottom: 36, left: 36 }, animated: false });

  useEffect(() => {
    if (focusIndex === null) return;
    const s = stops.find((x) => x.index === focusIndex);
    if (s) map.current?.animateToRegion({ latitude: s.lat, longitude: s.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500);
  }, [focusIndex, stops]);

  const ordered = [...lines].sort((a, b) => Number(a.selected) - Number(b.selected));
  return (
    // 地政總署底圖好花：原生地圖冇 CSS filter，用半透明疊喺淺色底上淡化（同網頁 .map-base 效果相近）
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: isDark ? '#1d1f22' : '#f4f5f3' }}>
      <MapHelpButton company={company} multiCompany={multiCompany} />
      <MapView ref={map} style={{ flex: 1 }} mapType="none" onMapReady={fit} rotateEnabled={false} pitchEnabled={false}>
        <UrlTile urlTemplate={`${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-2} opacity={isDark ? 0.35 : 0.5} />
        <UrlTile urlTemplate={`${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-1} opacity={0.85} />
        {ordered.flatMap((l) =>
          l.segments.flatMap((seg, i) =>
            l.selected
              ? [
                  // 深色外框：黃色喺地圖馬路上唔顯眼
                  <Polyline key={`${l.id}-${i}-o`} coordinates={seg} strokeColor="rgba(0,0,0,0.4)" strokeWidth={9} lineJoin="round" lineCap="round" zIndex={2} />,
                  <Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={l.special ? t.special : color} strokeWidth={5} lineJoin="round" lineCap="round" zIndex={3} />,
                ]
              : [<Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={t.muted} strokeWidth={2} lineDashPattern={[4, 6]} zIndex={1} />],
          ),
        )}
        {/* 冇走線（例如港鐵巴士部分路線）：虛線駁站 */}
        {!lines.some((l) => l.selected) && coords.length > 1 && <Polyline coordinates={coords} strokeColor={color} strokeWidth={3} lineDashPattern={[2, 8]} />}
        {arrows.map((a, i) => (
          <Marker key={`arrow-${i}`} coordinate={{ latitude: a.latitude, longitude: a.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat rotation={a.bearing} tracksViewChanges={false} tappable={false} zIndex={4}>
            {/* 走線上面細細嘅 V 形（同網頁一樣），用走線上面嘅字色 */}
            <Svg width={12} height={12} viewBox="0 0 12 12">
              <Path d="M3 8 L6 4.5 L9 8" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Marker>
        ))}
        {stops.map((s, i) => {
          const end = i === 0 || i === stops.length - 1;
          const focused = s.index === focusIndex;
          // 中途站：白點深色邊；起點、終點：深色實心白邊；打開咗嘅站：公司色大點
          const size = focused ? 18 : end ? 16 : 10;
          return (
            <Marker key={s.index} coordinate={{ latitude: s.lat, longitude: s.lng }} title={`${s.index + 1}. ${s.name}`} anchor={{ x: 0.5, y: 0.5 }} onPress={() => onStopPress(s.index)} tracksViewChanges={focused} zIndex={focused ? 6 : 5}>
              <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: end && !focused ? 3 : 2.5, borderColor: end && !focused ? '#ffffff' : '#262626', backgroundColor: focused ? color : end ? '#262626' : '#ffffff' }} />
            </Marker>
          );
        })}
        {buses.map((b) => (
          <Marker key={`bus-${b.key}`} coordinate={{ latitude: b.latitude, longitude: b.longitude }} anchor={{ x: 0.5, y: 0.5 }} title={b.label} zIndex={6}>
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff', backgroundColor: b.color, alignItems: 'center', justifyContent: 'center', opacity: b.schedule ? 0.5 : 1 }}>
              <BusGlyph size={15} color={b.ink} />
            </View>
          </Marker>
        ))}
      </MapView>
      <Text style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#333', backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' }}>
        {osm ? '走線 © OpenStreetMap 貢獻者 · ' : ''}© 地政總署
      </Text>
    </View>
  );
}
