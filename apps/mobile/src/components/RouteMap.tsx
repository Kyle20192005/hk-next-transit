import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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

export interface MapBus {
  key: number;
  latitude: number;
  longitude: number;
  /** 仲有幾多分鐘到打開咗嘅站 */
  minutes: number;
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
  /** 駛緊去打開咗嘅站嘅巴士 */
  buses: MapBus[];
  /** 列表打開咗嘅站，地圖會放大過去 */
  focusIndex: number | null;
  onStopPress: (index: number) => void;
};

export function RouteMap({ lines, stops, arrows, buses, focusIndex, onStopPress }: Props) {
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

  const [help, setHelp] = useState(false);
  return (
    <View style={{ height: 180, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: t.line }}>
      <Pressable
        onPress={() => setHelp((h) => !h)}
        accessibilityRole="button"
        accessibilityLabel="巴士位置點樣計？"
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10, width: 30, height: 30, borderRadius: 15,
          backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ color: t.text, fontWeight: '700' }}>?</Text>
      </Pressable>
      {help && (
        <Pressable
          onPress={() => setHelp(false)}
          accessibilityLabel="收埋說明"
          style={{ position: 'absolute', top: 44, left: 8, right: 8, zIndex: 11, padding: 12, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, gap: 4 }}
        >
          <Text style={{ color: t.text, fontWeight: '700' }}>巴士位置點樣計？</Text>
          <Text style={{ color: t.text, fontSize: 13 }}>
            位置係按城巴每個站嘅到站時間推算，唔係 GPS。到站時間推遲時巴士會停喺原位，唔會倒退。僅供參考，以城巴到站時間為準。
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>撳一下收埋</Text>
        </Pressable>
      )}
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
        {buses.map((b) => (
          <Marker
            key={`bus-${b.key}`}
            coordinate={{ latitude: b.latitude, longitude: b.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            title={b.minutes <= 0 ? '即將到站' : `約 ${b.minutes} 分鐘到站`}
            zIndex={5}
          >
            <View
              style={{
                width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff',
                backgroundColor: arrowColor, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13 }}>🚌</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}
