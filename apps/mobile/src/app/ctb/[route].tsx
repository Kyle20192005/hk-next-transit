import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  fmtMinutes,
  lineArrows,
  serviceWindow,
  busFraction,
  busDistanceTo,
  formatDistance,
  stopCumMetres,
  labelEtas,
  type TrackedBus,
  pointOnPath,
  secondsFrom,
  stopPathIndices,
  type Eta,
  type LatLng,
  smoothLine,
  sortVariants,
  statusText,
  variantLabel,
  variantStops,
  variantsForDir,
  type Calendar,
  type Dir,
  type RouteData,
} from '@hknt/core';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { StopRow } from '@/components/StopRow';
import { RouteMap, type MapArrow, type MapBus, type MapLine, type MapStop } from '@/components/RouteMap';
import { VariantPicker, type VariantItem } from '@/components/VariantPicker';

/** 路線頁：上面（方向、走法、地圖）固定，只有站點列表捲動；站點一次只開一個 */
export default function RouteScreen() {
  const t = useTheme();
  const { route } = useLocalSearchParams<{ route: string }>();
  const [data, setData] = useState<RouteData | null>(null);
  const [calendar, setCalendar] = useState<Calendar>({});
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>('O');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [etaNow, setEtaNow] = useState(() => Date.now());
  const list = useRef<FlatList<{ dir: Dir; stopId: string }>>(null);

  useEffect(() => {
    Promise.all([api.ctbRoute(route), api.calendar()])
      .then(([r, c]) => {
        setData(r);
        setCalendar(c);
      })
      .catch((e: Error) => setError(e.message));
  }, [route]);

  // 每分鐘更新一次，走法狀態（現正服務等）先會跟住時間變
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dirs = useMemo(() => (['O', 'I'] as Dir[]).filter((d) => data?.directions[d]?.length), [data]);
  const sorted = useMemo(
    () => (data ? sortVariants(variantsForDir(data, dir), calendar, now) : []),
    [data, dir, calendar, now],
  );
  // 預設揀排第一嘅走法（現正服務、最接近而家開出）
  const selected = sorted.find((x) => x.variant.id === variantId)?.variant ?? sorted[0]?.variant;

  const items: VariantItem[] = sorted.map(({ variant: v, status }) => {
    const w = serviceWindow(v, calendar, now);
    return {
      id: v.id,
      label: variantLabel(v),
      special: v.special,
      running: status.state === 'running',
      status: statusText(status),
      statusShort: statusText(status, true),
      window: w ? `今日 ${fmtMinutes(w[0])}–${w[1] >= 1440 ? '翌日 ' : ''}${fmtMinutes(w[1])} 由總站開出` : null,
    };
  });

  const stops = useMemo(
    () => (selected ? variantStops(selected) : (data?.directions[dir] ?? []).map((stopId) => ({ dir, stopId }))),
    [selected, data, dir],
  );
  const mapStops: MapStop[] = useMemo(
    () =>
      stops.flatMap((s, i) => {
        const info = data?.stops[s.stopId];
        return info ? [{ index: i, name: info.nameTc, lat: info.lat, lng: info.lng }] : [];
      }),
    [stops, data],
  );
  const mapLines: MapLine[] = useMemo(
    () =>
      sorted
        .filter((x) => x.variant.line)
        .map((x) => ({
          id: x.variant.id,
          selected: x.variant.id === selected?.id,
          special: x.variant.special,
          segments: x.variant.line!.map((seg) =>
            smoothLine(seg.map(([lng, lat]) => [lat, lng] as [number, number])).map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
          ),
        })),
    [sorted, selected],
  );
  // 原生地圖唔方便按縮放程度篩選，所以只喺夠長（300 米以上）嘅段中間放箭嘴
  const arrows: MapArrow[] = useMemo(
    () =>
      selected?.line
        ? lineArrows(selected.line.map((seg) => seg.map(([lng, lat]) => [lat, lng] as [number, number])), 300).map(
            (a) => ({ latitude: a.lat, longitude: a.lng, bearing: a.bearing }),
          )
        : [],
    [selected],
  );

  // 打開咗嘅站：攞到站時間（每 30 秒），巴士位置每 10 秒按時間推前
  const openStopItem = openIndex !== null ? stops[openIndex] : undefined;
  useEffect(() => {
    if (!data || !openStopItem) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.eta(data.route, openStopItem.stopId);
        if (cancelled) return;
        setEtas(body.etas.filter((e) => e.dir === openStopItem.dir && e.eta));
        setEtaError(null);
      } catch (e) {
        if (!cancelled) setEtaError((e as Error).message);
      }
      if (!cancelled) setEtaNow(Date.now());
    };
    void tick();
    const a = setInterval(tick, 30_000);
    const b = setInterval(() => setEtaNow(Date.now()), 10_000);
    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, [data, openStopItem]);

  // 成條線嘅巴士位置：每 20 秒問後端（用每個站嘅 ETA 追蹤）
  const [live, setLive] = useState<{ buses: TrackedBus[]; segSeconds: number[] } | null>(null);
  useEffect(() => {
    if (!data || !selected) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.buses(data.route, selected.id);
        if (!cancelled) setLive({ buses: body.buses.map((b) => ({ from: b.from, nextEta: Date.parse(b.nextEta) })), segSeconds: body.segSeconds });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const id = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [data, selected]);
  // 每 5 秒按時間推前巴士位置
  const [busNow, setBusNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setBusNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const seg = live?.segSeconds ?? selected?.segSeconds ?? null;
  const cum = useMemo(() => {
    if (!seg) return null;
    const out = [0];
    for (const x of seg) out.push(out[out.length - 1]! + x);
    return out;
  }, [seg]);
  const isMine = (e: Eta) => !selected || !e.variant?.variantId || e.variant.variantId === selected.id;
  const travel = cum && openIndex !== null ? secondsFrom(cum, openIndex) : null;
  const nextAtOpen =
    etas?.filter(isMine).map((e) => Date.parse(e.eta!)).filter((x) => x >= etaNow - 60_000).sort((a, b) => a - b)[0] ?? null;
  // 每個站沿走線嘅累計距離（米）
  const cumMetres = useMemo(() => {
    const sel = mapLines.find((l) => l.selected);
    const path: LatLng[] = sel
      ? sel.segments.flatMap((sg, i) => (i === 0 ? sg : sg.slice(1))).map((p) => [p.latitude, p.longitude] as LatLng)
      : [];
    return stopCumMetres(
      path,
      stops.map((st) => {
        const info = data?.stops[st.stopId];
        return (info ? [info.lat, info.lng] : [0, 0]) as LatLng;
      }),
    );
  }, [mapLines, stops, data]);

  // 每班車而家喺邊：用成條線追蹤到嘅巴士對應返呢個站嘅 ETA
  const whereLabels = (() => {
    if (!live || openIndex === null || !etas) return null;
    const mine = etas.filter(isMine);
    const labels = labelEtas(live.buses, openIndex, mine.map((e) => Date.parse(e.eta!)));
    return etas.map((e) => {
      const k = mine.indexOf(e);
      if (k < 0) return null;
      const l = labels[k]!;
      if (l.kind === 'notDeparted') return '未開出';
      // 沿路線仲有幾遠（50 米內唔顯示）
      const m = busDistanceTo(l.bus, busFraction(l.bus, live.segSeconds, busNow), openIndex, cumMetres);
      const dist = m === null || m < 50 ? '' : ` · ${formatDistance(m)}`;
      return l.kind === 'arriving' ? `即將到站${dist}` : `距離 ${l.stopsAway} 個站${dist}`;
    });
  })();
  // 地圖上嘅巴士：沿住揀咗嘅走線放
  const buses: MapBus[] = (() => {
    if (!live) return [];
    const sel = mapLines.find((l) => l.selected);
    const path: LatLng[] = sel
      ? sel.segments.flatMap((sg, i) => (i === 0 ? sg : sg.slice(1))).map((p) => [p.latitude, p.longitude] as LatLng)
      : [];
    const idx = path.length ? stopPathIndices(path, mapStops.map((m) => [m.lat, m.lng] as LatLng)) : [];
    const at = (stopIndex: number) => mapStops.findIndex((m) => m.index === stopIndex);
    return live.buses.flatMap((b, k): MapBus[] => {
      const fraction = busFraction(b, live.segSeconds, busNow);
      const minutes = Math.max(0, Math.round((b.nextEta - busNow) / 60000));
      const a = at(b.from);
      const c = at(b.from + 1);
      const pt = idx[a] !== undefined && idx[c] !== undefined ? pointOnPath(path, idx[a]!, idx[c]!, fraction) : null;
      if (pt) return [{ key: k, latitude: pt.lat, longitude: pt.lng, minutes }];
      const ma = mapStops[a];
      const mc = mapStops[c];
      return ma && mc
        ? [{ key: k, latitude: ma.lat + (mc.lat - ma.lat) * fraction, longitude: ma.lng + (mc.lng - ma.lng) * fraction, minutes }]
        : [];
    });
  })();

  if (error) return <Text style={{ padding: 16, color: t.muted }}>載入失敗：{error}</Text>;
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const changeDir = (d: Dir) => {
    setDir(d);
    setVariantId(null);
    setOpenIndex(null);
  };
  const other = dirs.find((d) => d !== dir);
  const openStop = (i: number | null) => {
    setOpenIndex(i);
    setEtas(null);
    setEtaError(null);
    if (i !== null) list.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.2 });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `城巴 ${data.route}` }} />

      {/* 固定喺上面 */}
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 8, zIndex: 10 }}>
        {/* 一行：往 中環(交易廣場)　⇅ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 17, fontWeight: '700' }}>
            往 {data.stops[stops[stops.length - 1]?.stopId ?? '']?.nameTc}
          </Text>
          {other && (
            <Pressable
              onPress={() => changeDir(other)}
              accessibilityRole="button"
              accessibilityLabel={`轉方向：往 ${data.stops[data.directions[other]!.at(-1)!]?.nameTc}`}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: t.line,
                backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: t.brand, fontSize: 20 }}>⇅</Text>
            </Pressable>
          )}
        </View>
        <VariantPicker
          key={dir}
          items={items}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setVariantId(id);
            setOpenIndex(null);
          }}
        />
        {mapStops.length > 0 && (
          <RouteMap
            key={`${dir}-${selected?.id}`}
            lines={mapLines}
            stops={mapStops}
            arrows={arrows}
            buses={buses}
            focusIndex={openIndex}
            onStopPress={openStop}
          />
        )}
      </View>

      {/* 只有呢度捲動 */}
      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={stops}
        keyExtractor={(s, i) => `${s.dir}-${s.stopId}-${i}`}
        extraData={[openIndex, etas, etaNow]}
        onScrollToIndexFailed={({ averageItemLength, index }) =>
          list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
        }
        renderItem={({ item: s, index: i }) => (
          <StopRow
            index={i}
            name={data.stops[s.stopId]?.nameTc ?? s.stopId}
            selectedVariantId={selected?.id ?? null}
            open={openIndex === i}
            onToggle={() => openStop(openIndex === i ? null : i)}
            etas={openIndex === i ? etas : null}
            whereLabels={openIndex === i ? whereLabels : null}
            error={openIndex === i ? etaError : null}
            now={etaNow}
            travelSeconds={openIndex !== null && i > openIndex ? (travel?.[i] ?? null) : null}
            travelMetres={openIndex !== null && i > openIndex ? (cumMetres[i] ?? 0) - (cumMetres[openIndex] ?? 0) : null}
            nextArrival={
              openIndex !== null && i > openIndex && travel?.[i] != null && nextAtOpen !== null ? nextAtOpen + travel[i]! * 1000 : null
            }
          />
        )}
      />
    </View>
  );
}
