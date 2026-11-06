import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TRANSPORT_MODES, type TransportMode } from '@hknt/core';
import { AppBar, CompanyTag, SoonBadge } from '@/components/ui';
import { FavItem } from '@/components/FavItem';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { NearbyStop, useNearbyStops } from '@/components/Nearby';
import { favKey, useFavorites } from '@/lib/favorites';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';

const MODE_ICON: Record<TransportMode, IconName> = { bus: 'bus', rail: 'train', minibus: 'minibus', ferry: 'ferry', tram: 'tram' };
const NEAR_SHOWN = 2;
const FAV_SHOWN = 3;
const RECENT_SHOWN = 5;

/**
 * 首頁（NextLeg 嘅入口，同網頁 components/home/HomeTab.tsx 一樣）：導航搜尋欄 + 捷徑（交通工具、收藏、附近、最近睇過）。
 * 一開就自動定位顯示附近嘅車（第一次會問權限）。
 */
export default function HomeTab() {
  const t = useTheme();
  const favs = useFavorites();
  const recent = useRecent();
  const { state, locate } = useNearbyStops(true);

  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Logo size={26} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand, letterSpacing: -0.3 }}>下一程</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7, marginLeft: 2, marginTop: 6 }}>NextLeg</Text>
        </View>
        <Pressable
          onPress={() => router.navigate('/navigation')}
          accessibilityRole="search"
          accessibilityLabel="導航：你想去邊？"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 10, borderRadius: radius.m, backgroundColor: t.card, ...shadow }}
        >
          <Icon name="navigate" size={20} color={t.muted} />
          <Text style={{ flex: 1, fontSize: 17, color: t.muted }}>你想去邊？</Text>
          <SoonBadge label="即將推出" />
        </Pressable>
      </AppBar>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {TRANSPORT_MODES.map((m) => (
            <Pressable key={m.id} onPress={() => router.navigate({ pathname: '/routes', params: { mode: m.id } })} accessibilityRole="button" accessibilityLabel={m.ready ? m.label : `${m.label}（即將推出）`} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              {({ pressed }) => (
                <>
                  <View style={{ width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.card, transform: [{ scale: pressed ? 0.95 : 1 }], ...shadow }}>
                    <Icon name={MODE_ICON[m.id]} size={26} color={m.ready ? t.accent : t.muted} />
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: m.ready ? '700' : '600', color: m.ready ? t.text : t.muted }}>
                    {m.label}
                  </Text>
                </>
              )}
            </Pressable>
          ))}
        </View>

        <Section title="收藏" action={favs.length > FAV_SHOWN ? { label: `全部 ${favs.length}`, onPress: () => router.navigate('/favorites') } : undefined}>
          {favs.length ? (
            <View style={{ gap: 10 }}>
              {favs.slice(0, FAV_SHOWN).map((f) => (
                <FavItem key={favKey(f)} f={f} />
              ))}
            </View>
          ) : (
            <Hint>喺路線頁撳星號收藏路線，或者打開一個站撳「收藏呢個站」，就會喺度直接見到下一班車。</Hint>
          )}
        </Section>

        <Section title="附近" action={state.kind === 'ok' && state.stops.length > 0 ? { label: '更多', onPress: () => router.push('/nearby') } : undefined}>
          {state.kind === 'ok' ? (
            state.stops.length ? (
              <View style={{ gap: 10 }}>
                {state.stops.slice(0, NEAR_SHOWN).map((s) => (
                  <NearbyStop key={`${s.co}-${s.id}`} stop={s} autoLoad />
                ))}
              </View>
            ) : (
              <Hint>600 米內冇巴士站</Hint>
            )
          ) : (
            <Hint action={state.kind === 'locating' ? undefined : { label: state.kind === 'error' ? '再試' : '定位', onPress: () => void locate() }}>
              {state.kind === 'error' ? <Text style={{ color: t.special }}>{state.message}</Text> : state.kind === 'locating' ? '定位中…' : '搵你附近嘅巴士站同下一班車'}
            </Hint>
          )}
        </Section>

        {recent.length > 0 && (
          <Section title="最近睇過">
            <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
              {recent.slice(0, RECENT_SHOWN).map((r, i) => (
                <Pressable
                  key={`${r.co}-${r.route}-${r.dir}`}
                  onPressIn={() => warmRoute(r.co, r.route, { dir: r.dir })}
                  onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: r.co, route: r.route, dir: r.dir } })}
                  accessibilityRole="link"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
                >
                  <View style={{ width: 92, gap: 3 }}>
                    <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, ...tabular }}>{r.route}</Text>
                    <CompanyTag companies={r.companies} />
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.text }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: t.muted }}>往 </Text>
                    {r.dest}
                  </Text>
                  <Icon name="chevron-right" size={18} color={t.muted} />
                </Pressable>
              ))}
            </View>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{title}</Text>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function Hint({ children, action }: { children: ReactNode; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.l, backgroundColor: t.card, ...shadow }}>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: t.muted }}>{children}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="locate" size={18} color={t.accent} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
