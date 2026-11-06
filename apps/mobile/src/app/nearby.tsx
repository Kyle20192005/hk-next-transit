import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { AppBar, BarButton, EmptyState } from '@/components/ui';
import { NearbyStop, useNearbyStops } from '@/components/Nearby';
import { useTheme } from '@/lib/theme';
import { radiusLabel } from '@hknt/core';
import { usePrefs } from '@/lib/prefs';

const AUTO_LOAD = 4;

/** 附近車站（唔係分頁：由首頁「附近」或者巴士路線頁「附近巴士站」撳入嚟）：定位搵附近（設定範圍）嘅站，每條路線下一班 */
export default function NearbyScreen() {
  const { nearbyRadius } = usePrefs();
  const t = useTheme();
  const { state, locate } = useNearbyStops(true);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BarButton icon="back" label="返回" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>附近車站</Text>
          {state.kind === 'ok' && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7 }}>
              {state.stops.length ? `${radiusLabel(nearbyRadius)}內 ${state.stops.length} 個車站` : `${radiusLabel(nearbyRadius)}內冇車站`}
            </Text>
          )}
        </View>
        {state.kind === 'ok' && <BarButton icon="locate" label="重新定位" onPress={locate} />}
      </AppBar>
      {state.kind !== 'ok' ? (
        <EmptyState icon="pin" action={{ label: state.kind === 'locating' ? '定位中…' : '搵附近車站', icon: 'locate', onPress: locate, disabled: state.kind === 'locating' }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>搵你附近 {radiusLabel(nearbyRadius)}內嘅巴士站，同埋每條路線下一班車。</Text>
          {state.kind === 'error' && <Text style={{ color: t.special, textAlign: 'center' }}>{state.message}</Text>}
        </EmptyState>
      ) : (
        <FlatList
          data={state.stops}
          keyExtractor={(s) => `${s.co}-${s.id}`}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item, index }) => <NearbyStop stop={item} autoLoad={index < AUTO_LOAD} />}
        />
      )}
    </View>
  );
}
