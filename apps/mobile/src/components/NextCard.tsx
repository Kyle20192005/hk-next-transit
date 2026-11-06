import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { busDepartureRows, favDepartureRows, formatDistance, groupFavorites, groupStopHeads, minutesLabel, type DepartureRow, type FavGroup, type StopHead } from '@hknt/core';
import { api, type Co, type NearStop } from '@/lib/api';
import { useFavorites, type Favorite } from '@/lib/favorites';
import { warmRoute } from '@/lib/prefetch';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { Icon, type IconName } from './Icon';
import type { NearbyState } from './Nearby';
import { ScheduledTag } from './ui';

const MAX_CARDS = 5;
const ROWS = 4;
const REFRESH_MS = 30_000;
const GAP = 10;
const TAB_KEY = 'hknt.nextTab';
type Tab = 'next' | 'favs';

/**
 * 首頁大卡（似港鐵 App 嘅「下班車」小工具）：頂部兩個分頁「下班車」（附近）同「收藏」，
 * 入面一行站名（跟住而家睇緊嗰張），下面打橫掃嘅到站卡（左右兩邊色條）。同網頁 components/home/NextCard.tsx 一樣。
 */
export function NextCard({ nearby, onLocate }: { nearby: NearbyState; onLocate: () => void }) {
  const t = useTheme();
  const favs = useFavorites();
  const [tab, setTab] = useState<Tab>('next');
  useEffect(() => {
    AsyncStorage.getItem(TAB_KEY)
      .then((v) => (v === 'next' || v === 'favs') && setTab(v))
      .catch(() => {});
  }, []);
  const pick = (v: Tab) => {
    setTab(v);
    AsyncStorage.setItem(TAB_KEY, v).catch(() => {});
  };
  const tabBtn = (v: Tab, label: string, icon: IconName, side: 'left' | 'right') => {
    const on = tab === v;
    return (
      <Pressable
        onPress={() => pick(v)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={{
          flex: 1,
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: on ? t.card : t.surface2,
          // 文件夾分頁：揀咗嗰個白色連住下面；冇揀嗰個灰色，近揀咗嗰邊圓角
          ...(on ? (side === 'left' ? { borderTopRightRadius: 18 } : { borderTopLeftRadius: 18 }) : side === 'left' ? { borderBottomRightRadius: 18 } : { borderBottomLeftRadius: 18 }),
        }}
      >
        <Icon name={icon} size={22} color={on ? t.accent : t.muted} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: on ? t.text : t.muted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
      <View style={{ flexDirection: 'row', backgroundColor: tab === 'next' ? t.card : t.surface2 }}>
        <View style={{ flex: 1, backgroundColor: tab === 'next' ? t.surface2 : t.card, flexDirection: 'row' }}>{tabBtn('next', '下班車', 'clock', 'left')}</View>
        <View style={{ flex: 1, backgroundColor: tab === 'favs' ? t.surface2 : t.card, flexDirection: 'row' }}>{tabBtn('favs', '收藏', 'star', 'right')}</View>
      </View>
      <View style={{ paddingTop: 12, paddingBottom: 10 }}>{tab === 'next' ? <NearbyPane state={nearby} onLocate={onLocate} /> : <FavPane favs={favs} />}</View>
    </View>
  );
}

function NearbyPane({ state, onLocate }: { state: NearbyState; onLocate: () => void }) {
  const t = useTheme();
  if (state.kind !== 'ok') {
    return (
      <Message
        text={state.kind === 'error' ? state.message : state.kind === 'locating' ? '定位中…' : '搵你附近嘅巴士站同下一班車'}
        error={state.kind === 'error'}
        action={state.kind === 'locating' ? undefined : { label: state.kind === 'error' ? '再試' : '定位', onPress: onLocate }}
      />
    );
  }
  const heads = groupStopHeads(state.stops).slice(0, MAX_CARDS);
  if (!heads.length) return <Message text="600 米內冇巴士站" />;
  return (
    <Swiper
      items={heads}
      header={(h) => (
        <>
          <Icon name="navigate" size={18} color="#2f6fd6" />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: t.text }}>
            {h.name}
          </Text>
          <Text style={{ fontSize: 13, color: t.muted }}>{formatDistance(h.distance)}</Text>
        </>
      )}
      action={{ label: '更多', onPress: () => router.push('/nearby') }}
      card={(h, active) => <HereCard head={h} active={active} />}
    />
  );
}

function FavPane({ favs }: { favs: Favorite[] }) {
  const t = useTheme();
  const groups = groupFavorites(favs);
  if (!groups.length) return <Message text="喺路線頁撳星號收藏路線，或者打開一個站撳「收藏呢個站」，就會喺度見到下一班車。" />;
  return (
    <Swiper
      items={groups}
      header={(g) => (
        <>
          <Icon name={g.isStop ? 'pin' : 'route'} size={18} color="#2f6fd6" />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: t.text }}>
            {g.name}
          </Text>
        </>
      )}
      action={{ label: '全部', onPress: () => router.navigate('/favorites') }}
      card={(g, active) => <FavCard group={g} active={active} />}
    />
  );
}

function Swiper<T extends { key: string }>({ items, header, action, card }: { items: T[]; header: (item: T) => ReactNode; action: { label: string; onPress: () => void }; card: (item: T, active: boolean) => ReactNode }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(1);
  const cardW = items.length > 1 ? Math.round((width - 32) * 0.92) : width - 32;
  const cur = items[Math.min(index, items.length - 1)]!;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP));
    if (i !== index) setIndex(i);
    if (i + 1 > reached) setReached(i + 1);
  };
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, paddingRight: 12, paddingBottom: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>{header(cur)}</View>
        <Pressable onPress={action.onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>{action.label}</Text>
          <Icon name="chevron-right" size={16} color={t.accent} />
        </Pressable>
      </View>
      {width > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + GAP} decelerationRate="fast" onScroll={onScroll} scrollEventThrottle={64} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: GAP }}>
          {items.map((it, i) => (
            <View key={it.key} style={{ width: cardW }}>
              {card(it, i <= reached)}
            </View>
          ))}
        </ScrollView>
      )}
      {items.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 8 }}>
          {items.map((it, i) => (
            <View key={it.key} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? t.accent : t.line }} />
          ))}
        </View>
      )}
    </View>
  );
}

function usePoll(active: boolean, key: string, run: () => Promise<void>, onError?: () => void) {
  const runRef = useRef(run);
  const errRef = useRef(onError);
  useEffect(() => {
    runRef.current = run;
    errRef.current = onError;
  });
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = () => runRef.current().catch(() => !cancelled && errRef.current?.());
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, key]);
}

function HereCard({ head, active }: { head: StopHead<NearStop>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(
    active,
    `${head.lat},${head.lng}`,
    async () => {
      const body = await api.here(head.lat, head.lng);
      const now = Date.now();
      setState({ rows: busDepartureRows(body.routes, now, ROWS), now });
    },
    () => setState((s) => s ?? { rows: [], now: Date.now() }),
  );
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} />;
}

function FavCard({ group, active }: { group: FavGroup<Favorite>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  const key = group.favs.map((f) => `${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`).join('|');
  usePoll(active, key, async () => {
    const items = await Promise.all(
      group.favs.map(async (fav) => {
        if (!fav.stopId) return { fav, etas: null };
        try {
          const body = await api.eta(fav.co, fav.route, fav.stopId);
          return { fav, etas: body.etas.filter((e) => e.eta && e.dir === fav.dir) };
        } catch {
          return { fav, etas: [] };
        }
      }),
    );
    const now = Date.now();
    setState({ rows: favDepartureRows(items, now), now });
  });
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} />;
}

/** 一張到站卡：左右兩邊色條（第一班嘅公司色），每行 標籤、往邊、分鐘 */
function RowsCard({ rows, now }: { rows: DepartureRow[] | null; now: number }) {
  const t = useTheme();
  const accent = rows?.[0]?.badge.bg ?? t.line;
  return (
    <View style={{ minHeight: 172, justifyContent: 'center', paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: t.line, borderLeftWidth: 8, borderRightWidth: 8, borderLeftColor: accent, borderRightColor: accent, backgroundColor: t.card }}>
      {rows === null && <Text style={{ textAlign: 'center', color: t.muted }}>載入中…</Text>}
      {rows?.length === 0 && <Text style={{ textAlign: 'center', color: t.muted }}>暫時冇班次</Text>}
      {rows?.map((r) => (
        <Pressable
          key={r.key}
          onPressIn={() => warmRoute(r.link.co as Co, r.link.route, { dir: r.link.dir, stopId: r.link.stop })}
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: r.link.co, route: r.link.route, dir: r.link.dir, ...(r.link.stop ? { stop: r.link.stop } : {}) } })}
          accessibilityRole="link"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}
        >
          <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink, ...tabular }}>{r.badge.text}</Text>
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: t.text }}>
            往{r.dest}
          </Text>
          {r.scheduled && <ScheduledTag />}
          {r.noService ? (
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.muted }}>冇班次</Text>
          ) : r.at === null ? (
            <Icon name="chevron-right" size={18} color={t.muted} />
          ) : (
            <Text style={{ fontSize: 18, fontWeight: '800', color: t.text, ...tabular }}>{minutesLabel(r.at, now)}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function Message({ text, error, action }: { text: string; error?: boolean; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: error ? t.special : t.muted }}>{text}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="locate" size={18} color={t.accent} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
