import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import type { Dir, RouteData } from '@hknt/core';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { passesThrough, shortName, variantsForDir } from '@/lib/variant';
import { Badge } from '@/components/Badge';
import { StopRow } from '@/components/StopRow';

export default function RouteScreen() {
  const t = useTheme();
  const { route } = useLocalSearchParams<{ route: string }>();
  const [data, setData] = useState<RouteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>('O');

  useEffect(() => {
    api.ctbRoute(route).then(setData).catch((e: Error) => setError(e.message));
  }, [route]);

  const dirs = useMemo(() => (['O', 'I'] as Dir[]).filter((d) => data?.directions[d]?.length), [data]);
  const stopIds = data?.directions[dir] ?? [];
  const variants = data ? variantsForDir(data, dir) : [];

  if (error) return <Text style={{ padding: 16, color: t.muted }}>載入失敗：{error}</Text>;
  if (!data) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <>
      <Stack.Screen options={{ title: `城巴 ${data.route}` }} />
      <FlatList
        data={stopIds}
        keyExtractor={(s, i) => `${s}-${i}`}
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
                      onPress={() => setDir(d)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center',
                        borderColor: active ? t.brand : t.line, backgroundColor: active ? t.brandSoft : t.card }}
                    >
                      <Text style={{ color: active ? t.brand : t.text, fontWeight: active ? '700' : '400' }}>
                        往 {data.stops[ids[ids.length - 1]!]?.nameTc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {variants.map((v) => (
              <View key={v.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Badge label={v.special ? '特別班' : '正常'} special={v.special} />
                <Text style={{ color: t.text, fontWeight: '600' }}>{shortName(v)}</Text>
              </View>
            ))}
          </View>
        }
        renderItem={({ item: sid, index: i }) => {
          const served = variants.filter((v) => `${dir}:${sid}` in v.expSeq);
          const skipped = variants.filter((v) => !served.includes(v) && passesThrough(v, dir, stopIds, i));
          const partial = served.length > 0 && skipped.length > 0;
          return (
            <View style={{ backgroundColor: t.card }}>
              <StopRow
                seq={i + 1}
                route={data.route}
                stopId={sid}
                dir={dir}
                name={data.stops[sid]?.nameTc ?? sid}
                onlyVariants={partial ? served.map(shortName) : []}
                onlySpecial={partial && served.every((v) => v.special)}
              />
            </View>
          );
        }}
      />
    </>
  );
}
