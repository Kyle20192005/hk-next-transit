import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { formatDistance } from '@hknt/core';
import { api, type NearStop } from '@/lib/api';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { AppBar, BarButton, CompanyTag, EmptyState, ScheduledTag } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';

const AUTO_LOAD = 4;
const REFRESH_MS = 30_000;

type State = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[] };

/** 附近車站：定位搵 600 米內嘅站（四間公司），每條路線下一班 */
export default function NearbyTab() {
  const t = useTheme();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const locate = useCallback(async () => {
    setState({ kind: 'locating' });
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setState({ kind: 'error', message: '冇定位權限：請喺設定容許呢個 App 使用位置' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const body = await api.nearby(pos.coords.latitude, pos.coords.longitude);
      setState({ kind: 'ok', stops: body.stops });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message || '攞唔到位置，請再試' });
    }
  }, []);

  // 之前已經俾咗權限就自動定位
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (p.granted) void locate();
      })
      .catch(() => {});
  }, [locate]);

  return (
    <View style={{ flex: 1 }}>
      <AppBar style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>附近車站</Text>
          {state.kind === 'ok' && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7 }}>
              {state.stops.length ? `600 米內 ${state.stops.length} 個車站` : '600 米內冇車站'}
            </Text>
          )}
        </View>
        {state.kind === 'ok' && <BarButton icon="locate" label="重新定位" onPress={locate} />}
      </AppBar>
      {state.kind !== 'ok' ? (
        <EmptyState icon="pin" action={{ label: state.kind === 'locating' ? '定位中…' : '搵附近車站', icon: 'locate', onPress: locate, disabled: state.kind === 'locating' }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>搵你附近 600 米內嘅巴士站，同埋每條路線下一班車。</Text>
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

function NearbyStop({ stop, autoLoad }: { stop: NearStop; autoLoad: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(autoLoad);
  const [etas, setEtas] = useState<Awaited<ReturnType<typeof api.stopEtas>> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.stopEtas(stop.co, stop.id);
        if (!cancelled) setEtas(body);
      } catch {
        /* 下次再試 */
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, stop.co, stop.id]);

  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingLeft: 16, paddingRight: 14 }}>
        <Icon name="pin" size={18} color={t.accent} />
        <Text style={{ flex: 1, fontWeight: '700', fontSize: 16, color: t.text }}>{stop.name}</Text>
        <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: t.surface2, color: t.muted, fontSize: 12, fontWeight: '700', ...tabular }}>
          {formatDistance(stop.distance)}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={t.muted} />
        </View>
      </Pressable>
      {open &&
        stop.routes.map((r) => {
          const list = etas?.routes.find((x) => x.route === r.route && x.dir === r.dir)?.etas ?? (etas ? [] : null);
          const mins = list?.map((e) => Math.max(0, Math.round((Date.parse(e.eta) - now) / 60000)));
          return (
              <Pressable
                key={`${r.co}-${r.route}-${r.dir}`}
                onPressIn={() => warmRoute(r.co, r.route, { dir: r.dir, stopId: stop.id })}
                onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: r.co, route: r.route, dir: r.dir, stop: stop.id } })}
                accessibilityRole="link"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line }}>
                <View style={{ width: 96, gap: 3 }}>
                  <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, ...tabular }}>{r.route}</Text>
                  <CompanyTag companies={r.companies} />
                </View>
                <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '500' }}>
                  往 {r.dest}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  {list === null ? (
                    <Text style={{ color: t.muted }}>…</Text>
                  ) : mins && mins.length ? (
                    <>
                      <Text style={{ color: t.accent, ...tabular }}>
                        <Text style={{ fontSize: 20, fontWeight: '800' }}>{mins[0] === 0 ? '即將' : mins[0]}</Text>
                        {mins[0] !== 0 && <Text style={{ fontSize: 13, fontWeight: '700' }}> 分</Text>}
                      </Text>
                      {mins.length > 1 && <Text style={{ color: t.muted, fontSize: 12 }}>{mins.slice(1).join('、')} 分</Text>}
                      {list[0]?.scheduled && <ScheduledTag />}
                    </>
                  ) : (
                    <Text style={{ color: t.muted }}>冇班次</Text>
                  )}
                </View>
              </Pressable>
          );
        })}
    </View>
  );
}
