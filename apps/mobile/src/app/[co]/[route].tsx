import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, Share, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  alightSummary,
  matchStops,
  nearestStopIndex,
  routeMinutes,
  shareText,
  BusStabilizer,
  defaultDir,
  pickVariant,
  busDistanceTo,
  busFraction,
  companyColor,
  companyInk,
  companyNames,
  fmtMinutes,
  formatDistance,
  formatFare,
  joyYouFare,
  labelEtas,
  LIVE_REFRESH,
  adjustLastBus,
  lastBusAt,
  lastBusEtaIndex,
  parseLiveBuses,
  pointOnPath,
  routeCode,
  routeRegion,
  routeTitle,
  routeHeadDest,
  lastStopIsTerminus,
  GMB_REGION_NAME,
  secondsFrom,
  serviceWindow,
  smoothLine,
  sortVariants,
  statusText,
  stopCumMetres,
  stopPathIndices,
  variantLabel,
  variantStops,
  variantsForDir,
  type Calendar,
  type Company,
  type Dir,
  type Eta,
  type LatLng,
  type RouteData,
  type TrackedBus,
} from '@hknt/core';
import { api, API_BASE, cachedRoute, calendarOnce, freshRoute, isCo, type Co } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useFavorite } from '@/lib/favorites';
import { addRecent } from '@/lib/recent';
import { radius, shadow, shadowLg, tabular, useTheme } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { BarButton } from '@/components/ui';
import { StopRow, type RowBus } from '@/components/StopRow';
import { RouteMap, type MapBus, type MapLine, type MapStop } from '@/components/RouteMap';
import { TimetableSheet } from '@/components/TimetableSheet';
import { VariantPicker, type VariantItem } from '@/components/VariantPicker';
import { getPrefs } from '@/lib/prefs';

const ETA_REFRESH_MS = LIVE_REFRESH.etaMs;
const BUSES_REFRESH_MS = LIVE_REFRESH.busesMs;
const MAX_ETAS = LIVE_REFRESH.maxEtas;
const NEAREST_MAX_M = 500;

type StopItem = { dir: Dir; stopId: string; name: string; lat?: number; lng?: number };

/**
 * 路線頁（同網頁版一樣）：上面（標題列、走法、地圖）固定，只有站點列表捲動；站點一次只開一個。
 * 網址參數：dir 方向、v 走法、stop 一開就打開嘅站（由「附近」或者「收藏」撳入嚟）。
 */
export default function RouteScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ co: string; route: string; dir?: string; v?: string; stop?: string }>();
  const co: Co = isCo(params.co) ? params.co : 'ctb';
  const [data, setData] = useState<RouteData | null>(null);
  const [calendar, setCalendar] = useState<Calendar>({});
  const [error, setError] = useState<string | null>(null);

  // 開過嘅路線即刻用手機入面嘅資料顯示，同時喺背景攞最新（數據每日先更新一次）
  const fetchAll = useCallback(async () => {
    const cached = await cachedRoute(co, params.route);
    const cal = calendarOnce();
    if (cached) {
      cal.then(setCalendar).catch(() => {});
      setData(cached);
    }
    try {
      const [r, c] = await Promise.all([freshRoute(co, params.route), cal]);
      setCalendar(c);
      // 冇變就唔使重新 render（同一日嘅數據）
      if (!cached || JSON.stringify(cached) !== JSON.stringify(r)) setData(r);
    } catch (e) {
      if (!cached) setError((e as Error).message);
    }
  }, [co, params.route]);
  useEffect(() => {
    const id = setTimeout(() => void fetchAll(), 0);
    return () => clearTimeout(id);
  }, [fetchAll]);
  const load = () => {
    setError(null);
    void fetchAll();
  };

  // 載入中同出錯都即刻畫標題列（返回掣、路線號碼），唔好得一個轉圈
  if (error || !data)
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <RouteBar co={co} route={params.route} />
        {error ? (
          <Pressable onPress={load} style={{ alignItems: 'center', padding: 32 }}>
            <Text style={{ color: t.special, textAlign: 'center' }}>載入失敗：{error}</Text>
            <Text style={{ color: t.accent, marginTop: 6, fontWeight: '600' }}>撳一下再試</Text>
          </Pressable>
        ) : (
          <RouteSkeleton />
        )}
      </View>
    );
  return <RouteView key={`${co}-${data.route}`} co={co} data={data} calendar={calendar} initialDir={params.dir} initialVariant={params.v} initialStop={params.stop} />;
}

/**
 * 黃色標題列：‹　38　往 北角碼頭　（右邊按鈕由 children 傳入）。
 * 專線小巴顯示號碼（NT-2 → 2），公司名後面加地區細框（同網頁 .route-bar-region 一樣）。
 */
function RouteBar({ co, route, companiesLabel, dest, note, children }: { co: Co; route: string; companiesLabel?: string; dest?: string; note?: string | null; children?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const region = routeRegion(co, route);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: insets.top + 8, paddingBottom: 10, paddingLeft: 4, paddingRight: 10, minHeight: insets.top + 68, backgroundColor: t.brand, borderBottomLeftRadius: radius.bar, borderBottomRightRadius: radius.bar }}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel="返回" hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={26} color={t.onBrand} />
      </Pressable>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.7 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: t.onBrand }}>{companiesLabel ?? ' '}</Text>
          {region && (
            <View style={{ paddingHorizontal: 4, borderWidth: 1, borderColor: t.onBrand, borderRadius: 4 }}>
              <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: '700', color: t.onBrand }}>{GMB_REGION_NAME[region]}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 32, fontWeight: '800', color: t.onBrand, letterSpacing: -0.6, lineHeight: 34, ...tabular }}>{routeCode(co, route)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 6 }}>
        {dest !== undefined && (
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', color: t.onBrand }}>
            <Text style={{ fontWeight: '500', opacity: 0.75 }}>往 </Text>
            {dest}
          </Text>
        )}
        {note && <Text style={{ fontSize: 12, fontWeight: '600', color: t.onBrand, opacity: 0.75 }}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

/** 載入中：走法、地圖、站點列表嘅灰色骨架（輕輕閃），等數據返嚟 */
function RouteSkeleton() {
  const t = useTheme();
  const { height: winH } = useWindowDimensions();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const bar = (w: `${number}%`, h = 14) => <View style={{ width: w, height: h, borderRadius: 7, backgroundColor: t.line }} />;
  return (
    <Animated.View style={{ flex: 1, opacity: pulse }} accessibilityLabel="載入中">
      <View style={{ padding: 12, gap: 10 }}>
        <View style={{ height: 46, borderRadius: radius.m, backgroundColor: t.card, justifyContent: 'center', paddingHorizontal: 14 }}>{bar('45%')}</View>
        <View style={{ height: Math.max(150, Math.min(280, winH * 0.26)), borderRadius: radius.l, backgroundColor: t.line }} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 12, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, backgroundColor: t.card, paddingTop: 14, gap: 26 }}>
        {[60, 72, 50, 66, 58, 70].map((w, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 46, paddingRight: 16 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: t.line }} />
            <View style={{ flex: 1 }}>{bar(`${w}%`)}</View>
            {bar('12%')}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function RouteView({ co, data, calendar, initialDir, initialVariant, initialStop }: { co: Co; data: RouteData; calendar: Calendar; initialDir?: string; initialVariant?: string; initialStop?: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const companies = (data.companies ?? [data.company]) as Company[];
  const multiCompany = companies.length > 1;
  const color = companyColor(data.company) ?? t.routeLine;

  const dirs = useMemo(() => (['O', 'I'] as Dir[]).filter((d) => data.directions[d]?.length), [data]);
  const [dir, setDir] = useState<Dir>(() => defaultDir(data, initialDir));
  const [variantId, setVariantId] = useState<string | null>(initialVariant ?? null);
  const [stopParam, setStopParam] = useState(initialStop ?? null);

  // 走法狀態要跟時間變：每分鐘更新
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dirVariants = useMemo(() => variantsForDir(data, dir), [data, dir]);
  const sorted = useMemo(() => sortVariants(dirVariants, calendar, now), [dirVariants, calendar, now]);
  // pickVariant 同預先 fetch 共用，要一致，否則預熱嘅 /api/buses 網址對唔上
  const selected = pickVariant(sorted, dir, { variantId, stopId: stopParam });

  const items: VariantItem[] = sorted.map(({ variant: v, status }) => {
    const w = serviceWindow(v, calendar, now);
    return {
      id: v.id,
      label: variantLabel(v),
      special: v.special,
      running: status.state === 'running' || status.state === 'lastRunning',
      unknown: status.state === 'unknown',
      status: statusText(status),
      statusShort: statusText(status, true),
      window: w ? `今日 ${fmtMinutes(w[0])}–${w[1] >= 1440 ? '翌日 ' : ''}${fmtMinutes(w[1])} 由總站開出` : null,
      duration: routeMinutes(v),
    };
  });

  const stops: StopItem[] = useMemo(
    () =>
      (selected ? variantStops(selected) : (data.directions[dir] ?? []).map((stopId) => ({ dir, stopId }))).map((s) => ({
        dir: s.dir,
        stopId: s.stopId,
        name: data.stops[s.stopId]?.nameTc ?? s.stopId,
        lat: data.stops[s.stopId]?.lat,
        lng: data.stops[s.stopId]?.lng,
      })),
    [selected, data, dir],
  );
  // 標題「往 X」、收藏、最近睇過、分享：專線小巴用路線起訖點（循環線最後一個站唔係真正終點；同網頁 page.tsx 一樣）
  const dest = routeHeadDest(co, data, dir, selected, stops[stops.length - 1]?.name) ?? '';
  // 最後一個站係咪終點站：專線小巴循環線最後一個站有車費 = 上得車（有車費、尾班車、收藏，「最近」揀得）
  const endIsTerminus = useMemo(() => lastStopIsTerminus(co, selected, stops[stops.length - 1]?.stopId), [co, selected, stops]);
  const isEnd = (i: number) => i === stops.length - 1 && endIsTerminus;
  // 首頁「最近睇過」
  useEffect(() => {
    if (dest) addRecent({ co, route: data.route, dir, dest, companies });
    // companies 每次 render 都係新 array，用路線、方向、目的地判斷就夠
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co, data.route, dir, dest]);
  const joyYou = data.joyYou !== false;
  const fares = stops.map((s, i) => {
    const adult = !isEnd(i) ? selected?.fares?.[s.stopId] : undefined;
    return adult === undefined ? null : { adult: formatFare(adult), joyYou: joyYou ? formatFare(joyYouFare(adult)) : null };
  });

  // ---------- 地圖 ----------
  const mapStops: MapStop[] = useMemo(() => stops.flatMap((s, i) => (s.lat !== undefined && s.lng !== undefined ? [{ index: i, name: s.name, lat: s.lat, lng: s.lng }] : [])), [stops]);
  const mapLines: MapLine[] = useMemo(
    () =>
      sorted
        .filter((x) => x.variant.line)
        .map((x) => ({
          id: x.variant.id,
          selected: x.variant.id === selected?.id,
          special: x.variant.special,
          segments: x.variant.line!.map((seg) => smoothLine(seg.map(([lng, lat]) => [lat, lng] as [number, number])).map(([lat, lng]) => ({ latitude: lat, longitude: lng }))),
        })),
    [sorted, selected],
  );
  const path: LatLng[] = useMemo(() => {
    const sel = mapLines.find((l) => l.selected);
    return sel ? sel.segments.flatMap((sg, i) => (i === 0 ? sg : sg.slice(1))).map((p) => [p.latitude, p.longitude] as LatLng) : [];
  }, [mapLines]);
  const cumMetres = useMemo(() => stopCumMetres(path, stops.map((s) => [s.lat ?? 0, s.lng ?? 0] as LatLng)), [path, stops]);

  // ---------- 打開咗嘅站 ----------
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaNow, setEtaNow] = useState(() => Date.now());
  const list = useRef<FlatList<StopItem>>(null);
  // 落車站（同網頁 StopList 一樣）：打開站之後撳「揀落車站」，再撳下面一個站
  const [alight, setAlight] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  // 到站時間幾時攞到；撳「重新整理」即刻再攞
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openStop = useCallback((i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setEtaError(null);
    setFailed([]);
    setFetchedAt(null);
    setPicking(false);
    setAlight((a) => (i !== null && a !== null && a > i ? a : null));
    if (i !== null) requestAnimationFrame(() => list.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 }));
  }, []);

  // 由「附近」／「收藏」撳入嚟：一開就打開指定嘅站
  useEffect(() => {
    if (!stopParam) return;
    const i = stops.findIndex((s) => s.stopId === stopParam);
    if (i >= 0) setTimeout(() => openStop(i), 300);
    // 只做一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = openIndex !== null ? stops[openIndex] : undefined;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.eta(co, data.route, open.stopId);
        if (cancelled) return;
        setEtas(body.etas.filter((e) => e.dir === open.dir && e.eta).slice(0, MAX_ETAS));
        setFailed(body.failed ?? []);
        setEtaError(null);
        setFetchedAt(Date.now());
      } catch (e) {
        if (!cancelled) setEtaError((e as Error).message);
      }
      if (!cancelled) setEtaNow(Date.now());
    };
    void tick();
    const id = setInterval(tick, ETA_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, co, data.route, refreshKey]);

  // ---------- 成條線嘅巴士位置 ----------
  // 記低屬邊個走法：換咗走法，舊走法嘅巴士唔好畫上新走法
  const [liveRaw, setLive] = useState<{ variantId: string; buses: TrackedBus[]; segSeconds: number[] } | null>(null);
  const live = liveRaw && liveRaw.variantId === selected?.id ? liveRaw : null;
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.buses(co, data.route, selected.id);
        if (!cancelled)
          setLive({
            variantId: selected.id,
            buses: parseLiveBuses(body.buses),
            segSeconds: body.segSeconds,
          });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const id = setInterval(tick, BUSES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [co, data.route, selected]);
  const [busNow, setBusNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setBusNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  // 只准向前：換方向或者走法就重新開始記位置
  const stabilizer = useMemo(() => new BusStabilizer(), [dir, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stable = useMemo(() => (live ? stabilizer.update(live.buses, live.segSeconds, busNow) : []), [stabilizer, live, busNow]);

  const isMine = (e: Eta) => !selected || !e.variant?.variantId || e.variant.variantId === selected.id;
  const seg = live?.segSeconds ?? selected?.segSeconds ?? null;
  const travel = useMemo(() => {
    if (!seg || openIndex === null) return null;
    const cum = [0];
    for (const s of seg) cum.push(cum[cum.length - 1]! + s);
    return secondsFrom(cum, openIndex);
  }, [seg, openIndex]);
  const nextAtOpen = etas?.filter(isMine).map((e) => Date.parse(e.eta!)).filter((x) => x >= etaNow - 60_000).sort((a, b) => a - b)[0] ?? null;

  // 打開咗嘅站嘅尾班車（終點站唔使）
  const lastBusStop = openIndex !== null && !isEnd(openIndex) ? stops[openIndex] : undefined;
  // 時間表估計再用實測行車時間校正（夜晚車快，中途站估計會遲成十幾分鐘；同網頁 StopList 一樣）
  const openLastBus = useMemo(() => {
    if (!lastBusStop || openIndex === null) return null;
    const liveMin = live ? live.segSeconds.slice(0, openIndex).reduce((a, b) => a + b, 0) / 60 : null;
    return adjustLastBus(lastBusAt(dirVariants, lastBusStop.stopId, lastBusStop.dir, calendar, etaNow), liveMin);
  }, [lastBusStop, openIndex, live, dirVariants, calendar, etaNow]);
  const lastByTime = useMemo(() => (etas ? lastBusEtaIndex(etas, openLastBus) : -1), [etas, openLastBus]);

  // 每班車而家喺邊（「原定班次」唔係實時，唔配對）；同時認邊架車係尾班（同網頁 StopList 一樣）
  const matched = useMemo(() => {
    if (!live || openIndex === null || !etas) return null;
    const mine = etas.filter((e) => isMine(e) && !e.scheduled);
    const labels = labelEtas(live.buses, openIndex, mine.map((e) => Date.parse(e.eta!)), live.segSeconds, etaNow);
    const lk = lastByTime >= 0 ? mine.indexOf(etas[lastByTime]!) : -1;
    const ll = lk >= 0 ? labels[lk] : undefined;
    return { mine, labels, lastTracked: ll && ll.kind !== 'notDeparted' ? ll.bus : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, openIndex, etas, selected?.id, etaNow, lastByTime]);
  // 尾班車：認到之後記住佢（穩定 id），閂咗個站都繼續標，直至佢行完全程
  const [lastId, setLastId] = useState<number | null>(null);
  const trackedId = matched?.lastTracked ? (stable.find((x) => x.bus === matched.lastTracked)?.id ?? null) : null;
  if (trackedId !== null && trackedId !== lastId) setLastId(trackedId);
  const lastStable = stable.find((x) => x.id === (trackedId ?? lastId)) ?? null;
  const lastStableId = lastStable?.id ?? null;
  // 呢個站邊班係尾班：追蹤緊嘅尾班車就係嚟緊呢度嗰架就用佢（最準），否則按時間認
  const lastEtaIndex = useMemo(() => {
    if (etas && matched && lastStable) {
      const k = matched.labels.findIndex((l) => l.kind !== 'notDeparted' && l.bus === lastStable.bus);
      if (k >= 0) return etas.indexOf(matched.mine[k]!);
    }
    return lastByTime;
  }, [etas, matched, lastStable, lastByTime]);

  const whereLabels = useMemo(() => {
    if (!live || openIndex === null || !etas || !matched) return null;
    const { mine, labels } = matched;
    return etas.map((e) => {
      const k = mine.indexOf(e);
      if (k < 0) return null;
      const l = labels[k]!;
      if (l.kind === 'notDeparted') return '未開出';
      const m = busDistanceTo(l.bus, busFraction(l.bus, live.segSeconds, etaNow), openIndex, cumMetres);
      const dist = m === null || m < 50 ? '' : ` · ${formatDistance(m)}`;
      return l.kind === 'arriving' ? `即將到站${dist}` : `距離 ${l.stopsAway} 個站${dist}`;
    });
  }, [live, openIndex, etas, matched, etaNow, cumMetres]);

  const colorOf = (b: TrackedBus) => {
    const c = multiCompany ? (b.company ?? data.company) : data.company;
    return { color: companyColor(c) ?? color, ink: companyInk(c), company: c };
  };
  // 時間線上嘅巴士：兩站之間前半段畫喺上一行下半，後半段畫喺下一行上半
  const rowBuses = useMemo(() => {
    const out = new Map<number, RowBus[]>();
    const last = stops.length - 1;
    for (const { id, bus, progress } of stable) {
      const from = Math.min(Math.floor(progress), last - 1);
      const f = Math.min(1, progress - from);
      const [row, half, tt] = f < 0.5 ? [from, 'below' as const, f * 2] : [from + 1, 'above' as const, (f - 0.5) * 2];
      out.set(row, [...(out.get(row) ?? []), { key: id, half, t: tt, schedule: bus.schedule, last: id === lastStableId, ...colorOf(bus) }]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, stops, lastStableId]);
  // 地圖上嘅巴士：有 GPS（港鐵巴士）直接用，冇就沿走線推算
  const mapBuses: MapBus[] = useMemo(() => {
    const idx = path.length ? stopPathIndices(path, mapStops.map((m) => [m.lat, m.lng] as LatLng)) : [];
    const at = (i: number) => mapStops.findIndex((m) => m.index === i);
    const last = stops.length - 1;
    return stable.flatMap(({ id, bus, progress }): MapBus[] => {
      const from = Math.min(Math.floor(progress), last - 1);
      const f = Math.min(1, progress - from);
      const mins = Math.max(0, Math.round((bus.nextEta - busNow) / 60000));
      const isLast = id === lastStableId;
      const label = (isLast ? '尾班車：' : '') + (bus.schedule ? '按時間表估計：' : '') + (mins === 0 ? `即將到 ${stops[from + 1]?.name ?? ''}` : `約 ${mins} 分鐘到 ${stops[from + 1]?.name ?? ''}`);
      const base = { key: id, schedule: Boolean(bus.schedule), last: isLast, label, ...colorOf(bus) };
      if (bus.gps) return [{ ...base, latitude: bus.gps.lat, longitude: bus.gps.lng }];
      const a = at(from);
      const c = at(from + 1);
      const pt = idx[a] !== undefined && idx[c] !== undefined ? pointOnPath(path, idx[a]!, idx[c]!, f) : null;
      if (pt) return [{ ...base, latitude: pt.lat, longitude: pt.lng }];
      const ma = mapStops[a];
      const mc = mapStops[c];
      return ma && mc ? [{ ...base, latitude: ma.lat + (mc.lat - ma.lat) * f, longitude: ma.lng + (mc.lng - ma.lng) * f }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, path, mapStops, stops, busNow]);

  // ---------- 最近嘅站：開頁自動定位，500 米內最近（唔計終點站）就打開 ----------
  const [nearest, setNearest] = useState<{ index: number; metres: number } | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied' | 'far' | 'error'>('idle');
  const findNearest = useCallback(
    async (openIt: boolean, ask: boolean) => {
      setLocating('busy');
      try {
        const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return setLocating(perm.canAskAgain && !ask ? 'idle' : 'denied');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { latitude: la, longitude: lo } = pos.coords;
        let best: { index: number; metres: number } | null = null;
        stops.forEach((s, i) => {
          if (s.lat === undefined || s.lng === undefined || (i === stops.length - 1 && endIsTerminus)) return; // 終點站唔使
          const m = Math.hypot((s.lat - la) * 111320, (s.lng - lo) * 111320 * Math.cos((la * Math.PI) / 180));
          if (!best || m < best.metres) best = { index: i, metres: m };
        });
        const b = best as { index: number; metres: number } | null;
        if (!b || b.metres > NEAREST_MAX_M) {
          setNearest(null);
          return setLocating('far');
        }
        setNearest(b);
        setLocating('idle');
        if (openIt) openStop(b.index);
      } catch {
        setLocating('error');
      }
    },
    [stops, endIsTerminus, openStop],
  );
  // 開頁：已經有權限就自動搵（由「附近」撳入嚟就唔使打開）；未問過就第一次問
  // 設定關咗「自動定位」就唔搵，等用戶自己撳「定位」
  useEffect(() => {
    if (!getPrefs().autoLocate) return;
    const id = setTimeout(() => void findNearest(!stopParam, true), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [timetable, setTimetable] = useState(false);
  const [fav, toggleFav] = useFavorite({ co, route: data.route, dir, dest, companies });
  const other = dirs.find((d) => d !== dir);
  // 轉方向：打開咗站就搵對面方向最近（500 米內）嘅站，轉過去即刻打開（同網頁 SwapLink 一樣）
  const [pendingStop, setPendingStop] = useState<string | null>(null);
  const changeDir = (d: Dir) => {
    haptic.tap();
    let target: string | null = null;
    if (openIndex !== null) {
      const sel = pickVariant(sortVariants(variantsForDir(data, d), calendar, now), d, {});
      const otherStops = (sel ? variantStops(sel) : (data.directions[d] ?? []).map((stopId) => ({ stopId }))).map((x) => ({ stopId: x.stopId, lat: data.stops[x.stopId]?.lat, lng: data.stops[x.stopId]?.lng }));
      const k = nearestStopIndex(stops[openIndex], otherStops);
      if (k >= 0) target = otherStops[k]!.stopId;
    }
    setDir(d);
    setVariantId(null);
    setStopParam(target);
    setPendingStop(target);
    setNearest(null);
    openStop(null);
  };
  useEffect(() => {
    if (!pendingStop) return;
    const i = stops.findIndex((x) => x.stopId === pendingStop);
    if (i < 0) return;
    const id = setTimeout(() => {
      setPendingStop(null);
      openStop(i);
    }, 300);
    return () => clearTimeout(id);
  }, [pendingStop, stops, openStop]);

  // 落車站摘要（打開咗嘅站顯示）
  const alightInfo =
    openIndex !== null && alight !== null && alight > openIndex
      ? {
          name: stops[alight]?.name ?? '',
          summary: alightSummary({ nextAt: nextAtOpen, travelSeconds: travel?.[alight] ?? null, stops: alight - openIndex, metres: (cumMetres[alight] ?? 0) - (cumMetres[openIndex] ?? 0) || null }),
        }
      : null;
  // 分享：系統分享面板（路線、站、下一班、連結）
  const share = () => {
    if (openIndex === null) return;
    const s = stops[openIndex]!;
    const url = `${API_BASE}/${co}/${data.route}?dir=${s.dir}&stop=${s.stopId}`;
    // 專線小巴：「專線小巴 2（新界）往 …」，唔好出路線檔名 NT-2
    const text = shareText({ company: companyNames(companies), route: routeTitle(co, data.route), dest, stop: s.name, nextAt: nextAtOpen, now: Date.now() });
    Share.share({ message: `${text}\n${url}` }).catch(() => {});
  };
  // 站名搜尋（長途線好多站）
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const found = useMemo(() => matchStops(stops.map((x) => x.name), query), [stops, query]);
  const pickFound = (i: number) => {
    setSearching(false);
    setQuery('');
    openStop(i);
  };
  const mapH = Math.max(150, Math.min(280, winH * 0.26));
  const hasTimetable = sorted.some((x) => x.variant.schedules.length);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <RouteBar co={co} route={data.route} companiesLabel={companyNames(companies)} dest={dest} note={joyYou ? null : '不設樂悠咭優惠'}>
        <BarButton icon={fav ? 'star-fill' : 'star'} on={fav} onPress={toggleFav} label={fav ? '取消收藏路線' : '收藏路線'} />
        {hasTimetable && <BarButton icon="clock" onPress={() => setTimetable(true)} label="詳細班次" />}
        {other && <BarButton icon="swap" onPress={() => changeDir(other)} label={`轉方向：往 ${(co === 'gmb' ? (other === 'O' ? data.destTc : data.origTc) : null) ?? data.stops[data.directions[other]!.at(-1)!]?.nameTc}`} />}
      </RouteBar>

      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 10, zIndex: 10 }}>
        <VariantPicker
          key={dir}
          items={items}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setVariantId(id);
            openStop(null);
          }}
        />
        {mapStops.length > 0 && (
          <RouteMap
            key={`${dir}-${selected?.id}`}
            lines={mapLines}
            stops={mapStops}
            buses={mapBuses}
            color={color}
            company={data.company}
            multiCompany={multiCompany}
            osm={sorted.some((x) => x.variant.lineSource === 'osm')}
            focusIndex={openIndex}
            onStopPress={openStop}
            height={mapH}
          />
        )}
      </View>

      {/* 只有站點列表捲動 */}
      <View style={{ flex: 1, marginHorizontal: 12, backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, overflow: 'hidden', ...shadow }}>
        {searching ? (
          <View style={{ zIndex: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <Icon name="search" size={18} color={t.accent} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => found[0] !== undefined && pickFound(found[0])}
                placeholder="搵站名，例如 黃竹坑"
                placeholderTextColor={t.muted}
                returnKeyType="search"
                accessibilityLabel="搵站"
                style={{ flex: 1, fontSize: 16, color: t.text, paddingVertical: 8 }}
              />
              <Pressable onPress={() => (setSearching(false), setQuery(''))} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.brandSoft }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.accent }}>取消</Text>
              </Pressable>
            </View>
            {query.trim() !== '' && (
              <View style={{ position: 'absolute', top: '100%', left: 8, right: 8, marginTop: 6, padding: 6, borderRadius: 14, backgroundColor: t.card, ...shadowLg }}>
                {found.length === 0 && <Text style={{ padding: 10, fontSize: 14, color: t.muted }}>呢條線冇站撞中「{query.trim()}」</Text>}
                {found.map((i) => (
                  <Pressable key={i} onPress={() => pickFound(i)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                    <Text style={{ minWidth: 22, textAlign: 'right', fontSize: 13, color: t.muted, ...tabular }}>{i + 1}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: t.text }}>
                      {stops[i]!.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <Icon name="pin" size={18} color={t.accent} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: t.muted }}>
            {locating === 'busy' && '搵緊最近嘅站…'}
            {locating === 'denied' && '開咗定位就會自動打開最近嘅站'}
            {locating === 'far' && '附近 500 米內冇呢條線嘅站'}
            {locating === 'error' && '攞唔到位置'}
            {locating === 'idle' && nearest && (
              <>
                最近：<Text style={{ color: t.text, fontWeight: '700' }}>{stops[nearest.index]?.name}</Text> · {formatDistance(nearest.metres)}
              </>
            )}
            {locating === 'idle' && !nearest && '最近嘅站'}
          </Text>
          {locating !== 'busy' && (
            <Pressable onPress={() => findNearest(true, true)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.brandSoft }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.accent }}>{nearest ? '重新定位' : '定位'}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setSearching(true)} accessibilityRole="button" accessibilityLabel="搵站" hitSlop={4} style={{ width: 32, height: 32, marginLeft: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="search" size={18} color={t.text} />
          </Pressable>
        </View>
        )}
        <FlatList
          ref={list}
          data={stops}
          keyExtractor={(s, i) => `${s.dir}-${s.stopId}-${i}`}
          extraData={[openIndex, etas, etaNow, rowBuses, whereLabels, nearest, failed, alight, picking, fetchedAt, busNow]}
          contentContainerStyle={{ paddingVertical: 6, paddingBottom: insets.bottom }}
          onScrollToIndexFailed={({ averageItemLength, index }) => list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })}
          renderItem={({ item: s, index: i }) => {
            const tr = travel?.[i] ?? null;
            const after = openIndex !== null && i > openIndex;
            return (
              <StopRow
                index={i}
                name={s.name}
                terminus={i === 0 || isEnd(i)}
                first={i === 0}
                last={i === stops.length - 1}
                lineColor={color}
                multiCompany={multiCompany}
                open={openIndex === i}
                onToggle={() => {
                  // 揀緊落車站：撳下面嘅站 = 揀佢；撳其他 = 取消
                  if (picking) {
                    setPicking(false);
                    if (openIndex !== null && i > openIndex) {
                      haptic.pick();
                      setAlight(i);
                    }
                    return;
                  }
                  openStop(openIndex === i ? null : i);
                }}
                pickable={picking && after}
                isAlight={alight === i && after}
                alight={openIndex === i ? alightInfo : null}
                picking={openIndex === i && picking}
                onPickAlight={() => {
                  haptic.tap();
                  setPicking((x) => !x);
                }}
                onClearAlight={() => setAlight(null)}
                updatedAt={openIndex === i ? fetchedAt : null}
                clockNow={busNow}
                onRefresh={() => {
                  haptic.tap();
                  setRefreshKey((k) => k + 1);
                }}
                onShare={share}
                etas={openIndex === i ? etas : null}
                whereLabels={openIndex === i ? whereLabels : null}
                error={openIndex === i ? etaError : null}
                failed={openIndex === i ? failed : []}
                now={etaNow}
                selectedVariantId={selected?.id ?? null}
                fare={fares[i] ?? null}
                lastBus={openIndex === i ? openLastBus : null}
                lastEtaIndex={openIndex === i ? lastEtaIndex : -1}
                nearestMetres={nearest?.index === i ? nearest.metres : null}
                travelSeconds={after ? tr : null}
                travelMetres={after ? (cumMetres[i] ?? 0) - (cumMetres[openIndex!] ?? 0) : null}
                nextArrival={after && tr !== null && nextAtOpen !== null ? nextAtOpen + tr * 1000 : null}
                buses={rowBuses.get(i) ?? []}
                here={s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng, name: s.name, current: { co, route: data.route, dir: s.dir } } : null}
                fav={!isEnd(i) ? { co, route: data.route, dir: s.dir, dest, companies, stopId: s.stopId, stopName: s.name } : null}
              />
            );
          }}
          ListFooterComponent={
            <Text style={{ textAlign: 'center', fontSize: 12, color: t.muted, padding: 16 }}>
              {co === 'gmb'
                ? '資料來源：運輸署（專線小巴實時到站數據、GTFS、CSDI 走線，DATA.GOV.HK）。行車時間：hk-bus-time-between-stops（實驗性質，僅供參考）'
                : `資料來源：運輸署、${companyNames(companies)}（DATA.GOV.HK）。行車時間：hk-bus-time-between-stops（實驗性質，僅供參考）`}
            </Text>
          }
        />
      </View>

      {hasTimetable && <TimetableSheet key={`${dir}-${selected?.id}`} visible={timetable} onClose={() => setTimetable(false)} variants={sorted.map((x) => x.variant)} selectedId={selected?.id ?? null} calendar={calendar} />}
    </View>
  );
}
