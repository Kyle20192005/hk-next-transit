import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { COMPANIES, filterNews, formatDistance, groupStopHeads, radiusLabel, toolById, type NewsFilter, type ToolId } from '@hknt/core';
import { Icon } from '@/components/Icon';
import { HomeHeader } from '@/components/HomeHeader';
import { useNearbyStops } from '@/components/Nearby';
import { NextCard } from '@/components/NextCard';
import { ToolTile } from '@/components/ToolTile';
import { NewsChips, NewsList } from '@/components/NewsList';
import { useNews, useTools } from '@/lib/news';
import { warmRoute } from '@/lib/prefetch';
import { useRecent } from '@/lib/recent';
import { usePrefs } from '@/lib/prefs';
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
  const prefs = usePrefs();
  const { state, locate } = useNearbyStops(true);
  const pos = state.kind === 'ok' ? { lat: state.lat, lng: state.lng } : null;
  const news = useNews(pos);
  const tools = useTools();
  const [filter, setFilter] = useState<NewsFilter>('all');
  const hasPos = !!pos;
  useEffect(() => {
    if (!hasPos) return;
    const id = setTimeout(() => setFilter((f) => (f === 'all' ? 'nearby' : f)), 0);
    return () => clearTimeout(id);
  }, [hasPos]);

  const head = state.kind === 'ok' ? groupStopHeads(state.stops)[0] : undefined;
  const area = state.kind === 'ok' ? state.area : null;
  // 首頁 header（HomeHeader，一件嘢，會收縮；同網頁一樣）：浮喺捲動區上面，捲動內容頂留返 header 咁高
  const { height: screenH } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerH, setHeaderH] = useState(300);
  // 停喺收縮一半：自動捲去收埋或者展開（跟捲動方向，似 iPhone 大標題）
  const scroller = useRef<ScrollViewInstance>(null);
  const range = useRef(0);
  const dragStart = useRef(0);
  const [setRange] = useState(() => (d: number) => {
    range.current = d;
  });
  const snap = (y: number, dir: number) => {
    const D = range.current;
    if (D <= 0 || y <= 0 || y >= D - 1) return;
    scroller.current?.scrollTo({ y: dir < 0 ? 0 : D, animated: true });
  };
  const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const v = e.nativeEvent.velocity?.y ?? 0;
    // 有慣性嘅話等慣性停咗（onMomentumScrollEnd）先決定
    if (Math.abs(v) < 0.05) snap(y, y >= dragStart.current ? 1 : -1);
  };
  const nearNews = news?.filter((n) => n.nearby && !n.closed) ?? [];
  const live = news?.filter((n) => !n.closed) ?? [];
  const openNews = () => router.push({ pathname: '/news', params: pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {} });
  const go = (id: ToolId) => {
    const mode = toolById(id).mode;
    // 交通工具捷徑：入「路線」分頁揀好嗰款
    if (mode) router.navigate({ pathname: '/routes', params: { mode } });
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
        ref={scroller}
        contentContainerStyle={{ paddingTop: headerH }}
        onScrollBeginDrag={(e) => (dragStart.current = e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={onEndDrag}
        onMomentumScrollEnd={(e) => snap(e.nativeEvent.contentOffset.y, e.nativeEvent.contentOffset.y >= dragStart.current ? 1 : -1)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
      <View style={{ minHeight: screenH, padding: 12, paddingBottom: 24, gap: 18 }}>
        <Section
          title="常用工具"
          action={
            <Pressable onPress={() => router.push('/tools')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityLabel="自訂常用工具">
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>自訂</Text>
              <Icon name="chevron-right" size={16} color={t.accent} />
            </Pressable>
          }
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {tools.map((id) => (
              <ToolTile key={id} id={id} onPress={() => go(id)} badge={id === 'news' ? nearNews.length : 0} />
            ))}
          </View>
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
      <HomeHeader
        scrollY={scrollY}
        onHeight={setHeaderH}
        onRange={setRange}
        name={area ? area.n : head ? head.name : state.kind === 'locating' ? '定位中…' : '香港'}
        en={area?.en}
        pill={area ? area.n : head ? head.name : null}
        onSearch={() => go('nav')}
        sub={
          head ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.75 }}>
              <Icon name="navigate" size={14} color={t.onBrand} />
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: t.onBrand }}>
                最近巴士站：{head.name} · {formatDistance(head.distance)}
              </Text>
            </View>
          ) : (
            <Pressable onPress={state.kind === 'error' || state.kind === 'idle' ? () => void locate() : undefined}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onBrand, opacity: 0.75, textDecorationLine: state.kind === 'error' || state.kind === 'idle' ? 'underline' : 'none' }}>
                {state.kind === 'error' ? `${state.message} · 再試` : state.kind === 'ok' ? `${radiusLabel(prefs.nearbyRadius)}內冇巴士站` : state.kind === 'idle' ? '撳呢度定位，搵附近巴士站' : '搵緊你附近嘅巴士站'}
              </Text>
            </Pressable>
          )
        }
        status={
          <Pressable onPress={openNews} accessibilityLabel={`交通消息：${nearNews.length ? `附近 ${nearNews.length} 條` : '附近冇消息'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: t.surface2 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: nearNews.length ? '#E5484D' : '#1E9E5A' }} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: t.text }}>交通消息</Text>
          </Pressable>
        }
      />

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
