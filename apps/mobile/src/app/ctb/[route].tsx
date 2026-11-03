import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  fmtMinutes,
  lineArrows,
  serviceWindow,
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
import { RouteMap, type MapArrow, type MapLine, type MapStop } from '@/components/RouteMap';
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

  if (error) return <Text style={{ padding: 16, color: t.muted }}>載入失敗：{error}</Text>;
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const changeDir = (d: Dir) => {
    setDir(d);
    setVariantId(null);
    setOpenIndex(null);
  };
  const openStop = (i: number | null) => {
    setOpenIndex(i);
    if (i !== null) list.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.2 });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `城巴 ${data.route}` }} />

      {/* 固定喺上面 */}
      <View style={{ padding: 12, gap: 10, zIndex: 10 }}>
        <Text style={{ color: t.muted }}>{data.origTc} ⇄ {data.destTc}</Text>
        {dirs.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {dirs.map((d) => {
              const ids = data.directions[d]!;
              const active = d === dir;
              return (
                <Pressable
                  key={d}
                  onPress={() => changeDir(d)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1, padding: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center',
                    borderColor: active ? t.brand : t.line, backgroundColor: active ? t.brandSoft : t.card,
                  }}
                >
                  <Text style={{ color: active ? t.brand : t.text, fontWeight: active ? '700' : '400' }}>
                    往 {data.stops[ids[ids.length - 1]!]?.nameTc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
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
        extraData={openIndex}
        onScrollToIndexFailed={({ averageItemLength, index }) =>
          list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
        }
        renderItem={({ item: s, index: i }) => (
          <StopRow
            index={i}
            route={data.route}
            stopId={s.stopId}
            dir={s.dir}
            name={data.stops[s.stopId]?.nameTc ?? s.stopId}
            selectedVariantId={selected?.id ?? null}
            open={openIndex === i}
            onToggle={() => openStop(openIndex === i ? null : i)}
          />
        )}
      />
    </View>
  );
}
