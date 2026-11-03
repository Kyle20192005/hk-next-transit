import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import { useTheme } from '@/lib/theme';

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

export interface MapLine {
  id: string;
  selected: boolean;
  special: boolean;
  /** { latitude, longitude }，每段 = 一個站去下一個站 */
  segments: { latitude: number; longitude: number }[][];
}

// 地政總署地圖 API（免費，唔使 key）：底圖 + 中文地名
const LANDSD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz';

type Props = {
  lines: MapLine[];
  stops: MapStop[];
  /** 揀咗嘅走法嘅方向箭嘴 */
  arrows: MapArrow[];
  /** 列表打開咗嘅站，地圖會放大過去 */
  focusIndex: number | null;
  onStopPress: (index: number) => void;
};

export function RouteMap({ lines, stops, arrows, focusIndex, onStopPress }: Props) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  const coords = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));

  const fit = () =>
    map.current?.fitToCoordinates(coords, { edgePadding: { top: 32, right: 32, bottom: 32, left: 32 }, animated: false });

  useEffect(() => {
    if (focusIndex === null) return;
    const s = stops.find((x) => x.index === focusIndex);
    if (s) map.current?.animateToRegion({ latitude: s.lat, longitude: s.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 500);
  }, [focusIndex, stops]);

  const ordered = [...lines].sort((a, b) => Number(a.selected) - Number(b.selected));
  const arrowColor = lines.find((l) => l.selected)?.special ? t.special : t.brand;

  return (
    <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
      <MapView ref={map} style={{ flex: 1 }} mapType="none" onMapReady={fit} rotateEnabled={false} pitchEnabled={false}>
        <UrlTile urlTemplate={`${LANDSD}/basemap/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-2} />
        <UrlTile urlTemplate={`${LANDSD}/label/hk/tc/WGS84/{z}/{x}/{y}.png`} maximumZ={20} zIndex={-1} />
        {ordered.flatMap((l) =>
          l.segments.map((seg, i) => (
            <Polyline
              key={`${l.id}-${i}`}
              coordinates={seg}
              strokeColor={l.selected ? (l.special ? t.special : t.brand) : t.muted}
              strokeWidth={l.selected ? 5 : 2}
              lineJoin="round"
              lineCap="round"
              lineDashPattern={l.selected ? undefined : [6, 6]}
              zIndex={l.selected ? 2 : 1}
            />
          )),
        )}
        {!lines.some((l) => l.selected) && coords.length > 1 && (
          <Polyline coordinates={coords} strokeColor={t.brand} strokeWidth={3} lineDashPattern={[2, 8]} />
        )}
        {arrows.map((a, i) => (
          <Marker
            key={`arrow-${i}`}
            coordinate={{ latitude: a.latitude, longitude: a.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={a.bearing}
            tracksViewChanges={false}
            tappable={false}
            zIndex={2}
          >
            <Text style={{ color: arrowColor, fontSize: 14, fontWeight: '900', textShadowColor: '#fff', textShadowRadius: 2 }}>
              ▲
            </Text>
          </Marker>
        ))}
        {stops.map((s, i) => {
          const end = i === 0 || i === stops.length - 1;
          return (
            <Marker
              key={s.index}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              title={`${s.index + 1}. ${s.name}`}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => onStopPress(s.index)}
              tracksViewChanges={false}
              zIndex={3}
            >
              <View
                style={{
                  width: end ? 16 : 12, height: end ? 16 : 12, borderRadius: 8, borderWidth: 2,
                  borderColor: '#1f1f1f', backgroundColor: end ? '#ffd23f' : '#ffffff',
                }}
              />
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}
