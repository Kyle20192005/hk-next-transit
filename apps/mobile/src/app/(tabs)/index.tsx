import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMPANIES, MAX_TOOLS, TOOLS, filterNews, formatDistance, groupStopHeads, tint, toggleTool, type NewsFilter, type ToolId } from '@hknt/core';
import { AppBar } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { useNearbyStops } from '@/components/Nearby';
import { NextCard } from '@/components/NextCard';
import { NewsChips, NewsList } from '@/components/NewsList';
import { useNews, useTools } from '@/lib/news';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';

const RECENT_SHOWN = 5;
const NEWS_SHOWN = 3;

/**
 * 首頁（NextLeg 入口，參考港鐵 App，同網頁 components/home/HomeTab.tsx 一樣）：
 * 黃色區大字顯示最近嘅站頭、「想去邊度？」同交通消息燈號；常用工具（可以揀）；大卡（下班車／收藏）；交通消息；最近睇過。
 */
export default function HomeTab() {
  const t = useTheme();
  const recent = useRecent();
  const { state, locate } = useNearbyStops(true);
  const pos = state.kind === 'ok' ? { lat: state.lat, lng: state.lng } : null;
  const news = useNews(pos);
  const [tools, setTools] = useTools();
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<NewsFilter>('all');
  const hasPos = !!pos;
  useEffect(() => {
    if (!hasPos) return;
    const id = setTimeout(() => setFilter((f) => (f === 'all' ? 'nearby' : f)), 0);
    return () => clearTimeout(id);
  }, [hasPos]);

  const head = state.kind === 'ok' ? groupStopHeads(state.stops)[0] : undefined;
  const area = state.kind === 'ok' ? state.area : null;
  // 向上捲（同網頁一樣嘅連貫變形，全部跟捲動距離計，原生動畫只郁 transform／opacity）：
  // 頂部「下一程」嗰行同黃色區連埋，stickyHeaderIndices 黐住頂，捲完就係 header。
  // 大字地區名慢一拍下沉、縮細、淡出；去到一半 header 右邊彈出地區膠囊；搜尋欄捲到 header 底時向右收窄、收入搜尋掣，個掣放大轉入嚟
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [locBox, setLocBox] = useState({ y: 40, h: 110 });
  const [searchBox, setSearchBox] = useState({ y: 170, h: 50 });
  // 大字要喺頂部碰到頂部欄（連下面 18px 圓角）之前完全淡出，唔好俾頂部欄切開一半（同網頁一樣）：
  // 佢跟 PARALLAX 比例向下沉，頂部去到頂部欄嘅捲動距離 = 空位 ÷ (1 − PARALLAX)
  const PARALLAX = 0.6;
  const locEnd = Math.max(16, (Math.max(8, locBox.y - 18) / (1 - PARALLAX)) * 0.9);
  const clampI = (input: number[], output: number[]) => scrollY.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });
  const locStyle = {
    opacity: clampI([0, locEnd], [1, 0]),
    transformOrigin: 'top',
    transform: [{ translateY: clampI([0, locEnd], [0, locEnd * PARALLAX]) }, { scale: clampI([0, locEnd], [1, 0.82]) }],
  };
  const pillStyle = {
    opacity: clampI([locEnd * 0.6, locEnd * 1.5], [0, 1]),
    transform: [{ translateY: clampI([locEnd * 0.6, locEnd * 1.5], [14, 0]) }, { scale: clampI([locEnd * 0.6, locEnd * 1.5], [0.7, 1]) }],
  };
  // 搜尋欄同大字一樣：頂部碰到頂部欄（連 18px 圓角）之前 56px 開始收窄淡出，碰到時已經完全收埋（同網頁一樣）
  const s1 = Math.max(1, searchBox.y - 18);
  const s0 = s1 - 56;
  const searchStyle = {
    opacity: clampI([s0, s1], [1, 0]),
    transformOrigin: 'right',
    transform: [{ scaleX: clampI([s0, s1], [1, 0.18]) }],
  };
  const btnStyle = {
    opacity: clampI([s0, s1], [0, 1]),
    transform: [{ scale: clampI([s0, s1], [0.4, 1]) }, { rotate: clampI([s0, s1], [-90, 0]).interpolate({ inputRange: [-90, 0], outputRange: ['-90deg', '0deg'] }) }],
  };
  const nearNews = news?.filter((n) => n.nearby && !n.closed) ?? [];
  const live = news?.filter((n) => !n.closed) ?? [];
  const openNews = () => router.push({ pathname: '/news', params: pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {} });
  const go = (id: ToolId) => {
    if (id === 'routes') router.navigate('/routes');
    else if (id === 'nearby') router.push('/nearby');
    else if (id === 'favs') router.navigate('/favorites');
    else if (id === 'news') openNews();
    else if (id === 'nav') router.navigate('/navigation');
    else router.navigate('/settings');
  };

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        scrollEventThrottle={16}
        stickyHeaderIndices={[0]}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
      {/* 頂部欄：同下面黃色區連埋一塊，黐住頂；捲走黃色區之後佢就係 header */}
      <View style={{ zIndex: 2, paddingTop: insets.top + 10, paddingBottom: 4, paddingLeft: 16, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.brand }}>
        {/* iPhone 頂部拉落時唔好露出灰色 */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: 600, backgroundColor: t.brand }} />
        {/* 下面長期有一截圓角黃色：喺黃色區上面睇唔到，黃色區捲走之後就變成 header 嘅圓角底 */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: 18, backgroundColor: t.brand, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }} />
        <Logo size={22} />
        <Text style={{ fontSize: 18, fontWeight: '800', color: t.onBrand }}>下一程</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7, marginTop: 3 }}>NextLeg</Text>
        {/* 地區膠囊：大字縮細淡出到一半先彈出，好似大字飛咗入嚟 */}
        <View style={{ flex: 1 }} />
        {(area || head) && (
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160, paddingVertical: 5, paddingLeft: 8, paddingRight: 10, borderRadius: 999, backgroundColor: t.onBrandSoft }, pillStyle]}>
            <Icon name="navigate" size={13} color={t.onBrand} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: t.onBrand }}>
              {area ? area.n : head?.name}
            </Text>
          </Animated.View>
        )}
        <Animated.View style={[{ marginLeft: 6 }, btnStyle]}>
          <Pressable onPress={() => go('nav')} accessibilityLabel="導航：想去邊度？" hitSlop={6} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.onBrandSoft }}>
            <Icon name="search" size={22} color={t.onBrand} />
          </Pressable>
        </Animated.View>
      </View>
      <AppBar style={{ gap: 10, paddingTop: 14, paddingBottom: 18 }}>
        {/* 大字地區名（似港鐵 App「青衣 Tsing Yi」）；冇地區數據就用最近站頭名 */}
        <Animated.View onLayout={(e) => setLocBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })} style={[{ alignItems: 'center', paddingTop: 4, paddingBottom: 2 }, locStyle]}>
          <Text numberOfLines={1} style={{ fontSize: 38, fontWeight: '900', color: t.onBrand, letterSpacing: 0.5 }}>
            {area ? area.n : head ? head.name : state.kind === 'locating' ? '定位中…' : '香港'}
          </Text>
          {area?.en && <Text style={{ marginTop: -2, fontSize: 18, fontWeight: '800', color: t.onBrand, opacity: 0.85 }}>{area.en}</Text>}
          {head ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, opacity: 0.75 }}>
              <Icon name="navigate" size={14} color={t.onBrand} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: t.onBrand }}>
                最近巴士站：{head.name} · {formatDistance(head.distance)}
              </Text>
            </View>
          ) : (
            <Pressable onPress={state.kind === 'error' ? () => void locate() : undefined}>
              <Text style={{ marginTop: 4, fontSize: 14, fontWeight: '600', color: t.onBrand, opacity: 0.75, textDecorationLine: state.kind === 'error' ? 'underline' : 'none' }}>
                {state.kind === 'error' ? `${state.message} · 再試` : state.kind === 'ok' ? '600 米內冇巴士站' : '搵緊你附近嘅巴士站'}
              </Text>
            </Pressable>
          )}
        </Animated.View>
        <Animated.View onLayout={(e) => setSearchBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })} style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingRight: 6, borderRadius: radius.m, backgroundColor: t.card, ...shadow }, searchStyle]}>
          <Pressable onPress={() => go('nav')} accessibilityRole="search" accessibilityLabel="導航：想去邊度？" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, alignSelf: 'stretch' }}>
            <Icon name="search" size={20} color={t.muted} />
            <Text style={{ fontSize: 17, color: t.muted }}>想去邊度？</Text>
          </Pressable>
          <Pressable onPress={openNews} accessibilityLabel={`交通消息：${nearNews.length ? `附近 ${nearNews.length} 條` : '附近冇消息'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: t.surface2 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: nearNews.length ? '#E5484D' : '#1E9E5A' }} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: t.text }}>交通消息</Text>
          </Pressable>
        </Animated.View>
      </AppBar>

      <View style={{ minHeight: screenH, padding: 12, paddingBottom: 24, gap: 18 }}>
        <Section
          title="常用工具"
          action={
            <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8} accessibilityLabel={editing ? '完成' : '揀常用工具'}>
              {editing ? <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>完成</Text> : <Icon name="settings" size={20} color={t.muted} />}
            </Pressable>
          }
        >
          {editing ? (
            <View style={{ padding: 14, gap: 10, borderRadius: radius.l, backgroundColor: t.card, ...shadow }}>
              <Text style={{ fontSize: 14, color: t.muted }}>揀最多 {MAX_TOOLS} 個，次序跟揀嘅先後</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TOOLS.map((x) => {
                  const on = tools.includes(x.id);
                  return (
                    <Pressable key={x.id} onPress={() => setTools(toggleTool(tools, x.id))} accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.brandSoft : t.card }}>
                      <Icon name={x.icon} size={18} color={on ? t.text : t.muted} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: on ? t.text : t.muted }}>{x.label}</Text>
                      {on && (
                        <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: t.card }}>{tools.indexOf(x.id) + 1}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {tools.map((id) => {
                const x = TOOLS.find((y) => y.id === id)!;
                return (
                  <Pressable key={id} onPress={() => go(id)} accessibilityRole="button" accessibilityLabel={x.label} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 10, borderRadius: 18, backgroundColor: t.card, transform: [{ scale: pressed ? 0.97 : 1 }], ...shadow })}>
                    <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(x.color, 0.12) }}>
                      <Icon name={x.icon} size={28} color={x.color} />
                      {id === 'news' && nearNews.length > 0 && (
                        <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5484D', borderWidth: 2, borderColor: t.card }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{nearNews.length}</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: t.text }}>
                      {x.label}
                    </Text>
                    {x.soon && <Text style={{ marginTop: -4, fontSize: 11, fontWeight: '700', color: t.muted }}>即將推出</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <NextCard nearby={state} onLocate={() => void locate()} notice={nearNews[0] ? { text: nearNews[0].title, onPress: openNews } : undefined} />

        <Section
          title="交通消息"
          action={
            <Pressable onPress={openNews} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>更多</Text>
              <Icon name="chevron-right" size={16} color={t.accent} />
            </Pressable>
          }
        >
          <NewsChips value={filter} onChange={setFilter} hasPos={hasPos} />
          {news === null ? (
            <Text style={{ color: t.muted, padding: 8 }}>載入中…</Text>
          ) : (
            <NewsList items={filterNews(live, filter).slice(0, NEWS_SHOWN)} empty={filter === 'nearby' ? '附近冇特別交通消息' : '暫時冇特別交通消息'} />
          )}
        </Section>

        {recent.length > 0 && (
          <Section title="最近睇過">
            <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
              {recent.slice(0, RECENT_SHOWN).map((r, i) => {
                const c = COMPANIES[r.companies[0] ?? 'CTB'];
                return (
                  <Pressable
                    key={`${r.co}-${r.route}-${r.dir}`}
                    onPressIn={() => warmRoute(r.co, r.route, { dir: r.dir })}
                    onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: r.co, route: r.route, dir: r.dir } })}
                    accessibilityRole="link"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
                  >
                    <View style={{ minWidth: 56, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignItems: 'center', backgroundColor: c.bg }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: c.ink, ...tabular }}>{r.route}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.text }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: t.muted }}>往 </Text>
                      {r.dest}
                    </Text>
                    <Icon name="chevron-right" size={18} color={t.muted} />
                  </Pressable>
                );
              })}
            </View>
          </Section>
        )}
      </View>
      </Animated.ScrollView>

    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}
