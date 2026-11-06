import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDistance } from '@hknt/core';
import { api, type NearStop } from '@/lib/api';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { warmRoute } from '@/lib/prefetch';
import { CompanyTag, ScheduledTag } from './ui';
import { Icon } from './Icon';
import { EtaInline } from './EtaInline';
import { getPrefs } from '@/lib/prefs';

const REFRESH_MS = 30_000;

export type NearbyState = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[]; lat: number; lng: number; area: { n: string; en: string | null } | null };

/** 定位 + 搵附近嘅站（範圍跟設定，預設 600 米；首頁同附近頁共用）；auto = 一開就定位（第一次會問權限；設定關咗自動定位就唔會） */
export function useNearbyStops(auto = false) {
  const [state, setState] = useState<NearbyState>({ kind: 'idle' });

  const locate = useCallback(async () => {
    setState({ kind: 'locating' });
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setState({ kind: 'error', message: '冇定位權限：請喺設定容許呢個 App 使用位置' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const body = await api.nearby(pos.coords.latitude, pos.coords.longitude, getPrefs().nearbyRadius);
      setState({ kind: 'ok', stops: body.stops, lat: pos.coords.latitude, lng: pos.coords.longitude, area: body.area ?? null });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message || '攞唔到位置，請再試' });
    }
  }, []);

  useEffect(() => {
    if (!auto || !getPrefs().autoLocate) return;
    const id = setTimeout(() => void locate(), 0);
    return () => clearTimeout(id);
  }, [auto, locate]);

  return { state, locate };
}

/** 一個附近嘅站：撳開顯示每條線下一班（同網頁 components/home/Nearby.tsx 一樣） */
export function NearbyStop({ stop, autoLoad }: { stop: NearStop; autoLoad: boolean }) {
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
                  ) : list.length ? (
                    <>
                      <EtaInline ats={list.map((e) => Date.parse(e.eta))} now={now} />
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
