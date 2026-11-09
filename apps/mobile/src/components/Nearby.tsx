import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDistance, routeCode, lrtDepartureRows, lrtStopName, minutesLabel, mtrDepartureRows, mtrStationName, NEARBY_CACHE_KEY, nearbyCacheUse, nearbyMoved, parseNearbyCache, tramDepartureRows, tramStopTitle, type DepartureRow, type NearbyCache, type NearMtr } from '@hknt/core';
import { api, type NearStop } from '@/lib/api';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { warmRoute } from '@/lib/prefetch';
import { CompanyTag, RegionTag, ScheduledTag } from './ui';
import { Icon } from './Icon';
import { EtaInline } from './EtaInline';
import { getPrefs, usePrefs } from '@/lib/prefs';
import { openLrt, openMtr, openTram } from '@/lib/open-mtr';

const REFRESH_MS = 30_000;

export type NearbyState = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string } | { kind: 'ok'; stops: NearStop[]; lat: number; lng: number; area: { n: string; en: string | null } | null; mtr: NearMtr[] };

/** 上次「附近」結果（core nearby-cache.ts）：AsyncStorage + 記憶體（同一次開 App 轉頁即刻有） */
let memoCache: NearbyCache<NearStop> | null = null;
async function readCache(): Promise<NearbyCache<NearStop> | null> {
  if (memoCache) return memoCache;
  try {
    memoCache = parseNearbyCache<NearStop>(await AsyncStorage.getItem(NEARBY_CACHE_KEY));
  } catch {
    memoCache = null;
  }
  return memoCache;
}
function writeCache(c: NearbyCache<NearStop>) {
  memoCache = c;
  AsyncStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify(c)).catch(() => {});
}

/**
 * 定位 + 搵附近嘅站（範圍跟設定，預設 600 米；首頁同附近頁共用）；auto = 一開就定位（第一次會問權限；設定關咗自動定位就唔會）。
 * 同網頁一樣：上次結果 15 分鐘內即刻顯示（1 分鐘內唔再定位，否則背景更新）；
 * 先用部機上次嘅位置（即刻有）顯示，再攞準確位置，郁咗超過 40 米先再問 /api/nearby。
 */
export function useNearbyStops(auto = false) {
  const [state, setState] = useState<NearbyState>({ kind: 'idle' });
  const shown = useRef<{ lat: number; lng: number } | null>(null);
  const runRef = useRef(0);
  const fetchRef = useRef(0);

  const show = useCallback((c: NearbyCache<NearStop>) => {
    shown.current = { lat: c.lat, lng: c.lng };
    setState({ kind: 'ok', stops: c.stops, lat: c.lat, lng: c.lng, area: c.area, mtr: c.mtr ?? [] });
  }, []);

  const locate = useCallback(
    async (quiet = false) => {
      const run = ++runRef.current;
      if (!quiet) setState((s) => (s.kind === 'ok' ? s : { kind: 'locating' }));
      let best = Infinity;
      const onFix = async (pos: Location.LocationObject | null) => {
        if (!pos || run !== runRef.current) return;
        const acc = pos.coords.accuracy ?? 9999;
        if (acc > best) return;
        best = acc;
        const { latitude: lat, longitude: lng } = pos.coords;
        const radius = getPrefs().nearbyRadius;
        const cur = shown.current;
        if (cur && !nearbyMoved(cur, { lat, lng })) {
          const c = await readCache();
          if (c && c.radius === radius) writeCache({ ...c, at: Date.now() });
          return;
        }
        const mine = ++fetchRef.current;
        const body = await api.nearby(lat, lng, radius);
        if (mine !== fetchRef.current) return;
        const c: NearbyCache<NearStop> = { at: Date.now(), radius, lat, lng, stops: body.stops, area: body.area ?? null, mtr: body.mtr ?? [] };
        writeCache(c);
        show(c);
      };
      try {
        // 背景更新唔好彈權限出嚟問
        const perm = quiet ? await Location.getForegroundPermissionsAsync() : await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (!quiet) setState({ kind: 'error', message: '冇定位權限：請喺設定容許呢個 App 使用位置' });
          return;
        }
        // 1. 快：部機兩分鐘內嘅位置（即刻有）
        await onFix(await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 300 }).catch(() => null)).catch(() => {});
        // 2. 準：而家嘅位置（郁咗先更新）
        await onFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      } catch (e) {
        if (!quiet && !shown.current && run === runRef.current) setState({ kind: 'error', message: (e as Error).message || '攞唔到位置，請再試' });
      }
    },
    [show],
  );

  useEffect(() => {
    if (!auto || !getPrefs().autoLocate) return;
    let cancelled = false;
    void readCache().then((c) => {
      if (cancelled) return;
      const use = nearbyCacheUse(c, Date.now(), getPrefs().nearbyRadius);
      if (use) show(c!);
      if (use !== 'fresh') void locate(use === 'stale');
    });
    return () => {
      cancelled = true;
    };
  }, [auto, locate, show]);

  return { state, locate: useCallback(() => void locate(false), [locate]) };
}

/** 附近嘅港鐵站／輕鐵站／電車站（同網頁 NearbyRail 一樣）：每條綫（路線）每個方向（電車：每個目的地）下一班，撳入路綫圖嗰個站 */
export function NearbyRail({ kind, sta, distance, autoLoad }: { kind: 'mtr' | 'lrt' | 'tram'; sta: string; distance: number; autoLoad: boolean }) {
  const t = useTheme();
  const { etaFormat } = usePrefs();
  const [open, setOpen] = useState(autoLoad);
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  const lrt = kind === 'lrt';
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const now = Date.now();
        let rows: DepartureRow[];
        if (kind === 'tram') {
          // 電車冇官方實時：realtime 多數係 null，用運輸署時間表推算（rows 標 scheduled）
          const body = await api.tram(sta);
          rows = tramDepartureRows(sta, body.realtime, body.schedule, 8);
        } else rows = lrt ? lrtDepartureRows(sta, (await api.lrt(sta)).platforms, now, 8) : mtrDepartureRows(sta, (await api.mtr(sta)).lines, 8);
        if (!cancelled) setState({ rows, now });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, sta, lrt, kind]);
  const go = () => (kind === 'tram' ? openTram(sta) : lrt ? openLrt(sta) : openMtr(sta));
  const title = kind === 'tram' ? `電車${tramStopTitle(sta)}` : `${lrt ? '輕鐵' : '港鐵'}${lrt ? lrtStopName(sta) : mtrStationName(sta)}站`;
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingLeft: 16, paddingRight: 14 }}>
        <Icon name={kind === 'tram' ? 'tram' : lrt ? 'lrt' : 'train'} size={18} color={t.accent} />
        <Text style={{ flex: 1, fontWeight: '700', fontSize: 16, color: t.text }}>{title}</Text>
        <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: t.surface2, color: t.muted, fontSize: 12, fontWeight: '700', ...tabular }}>
          {formatDistance(distance)}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={t.muted} />
        </View>
      </Pressable>
      {open && (
        <View style={{ borderTopWidth: 1, borderTopColor: t.line }}>
          {state === null && <Text style={{ padding: 12, paddingLeft: 16, color: t.muted }}>…</Text>}
          {state?.rows.length === 0 && <Text style={{ padding: 12, paddingLeft: 16, color: t.muted }}>暫時冇班次</Text>}
          {state?.rows.map((r) => (
            <Pressable key={r.key} onPress={go} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
              <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink }}>{r.badge.text}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: t.text }}>
                往{r.dest}
              </Text>
              {r.platform ? (
                <View accessibilityLabel={`${r.platform} 號月台`} style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: r.badge.bg }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: r.badge.ink }}>{r.platform}</Text>
                </View>
              ) : null}
              {r.scheduled && (kind === 'tram' ? <EstimateTag /> : <ScheduledTag />)}
              <Text style={{ minWidth: 64, textAlign: 'right', fontSize: r.nowText ? 14 : 16, fontWeight: '800', color: t.text, ...tabular }}>{r.nowText ?? minutesLabel(r.at, state.now, etaFormat)}</Text>
            </Pressable>
          ))}
          {kind === 'tram' && state?.rows.some((r) => r.scheduled) && (
            <Text style={{ paddingTop: 8, paddingHorizontal: 16, fontSize: 12, color: t.muted }}>電車冇實時到站資料，以上按運輸署時間表推算</Text>
          )}
          <Pressable onPress={go} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>喺路綫圖打開</Text>
            <Icon name="chevron-right" size={16} color={t.accent} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** 電車班次標「約」（冇實時，按運輸署時間表推算；同網頁一樣，樣式同 ScheduledTag） */
function EstimateTag() {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: t.surface2, color: t.muted }}>約</Text>
  );
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
        <Icon name={stop.co === 'gmb' ? 'minibus' : 'pin'} size={18} color={t.accent} />
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
                  {/* 專線小巴：號碼（NT-2 → 2）旁邊標地區 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, ...tabular }}>{routeCode(r.co, r.route)}</Text>
                    <RegionTag co={r.co} route={r.route} inline />
                  </View>
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
