import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
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
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: t.line }}>
      <MapHelpButton company={company} multiCompany={multiCompany} />
      <MapView ref={map} style={{ flex: 1 }} mapType="none" onMapReady={fit} rotateEnabled={false} pitchEnabled={false}>
        <UrlTile urlTemplate={`${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-2} />
        <UrlTile urlTemplate={`${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-1} />
        {ordered.flatMap((l) =>
          l.segments.flatMap((seg, i) =>
            l.selected
              ? [
                  // 深色外框：黃色喺地圖馬路上唔顯眼
                  <Polyline key={`${l.id}-${i}-o`} coordinates={seg} strokeColor="rgba(0,0,0,0.55)" strokeWidth={8} lineJoin="round" lineCap="round" zIndex={2} />,
                  <Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={l.special ? t.special : color} strokeWidth={5} lineJoin="round" lineCap="round" zIndex={3} />,
                ]
              : [<Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={t.muted} strokeWidth={2} lineDashPattern={[6, 6]} zIndex={1} />],
          ),
        )}
        {/* 冇走線（例如港鐵巴士部分路線）：虛線駁站 */}
        {!lines.some((l) => l.selected) && coords.length > 1 && <Polyline coordinates={coords} strokeColor={color} strokeWidth={3} lineDashPattern={[2, 8]} />}
        {arrows.map((a, i) => (
          <Marker key={`arrow-${i}`} coordinate={{ latitude: a.latitude, longitude: a.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat rotation={a.bearing} tracksViewChanges={false} tappable={false} zIndex={4}>
            <Text style={{ color: '#1a1a1a', fontSize: 12, fontWeight: '900' }}>▲</Text>
          </Marker>
        ))}
        {stops.map((s, i) => {
          const end = i === 0 || i === stops.length - 1;
          return (
            <Marker key={s.index} coordinate={{ latitude: s.lat, longitude: s.lng }} title={`${s.index + 1}. ${s.name}`} anchor={{ x: 0.5, y: 0.5 }} onPress={() => onStopPress(s.index)} tracksViewChanges={false} zIndex={5}>
              <View style={{ width: end ? 16 : 12, height: end ? 16 : 12, borderRadius: 8, borderWidth: 2, borderColor: '#1f1f1f', backgroundColor: end ? '#ffd23f' : '#ffffff' }} />
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
