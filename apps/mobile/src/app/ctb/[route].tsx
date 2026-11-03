import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  fmtMinutes,
  serviceWindow,
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
import { Badge } from '@/components/Badge';
import { StopRow } from '@/components/StopRow';
import { RouteMap, type MapLine, type MapStop } from '@/components/RouteMap';

export default function RouteScreen() {
  const t = useTheme();
  const { route } = useLocalSearchParams<{ route: string }>();
  const [data, setData] = useState<RouteData | null>(null);
  const [calendar, setCalendar] = useState<Calendar>({});
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>('O');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [openSignals, setOpenSignals] = useState<Record<number, number>>({});
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

  const stops = useMemo(
    () =>
      selected ? variantStops(selected) : (data?.directions[dir] ?? []).map((stopId) => ({ dir, stopId })),
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
          segments: x.variant.line!.map((seg) => seg.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))),
        })),
    [sorted, selected],
  );

  if (error) return <Text style={{ padding: 16, color: t.muted }}>載入失敗：{error}</Text>;
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const changeDir = (d: Dir) => {
    setDir(d);
    setVariantId(null);
    setFocusIndex(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: `城巴 ${data.route}` }} />
      <FlatList
        ref={list}
        data={stops}
        keyExtractor={(s, i) => `${s.dir}-${s.stopId}-${i}`}
        onScrollToIndexFailed={({ averageItemLength, index }) =>
          list.current?.scrollToOffset({ offset: averageItemLength * index, animated: true })
        }
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
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
                        flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center',
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

            {sorted.length > 0 && (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: t.line, overflow: 'hidden', backgroundColor: t.card }}>
                {sorted.map(({ variant: v, status }, i) => {
                  const active = v.id === selected?.id;
                  const running = status.state === 'running';
                  const w = serviceWindow(v, calendar, now);
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => {
                        setVariantId(v.id);
                        setFocusIndex(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={{
                        flexDirection: 'row', gap: 12, padding: 12,
                        borderTopWidth: i ? 1 : 0, borderColor: t.line,
                        backgroundColor: active ? t.brandSoft : t.card,
                        borderLeftWidth: 4, borderLeftColor: active ? t.brand : 'transparent',
                      }}
                    >
                      <View
                        style={{
                          width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: running ? t.ok : t.idle,
                        }}
                      >
                        <Text style={{ color: t.bg, fontWeight: '700' }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {v.special && <Badge label="特別班" special />}
                          <Text style={{ color: t.text, fontWeight: '700' }}>{variantLabel(v)}</Text>
                        </View>
                        <Text style={{ color: running ? t.ok : t.idle, fontSize: 13 }}>{statusText(status)}</Text>
                        {w && (
                          <Text style={{ color: t.muted, fontSize: 13 }}>
                            今日 {fmtMinutes(w[0])}–{w[1] >= 1440 ? '翌日 ' : ''}
                            {fmtMinutes(w[1])} 由總站開出
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {mapStops.length > 0 && (
              <RouteMap
                key={`${dir}-${selected?.id}`}
                lines={mapLines}
                stops={mapStops}
                focusIndex={focusIndex}
                onStopPress={(index) => {
                  setOpenSignals((s) => ({ ...s, [index]: (s[index] ?? 0) + 1 }));
                  list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
                }}
              />
            )}
          </View>
        }
        renderItem={({ item: s, index: i }) => (
          <StopRow
            index={i}
            route={data.route}
            stopId={s.stopId}
            dir={s.dir}
            name={data.stops[s.stopId]?.nameTc ?? s.stopId}
            selectedVariantId={selected?.id ?? null}
            openSignal={openSignals[i] ?? 0}
            onOpen={setFocusIndex}
          />
        )}
      />
    </>
  );
}
