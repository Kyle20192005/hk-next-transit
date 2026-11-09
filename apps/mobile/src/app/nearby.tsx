import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { AppBar, BarButton, EmptyState } from '@/components/ui';
import { NearbyRail, NearbyStop, useNearbyStops } from '@/components/Nearby';
import { useTheme } from '@/lib/theme';
import { nearestLrtStops, radiusLabel } from '@hknt/core';
import type { NearStop } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';

const AUTO_LOAD = 4;

/** 附近車站一項：巴士站，或者範圍內嘅港鐵站、輕鐵站（按距離混埋排，同網頁一樣） */
type NearItem = { kind: 'bus'; stop: NearStop; distance: number } | { kind: 'mtr' | 'lrt'; sta: string; distance: number };

/** 附近車站（唔係分頁：由首頁「附近」或者巴士路線頁「附近巴士站」撳入嚟）：定位搵附近（設定範圍）嘅巴士站、港鐵站、輕鐵站，每條路線下一班 */
export default function NearbyScreen() {
  const { nearbyRadius } = usePrefs();
  const t = useTheme();
  const { state, locate } = useNearbyStops(true);
  const items: NearItem[] =
    state.kind === 'ok'
      ? [
          ...state.stops.map((s) => ({ kind: 'bus' as const, stop: s, distance: s.distance })),
          ...state.mtr.filter((m) => m.distance <= nearbyRadius).map((m) => ({ kind: 'mtr' as const, sta: m.sta, distance: m.distance })),
          ...nearestLrtStops(state.lat, state.lng, nearbyRadius, 6).map((m) => ({ kind: 'lrt' as const, sta: m.sta, distance: m.distance })),
        ].sort((a, b) => a.distance - b.distance)
      : [];
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BarButton icon="back" label="返回" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>附近車站</Text>
          {state.kind === 'ok' && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7 }}>
              {items.length ? `${radiusLabel(nearbyRadius)}內 ${items.length} 個車站` : `${radiusLabel(nearbyRadius)}內冇車站`}
            </Text>
          )}
        </View>
        {state.kind === 'ok' && <BarButton icon="locate" label="重新定位" onPress={locate} />}
      </AppBar>
      {state.kind !== 'ok' ? (
        <EmptyState icon="pin" action={{ label: state.kind === 'locating' ? '定位中…' : '搵附近車站', icon: 'locate', onPress: locate, disabled: state.kind === 'locating' }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>搵你附近 {radiusLabel(nearbyRadius)}內嘅巴士站、港鐵站同輕鐵站，同埋每條路線下一班車。</Text>
          {state.kind === 'error' && <Text style={{ color: t.special, textAlign: 'center' }}>{state.message}</Text>}
        </EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => (it.kind === 'bus' ? `${it.stop.co}-${it.stop.id}` : `${it.kind}-${it.sta}`)}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item, index }) =>
            item.kind === 'bus' ? <NearbyStop stop={item.stop} autoLoad={index < AUTO_LOAD} /> : <NearbyRail kind={item.kind} sta={item.sta} distance={item.distance} autoLoad={index < AUTO_LOAD} />
          }
        />
      )}
    </View>
  );
}
