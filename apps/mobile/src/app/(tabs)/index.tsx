import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TRANSPORT_MODES, type TransportMode } from '@hknt/core';
import { AppBar, CompanyTag, SoonBadge } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { useNearbyStops } from '@/components/Nearby';
import { NextCard } from '@/components/NextCard';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';

const MODE_ICON: Record<TransportMode, IconName> = { bus: 'bus', rail: 'train', minibus: 'minibus', ferry: 'ferry', tram: 'tram' };
const RECENT_SHOWN = 5;

/**
 * 首頁（NextLeg 嘅入口，同網頁 components/home/HomeTab.tsx 一樣）：導航搜尋欄、大卡（下班車／收藏）、交通工具捷徑、最近睇過。
 * 一開就自動定位顯示附近嘅車（第一次會問權限）。
 */
export default function HomeTab() {
  const t = useTheme();
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
        <NextCard nearby={state} onLocate={() => void locate()} />

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
