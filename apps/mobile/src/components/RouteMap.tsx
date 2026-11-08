import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { companyInk, googleMapStyle, lineArrows } from '@hknt/core';
import { radius, tabular, useTheme } from '@/lib/theme';
import { BusGlyph } from './Icon';
import { MapHelpButton } from './mapHelp';
import type { RouteMapProps } from './mapTypes';

export type { MapBus, MapLine, MapStop, RouteMapProps } from './mapTypes';

/** 打開站時嘅範圍（經緯度跨度，約 500 米） */
const FOCUS_DELTA = 0.005;

/**
 * 自訂 View 嘅 Marker：Android 要畫完先可以停止追蹤（tracksViewChanges = false），否則會出空白。
 * 首 0.6 秒照追蹤，之後停，慳電。
 */
function useSettled(ms = 600): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return settled;
}

/**
 * 路線地圖（react-native-maps，Expo Go 都用得）：iPhone 用 Apple 地圖（mutedStandard 淡色），
 * Android 用 Google 地圖（core `googleMapStyle`，同網頁一樣嘅顏色）。
 * 走線、箭嘴、站點、站名膠囊、巴士同網頁一樣：公司色走線加深色外框、打開咗嘅站公司色大點。
 */
export function RouteMap({ lines, stops, buses, color, company, multiCompany, focusIndex, onStopPress, height }: RouteMapProps) {
  const t = useTheme();
  const dark = useColorScheme() === 'dark';
  const map = useRef<MapView>(null);
  const settled = useSettled();
  const ink = companyInk(company);
  const coords = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
  const fit = () => map.current?.fitToCoordinates(coords, { edgePadding: { top: 36, right: 36, bottom: 36, left: 36 }, animated: false });

  const focused = focusIndex !== null ? stops.find((s) => s.index === focusIndex) : undefined;
  useEffect(() => {
    if (focused) map.current?.animateToRegion({ latitude: focused.lat, longitude: focused.lng, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA }, 500);
  }, [focused]);

  const sel = lines.find((l) => l.selected);
  // 方向箭嘴：原生地圖唔方便按縮放篩選，只喺 300 米以上嘅段放
  const arrows = useMemo(
    () => (sel ? lineArrows(sel.segments.map((seg) => seg.map((p) => [p.latitude, p.longitude] as [number, number])), 300) : []),
    [sel],
  );
  const mapStyle = useMemo(() => (Platform.OS === 'android' ? googleMapStyle(dark) : undefined), [dark]);
  const ordered = [...lines].sort((a, b) => Number(a.selected) - Number(b.selected));

  return (
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: t.line }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        onMapReady={fit}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={mapStyle}
      >
        {ordered.flatMap((l) =>
          l.segments.flatMap((seg, i) =>
            l.selected
              ? [
                  // 深色外框：城巴黃色喺淺色地圖上要外框先睇得清
                  <Polyline key={`${l.id}-${i}-o`} coordinates={seg} strokeColor="rgba(0,0,0,0.35)" strokeWidth={9} lineJoin="round" lineCap="round" zIndex={2} />,
                  <Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={color} strokeWidth={6} lineJoin="round" lineCap="round" zIndex={3} />,
                ]
              : [<Polyline key={`${l.id}-${i}`} coordinates={seg} strokeColor={t.muted} strokeWidth={2} lineDashPattern={[4, 6]} zIndex={1} />],
          ),
        )}
        {/* 冇走線（例如部分港鐵巴士）：虛線駁站 */}
        {!sel && coords.length > 1 && <Polyline coordinates={coords} strokeColor={color} strokeWidth={4} lineDashPattern={[2, 8]} />}
        {arrows.map((a, i) => (
          <Marker key={`arrow-${i}`} coordinate={{ latitude: a.lat, longitude: a.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!settled} tappable={false} zIndex={4}>
            {/* 走線上面細細嘅 V 形（同網頁一樣），用走線上面嘅字色；地圖唔准旋轉，所以直接轉個圖 */}
            <View style={{ transform: [{ rotate: `${a.bearing}deg` }] }}>
              <Svg width={12} height={12} viewBox="0 0 12 12">
                <Path d="M3 8 L6 4.5 L9 8" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </Marker>
        ))}
        {stops.map((s, i) => {
          const end = i === 0 || i === stops.length - 1;
          const isFocus = s.index === focusIndex;
          // 中途站：白點深色邊；起點、終點：深色實心白邊；打開咗嘅站：公司色大點
          const size = isFocus ? 18 : end ? 16 : 10;
          return (
            <Marker
              key={`stop-${s.index}-${isFocus ? 'f' : 'n'}`}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => onStopPress(s.index)}
              tracksViewChanges={!settled}
              zIndex={isFocus ? 7 : 5}
            >
              <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: end && !isFocus ? 3 : 2.5, borderColor: end && !isFocus ? '#ffffff' : '#262626', backgroundColor: isFocus ? color : end ? '#262626' : '#ffffff' }} />
            </Marker>
          );
        })}
        {buses.map((b) => (
          // 尾班車：巴士下面加「尾班」（固定高度：巴士 28 + 2 + 標籤 16 = 46，錨點對準巴士中心）
          <Marker key={`bus-${b.key}${b.last ? '-last' : ''}`} coordinate={{ latitude: b.latitude, longitude: b.longitude }} anchor={{ x: 0.5, y: b.last ? 14 / 46 : 0.5 }} tappable={false} zIndex={b.last ? 7 : 6}>
            <View accessibilityLabel={b.label} style={{ width: b.last ? 40 : 28, alignItems: 'center', gap: 2 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff', backgroundColor: b.color, alignItems: 'center', justifyContent: 'center', opacity: b.schedule ? 0.5 : 1 }}>
                <BusGlyph size={15} color={b.ink} />
              </View>
              {b.last && (
                <View style={{ height: 16, paddingHorizontal: 5, borderRadius: 6, backgroundColor: '#c62828', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>尾班</Text>
                </View>
              )}
            </View>
          </Marker>
        ))}
        {/* 站名標籤：公司色站號 + 站名膠囊（同網頁一樣），喺站上面 */}
        {focused && (
          <Marker key={`tag-${focused.index}`} coordinate={{ latitude: focused.lat, longitude: focused.lng }} anchor={{ x: 0.5, y: 1 }} tappable={false} zIndex={8}>
            <View style={{ paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: t.card, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                <View style={{ minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: ink, ...tabular }}>{focused.index + 1}</Text>
                </View>
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: t.text }}>
                  {focused.name}
                </Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>
      <MapHelpButton company={company} multiCompany={multiCompany} />
    </View>
  );
}
