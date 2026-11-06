import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { busDepartureRows, formatDistance, groupStopHeads, minutesLabel, type DepartureRow, type StopHead } from '@hknt/core';
import { api, type Co, type NearStop } from '@/lib/api';
import { warmRoute } from '@/lib/prefetch';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { ScheduledTag } from './ui';

const MAX_CARDS = 5;
const ROWS = 4;
const REFRESH_MS = 30_000;
const GAP = 10;

/**
 * 首頁「附近」：一張卡 = 一個站頭（40 米內各公司嘅站併埋），每張只顯示最快到嘅 4 班（每條線一班）。
 * 打橫掃睇第二、第三近；掃到先載入到站時間。同網頁 components/home/DepartureCards.tsx 一樣（core `DepartureRow`）。
 */
export function DepartureCards({ stops }: { stops: NearStop[] }) {
  const heads = groupStopHeads(stops).slice(0, MAX_CARDS);
  const [width, setWidth] = useState(0);
  const [reached, setReached] = useState(1); // 載入到第幾張（0 起計）
  const cardW = Math.round(width * 0.86);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP)) + 1;
    if (i > reached) setReached(i);
  };
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ marginHorizontal: -12 }}>
      {width > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardW + GAP}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={64}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 6, gap: GAP }}
        >
          {heads.map((h, i) => (
            <DepartureCard key={h.key} head={h} width={cardW} active={i <= reached} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function DepartureCard({ head, width, active }: { head: StopHead<NearStop>; width: number; active: boolean }) {
  const t = useTheme();
  const [rows, setRows] = useState<DepartureRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.here(head.lat, head.lng);
        const n = Date.now();
        if (!cancelled) {
          setRows(busDepartureRows(body.routes, n, ROWS));
          setNow(n);
        }
      } catch {
        if (!cancelled) setRows((r) => r ?? []);
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, head.lat, head.lng]);

  return (
    <View style={{ width, backgroundColor: t.card, borderRadius: radius.l, borderLeftWidth: 6, borderLeftColor: rows?.[0]?.badge.bg ?? t.line, overflow: 'hidden', ...shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 6, paddingHorizontal: 14 }}>
        <Icon name="pin" size={18} color={t.accent} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: '700', color: t.text }}>
          {head.name}
        </Text>
        <Text style={{ fontSize: 13, color: t.muted }}>· {formatDistance(head.distance)}</Text>
      </View>
      <View style={{ minHeight: 168, paddingBottom: 6 }}>
        {rows === null && <Text style={{ paddingHorizontal: 14, paddingVertical: 10, color: t.muted }}>載入中…</Text>}
        {rows?.length === 0 && <Text style={{ paddingHorizontal: 14, paddingVertical: 10, color: t.muted }}>暫時冇班次</Text>}
        {rows?.map((r) => (
          <Pressable
            key={r.key}
            onPressIn={() => warmRoute(r.link.co as Co, r.link.route, { dir: r.link.dir, stopId: r.link.stop })}
            onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: r.link.co, route: r.link.route, dir: r.link.dir, ...(r.link.stop ? { stop: r.link.stop } : {}) } })}
            accessibilityRole="link"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}
          >
            <View style={{ minWidth: 48, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink, ...tabular }}>{r.badge.text}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.text }}>
              往 {r.dest}
            </Text>
            {r.scheduled && <ScheduledTag />}
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.accent, ...tabular }}>{minutesLabel(r.at, now)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
