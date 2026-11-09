import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { formatDistance, nearestTramStations, searchTramStations, TRAM_BRAND, TRAM_DIR_ZH, tramStation, tramStationName } from '@hknt/core';
import { Icon } from './Icon';
import { useNearbyStops } from './Nearby';
import { radius, shadow, shadowLg, useTheme } from '@/lib/theme';
import { TramMap } from './TramMap';
import { TramStationSheet } from './TramStationSheet';
import type { MapFocus, MapInset } from './SchematicMap';

const NO_INSET: MapInset = { right: 0, bottom: 0 };
const panelMax = (h: number) => (h ? Math.max(h * 0.58, Math.min(h - 120, 380)) : 380);
const FULL_GAP = 56;

/**
 * 「路線」分頁 → 電車（同網頁 components/rail/TramView.tsx 一樣）：電車路綫圖（打直）+ 站面板 + 搜尋結果（搜尋欄喺標題列，routes.tsx）。
 * 附近 600 米內嘅站加藍色虛綫圈；面板遮住嘅位（inset）俾地圖避開。
 */
export function TramView({ query, onPicked, open }: { query: string; onPicked: () => void; open?: { sta: string; n: string } | null }) {
  const t = useTheme();
  const { width: winW } = useWindowDimensions();
  const wide = winW >= 768;
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [all, setAll] = useState(wide);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [inset, setInset] = useState<MapInset>(NO_INSET);
  const results = useMemo(() => searchTramStations(query, 10), [query]);

  const { state: nearby } = useNearbyStops(true);
  const near = useMemo(() => (nearby.kind === 'ok' ? nearestTramStations(nearby.lat, nearby.lng, 600, 4) : []), [nearby]);
  const [movedNear, setMovedNear] = useState(false);
  if (!movedNear && near[0]) {
    setMovedNear(true);
    if (!sta) setFocus({ sta: near[0].sta, zoom: false });
  }
  const openSta = useCallback(
    (s: string, zoom: boolean) => {
      setFocus({ sta: s, zoom });
      setSta(s);
      if (!wide) setAll(false);
    },
    [wide],
  );
  // 由首頁、收藏撳入嚟（?mode=tram&sta=&n=）：飛去（放大置中）再打開
  const openKey = open ? `${open.sta}:${open.n}` : null;
  const [seenOpen, setSeenOpen] = useState<string | null>(null);
  if (openKey !== seenOpen) {
    setSeenOpen(openKey);
    if (open) {
      setMovedNear(true);
      setSta(open.sta);
      setFocus({ sta: open.sta, zoom: true });
      if (!wide) setAll(false);
    }
  }
  const onStation = useCallback((s: string) => openSta(s, false), [openSta]);
  const close = useCallback(() => setSta(null), []);
  const onPanelLayout = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout;
    const v = wide ? { right: Math.max(0, box.w - x), bottom: 0 } : { right: 0, bottom: Math.max(0, box.h - y) };
    setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
  };
  const sheetSize = wide ? null : { full: Math.max(200, box.h - FULL_GAP), peekMax: panelMax(box.h) };
  const panelStyle = wide ? ({ position: 'absolute', top: 12, right: 12, bottom: 12, width: 380 } as const) : ({ position: 'absolute', left: 0, right: 0, bottom: 0 } as const);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <TramMap selected={sta} onStation={onStation} focus={focus} inset={sta ? inset : NO_INSET} near={near.map((n) => n.sta)} start={near[0]?.sta ?? null} />
      {near[0] && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row' }}>
          <Pressable
            onPress={() => openSta(near[0]!.sta, true)}
            accessibilityRole="button"
            accessibilityLabel={`附近電車站：${tramStationName(near[0].sta)}，${formatDistance(near[0].distance)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: t.card, ...shadow }}
          >
            <Icon name="navigate" size={16} color="#2f6fd6" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>附近：{tramStationName(near[0].sta)}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.muted }}>· {formatDistance(near[0].distance)}</Text>
          </Pressable>
        </View>
      )}
      {sta && <TramStationSheet sta={sta} onClose={close} all={all} onAll={setAll} onLayout={onPanelLayout} sheet={sheetSize} style={panelStyle} onOpposite={(s) => openSta(s, false)} />}
      {query.trim() !== '' && (
        <View style={{ position: 'absolute', top: 8, left: 12, right: 12, maxHeight: '70%', borderRadius: radius.m, backgroundColor: t.card, ...shadowLg }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 6 }}>
            {results.map((s, i) => (
              <Pressable
                key={s}
                onPress={() => {
                  Keyboard.dismiss();
                  onPicked();
                  openSta(s, true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.s, backgroundColor: pressed || i === 0 ? t.surface2 : 'transparent' })}
              >
                <View style={{ width: 6, height: 22, borderRadius: 3, backgroundColor: TRAM_BRAND.color }} />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{tramStationName(s)}</Text>
                  <Text style={{ fontSize: 13, color: t.muted }}>{tramStation(s)?.en}</Text>
                </View>
                <Text style={{ fontSize: 12, color: t.muted }}>電車 {TRAM_DIR_ZH[tramStation(s)!.dir]}</Text>
              </Pressable>
            ))}
            {!results.length && <Text style={{ padding: 12, color: t.muted }}>搵唔到「{query.trim()}」</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
