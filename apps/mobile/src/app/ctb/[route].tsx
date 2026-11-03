import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  fmtMinutes,
  lineArrows,
  serviceWindow,
  busPositions,
  cumulativeSeconds,
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

  const cum = useMemo(() => (selected ? cumulativeSeconds(selected) : null), [selected]);
  const isMine = (e: Eta) => !selected || !e.variant?.variantId || e.variant.variantId === selected.id;
  const travel = cum && openIndex !== null ? secondsFrom(cum, openIndex) : null;
  const nextAtOpen =
    etas?.filter(isMine).map((e) => Date.parse(e.eta!)).filter((x) => x >= etaNow - 60_000).sort((a, b) => a - b)[0] ?? null;
  const whereLabels =
    cum && openIndex !== null && etas
      ? etas.map((e) => {
          if (!isMine(e)) return null;
          const [p] = busPositions(cum, openIndex, [e], new Date(etaNow));
          if (!p) return null;
          if (p.state === 'notDeparted') return '未開出';
          if (p.state === 'at' || (p.state === 'between' && p.from === openIndex - 1 && p.fraction > 0.7)) return '即將到站';
          return `距離 ${openIndex - p.from} 個站`;
        })
      : null;
  // 地圖上嘅巴士：沿住揀咗嘅走線放
  const buses: MapBus[] = (() => {
    if (!cum || openIndex === null || !etas) return [];
    const sel = mapLines.find((l) => l.selected);
    const path: LatLng[] = sel
      ? sel.segments.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))).map((p) => [p.latitude, p.longitude] as LatLng)
      : [];
    const idx = path.length ? stopPathIndices(path, mapStops.map((m) => [m.lat, m.lng] as LatLng)) : [];
    const at = (stopIndex: number) => mapStops.findIndex((m) => m.index === stopIndex);
    return busPositions(cum, openIndex, etas.filter(isMine), new Date(etaNow)).flatMap((p, k): MapBus[] => {
      if (p.state === 'notDeparted') return [];
      if (p.state === 'at') {
        const m = mapStops[at(p.stop)];
        return m ? [{ key: k, latitude: m.lat, longitude: m.lng, minutes: 0 }] : [];
      }
      const a = at(p.from);
      const b = at(p.from + 1);
      const pt = idx[a] !== undefined && idx[b] !== undefined ? pointOnPath(path, idx[a]!, idx[b]!, p.fraction) : null;
      if (pt) return [{ key: k, latitude: pt.lat, longitude: pt.lng, minutes: Math.round(p.secondsAway / 60) }];
      const ma = mapStops[a];
      const mb = mapStops[b];
      return ma && mb
        ? [{ key: k, latitude: ma.lat + (mb.lat - ma.lat) * p.fraction, longitude: ma.lng + (mb.lng - ma.lng) * p.fraction, minutes: Math.round(p.secondsAway / 60) }]
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
            nextArrival={
              openIndex !== null && i > openIndex && travel?.[i] != null && nextAtOpen !== null ? nextAtOpen + travel[i]! * 1000 : null
            }
          />
        )}
      />
    </View>
  );
}
