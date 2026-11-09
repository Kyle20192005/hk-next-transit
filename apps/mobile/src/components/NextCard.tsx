import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { busDepartureRows, favDepartureRows, favsForNow, formatDistance, groupFavorites, groupStopHeads, LRT_BRAND, lrtDepartureRows, lrtStopName, minutesLabel, mtrDepartureRows, mtrCardStations, mtrStationName, orderNearCards, radiusLabel, railCardStations, type DepartureRow, type FavGroup, type StopHead } from '@hknt/core';
import { api, type Co, type NearStop } from '@/lib/api';
import { isLrtFav, isMtrFav, useFavorites, type Favorite } from '@/lib/favorites';
import { openLrt, openMtr } from '@/lib/open-mtr';
import { useFavGroups } from '@/lib/fav-groups';
import { warmRoute } from '@/lib/prefetch';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import Svg, { Path } from 'react-native-svg';
import { Icon, type IconName } from './Icon';
import type { NearbyState } from './Nearby';
import { ScheduledTag } from './ui';
import { usePrefs } from '@/lib/prefs';

const MAX_CARDS = 5;
/** 載入幾多個站頭（有啲冇車，要多攞幾個先夠 5 張） */
const LOAD_HEADS = 8;
const ROWS = 4;
const REFRESH_MS = 30_000;
const GAP = 10;
const TAB_KEY = 'hknt.nextTab';
type Tab = 'next' | 'favs';
/** 港鐵站卡：幾多米內、最多幾張（冇就出 2 公里內最近一個，core mtrCardStations）；加埋 800 米內輕鐵站，鐵路卡最多 3 張（core railCardStations） */
const MTR_CARD_M = 800;
const MTR_CARDS = 2;
const RAIL_CARDS = 3;
/** 下班車分頁一張卡：港鐵站、輕鐵站或者巴士站頭 */
type NearItem = { key: string; name: string; distance: number } & ({ kind: 'mtr' | 'lrt'; sta: string } | { kind: 'bus'; head: StopHead<NearStop> });
/** 打開路綫圖嗰個站（輕鐵定港鐵） */
const openRail = (sta: string, lrt: boolean) => (lrt ? openLrt(sta) : openMtr(sta));

/**
 * 首頁大卡（似港鐵 App 嘅「下班車」小工具）：頂部兩個分頁「下班車」（附近）同「收藏」，
 * 入面一行站名（跟住而家睇緊嗰張），下面打橫掃嘅到站卡（左右兩邊色條）。同網頁 components/home/NextCard.tsx 一樣：
 * 附近 800 米內嘅港鐵站、輕鐵站卡（綫色／路線色、月台，「交通工具優先」揀港鐵就排最前），收藏咗嘅港鐵站、輕鐵站一個站一張卡；鐵路行撳落去開路綫圖嗰個站。
 */
export function NextCard({ nearby, onLocate, notice }: { nearby: NearbyState; onLocate: () => void; notice?: { text: string; onPress: () => void } }) {
  const t = useTheme();
  const favs = useFavorites();
  const [tab, setTab] = useState<Tab>('next');
  // 設定「首頁大卡預設」：上次睇開（記住）、下班車、收藏
  const { homeCard } = usePrefs();
  useEffect(() => {
    if (homeCard !== 'last') {
      const id = setTimeout(() => setTab(homeCard), 0);
      return () => clearTimeout(id);
    }
    AsyncStorage.getItem(TAB_KEY)
      .then((v) => (v === 'next' || v === 'favs') && setTab(v))
      .catch(() => {});
  }, [homeCard]);
  const pick = (v: Tab) => {
    setTab(v);
    AsyncStorage.setItem(TAB_KEY, v).catch(() => {});
  };
  const tabBtn = (v: Tab, label: string, icon: IconName, iconColor: string) => {
    const on = tab === v;
    return (
      <Pressable onPress={() => pick(v)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name={icon} size={22} color={iconColor} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: on ? t.text : t.muted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
      <View>
        {/* 背景：揀咗嗰邊白色，中間斜邊（似港鐵 App），另一邊灰色；揀右邊時左右反轉 */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: t.surface2, transform: [{ scaleX: tab === 'favs' ? -1 : 1 }] }}>
          <View style={{ flex: 1, backgroundColor: t.card }} />
          <Svg width={56} height="100%" viewBox="0 0 56 52" preserveAspectRatio="none">
            <Path d="M0 0H8Q16 0 19.5 7.5L34.5 44.5Q38 52 46 52H56V53H0Z" fill={t.card} />
          </Svg>
          <View style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          {tabBtn('next', '下班車', 'clock', tab === 'next' ? '#2f6fd6' : 'rgba(47,111,214,0.6)')}
          {tabBtn('favs', '收藏', tab === 'favs' ? 'star-fill' : 'star', tab === 'favs' ? t.brand : t.muted)}
        </View>
      </View>
      <View style={{ paddingTop: 12, paddingBottom: 10 }}>
        {tab === 'next' ? <NearbyPane state={nearby} onLocate={onLocate} /> : <FavPane favs={favs} />}
        {/* 提示條（附近嘅交通消息），似港鐵「扶手電梯特別安排」 */}
        {tab === 'next' && notice && (
          <Pressable onPress={notice.onPress} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 2, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.brandSoft }}>
            <Icon name="warning" size={20} color="#D7282F" />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.text }}>
              {notice.text}
            </Text>
            <Icon name="chevron-right" size={18} color={t.muted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function NearbyPane({ state, onLocate }: { state: NearbyState; onLocate: () => void }) {
  const t = useTheme();
  const heads: NearItem[] =
    state.kind === 'ok'
      ? [
          ...railCardStations(mtrCardStations(state.mtr, MTR_CARD_M, MTR_CARDS), state.lat, state.lng, MTR_CARD_M, RAIL_CARDS).map((m) => ({
            key: `${m.kind}-${m.sta}`,
            kind: m.kind,
            sta: m.sta,
            name: m.kind === 'lrt' ? lrtStopName(m.sta) : mtrStationName(m.sta),
            distance: m.distance,
          })),
          ...groupStopHeads(state.stops)
            .slice(0, LOAD_HEADS)
            .map((h) => ({ key: h.key, kind: 'bus' as const, head: h, name: h.name, distance: h.distance })),
        ]
      : [];
  const data = useHeadRows(heads);
  const { nearbyRadius, priority } = usePrefs();
  const [shown] = useState(() => new Set<string>());
  if (state.kind !== 'ok') {
    return (
      <Message
        text={state.kind === 'error' ? state.message : state.kind === 'locating' ? '定位中…' : '搵你附近嘅車站同下一班車'}
        error={state.kind === 'error'}
        action={state.kind === 'locating' ? undefined : { label: state.kind === 'error' ? '再試' : '定位', onPress: onLocate }}
      />
    );
  }
  if (!heads.length) return <Message text={`${radiusLabel(nearbyRadius)}內冇巴士站`} />;
  // 冇班次嘅站頭唔出卡。全部載入完先出（逐張加會推走畫面）；出咗嘅卡之後冇車都保留（同網頁一樣）
  const ready = heads.every((h) => data[h.key]);
  if (!ready && !shown.size) return <Message text="載入中…" />;
  const has = (h: NearItem) => data[h.key]?.rows.length || shown.has(h.key);
  // 設定「交通工具優先」：港鐵 → 鐵路站卡排先；巴士 → 巴士站卡排先，鐵路站卡跟後（同網頁一樣）
  const cards = orderNearCards(
    heads.filter((h) => h.kind !== 'bus' && has(h)),
    heads.filter((h) => h.kind === 'bus' && has(h)),
    priority,
    MAX_CARDS,
  );
  cards.forEach((h) => shown.add(h.key));
  if (!cards.length) return <Message text="附近暫時冇班次" />;
  return (
    <Swiper
      items={cards}
      header={(h) => (
        <>
          <Icon name={h.kind === 'mtr' ? 'train' : h.kind === 'lrt' ? 'lrt' : 'navigate'} size={18} color="#2f6fd6" />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: t.text }}>
            {h.kind === 'mtr' ? `港鐵${h.name}站` : h.kind === 'lrt' ? `輕鐵${h.name}站` : h.name}
          </Text>
          <Text style={{ fontSize: 13, color: t.muted }}>{formatDistance(h.distance)}</Text>
        </>
      )}
      action={(h) => ({ label: '更多', onPress: h.kind === 'bus' ? () => router.push('/nearby') : () => openRail(h.sta, h.kind === 'lrt') })}
      card={(h) => <RowsCard rows={data[h.key]?.rows ?? null} now={data[h.key]?.now ?? 0} accent={h.kind === 'lrt' ? LRT_BRAND.color : undefined} />}
    />
  );
}

/** 附近幾個站頭（同港鐵站）一齊載入（先知邊啲有車），每 30 秒更新 */
function useHeadRows(heads: NearItem[]): Record<string, { rows: DepartureRow[]; now: number }> {
  const [data, setData] = useState<Record<string, { rows: DepartureRow[]; now: number }>>({});
  const key = heads.map((h) => h.key).join('|');
  const headsRef = useRef(heads);
  useEffect(() => {
    headsRef.current = heads;
  });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const tick = () =>
      headsRef.current.forEach(async (h) => {
        let rows: DepartureRow[] = [];
        try {
          if (h.kind === 'mtr') rows = mtrDepartureRows(h.sta, (await api.mtr(h.sta)).lines, ROWS);
          else if (h.kind === 'lrt') rows = lrtDepartureRows(h.sta, (await api.lrt(h.sta)).platforms, Date.now(), ROWS);
          else if (h.kind === 'bus') rows = busDepartureRows((await api.here(h.head.lat, h.head.lng)).routes, Date.now(), ROWS);
        } catch {
          /* 當冇車，下次再試 */
        }
        if (!cancelled) setData((d) => ({ ...d, [h.key]: { rows, now: Date.now() } }));
      });
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [key]);
  return data;
}

function FavPane({ favs }: { favs: Favorite[] }) {
  const t = useTheme();
  // 收藏分組：而家時段嘅組（例如朝早「返工」）排最前，卡頂標組名
  const favGroups = useFavGroups();
  const [now] = useState(() => Date.now());
  const { favs: ordered, active } = favsForNow(favs, favGroups, now);
  const groups = groupFavorites(ordered);
  if (!groups.length) return <Message text="喺路線頁撳星號收藏路線，打開一個站撳「收藏呢個站」，或者喺港鐵、輕鐵路綫圖撳站嘅星號，就會喺度見到下一班車。" />;
  return (
    <Swiper
      items={groups}
      header={(g) => (
        <>
          <Icon name={g.favs[0] && isMtrFav(g.favs[0]) ? 'train' : g.favs[0] && isLrtFav(g.favs[0]) ? 'lrt' : g.isStop ? 'pin' : 'route'} size={18} color="#2f6fd6" />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: t.text }}>
            {g.favs[0] && isMtrFav(g.favs[0]) ? `港鐵${g.name}站` : g.favs[0] && isLrtFav(g.favs[0]) ? `輕鐵${g.name}站` : g.name}
          </Text>
          {active && g.favs.some((f) => f.group === active.id) && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.brandSoft }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: t.accent }}>{active.name}</Text>
            </View>
          )}
        </>
      )}
      action={() => ({ label: '全部', onPress: () => router.navigate('/favorites') })}
      card={(g, active) =>
        g.favs[0] && isMtrFav(g.favs[0]) ? (
          <MtrFavCard sta={g.favs[0].stopId!} only={g.favs.some((f) => !f.route) ? undefined : g.favs.map((f) => f.route)} active={active} />
        ) : g.favs[0] && isLrtFav(g.favs[0]) ? (
          <LrtFavCard sta={g.favs[0].stopId!} active={active} />
        ) : (
          <FavCard group={g} active={active} />
        )
      }
    />
  );
}

function Swiper<T extends { key: string }>({ items, header, action: actionOf, card }: { items: T[]; header: (item: T) => ReactNode; action: (item: T) => { label: string; onPress: () => void }; card: (item: T, active: boolean) => ReactNode }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(1);
  const cardW = items.length > 1 ? Math.round((width - 32) * 0.92) : width - 32;
  const cur = items[Math.min(index, items.length - 1)]!;
  // 右上掣跟住而家睇緊嗰張卡（港鐵卡「更多」開路綫圖嗰個站）
  const action = actionOf(cur);
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

/** 收藏咗嘅港鐵站：收藏咗嘅綫（only；冇 = 所有綫）每個方向下一班 */
function MtrFavCard({ sta, only, active }: { sta: string; only?: string[]; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(active, `mtr-${sta}-${only?.join(',') ?? ''}`, async () => {
    const body = await api.mtr(sta);
    setState({ rows: mtrDepartureRows(sta, body.lines, ROWS, only), now: Date.now() });
  });
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} empty={sta === 'RAC' ? '只喺賽馬日開放' : '暫時冇班次'} />;
}

/** 收藏咗嘅輕鐵站：每條路線每個目的地下一班（最多 4 行） */
function LrtFavCard({ sta, active }: { sta: string; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  usePoll(active, `lrt-${sta}`, async () => {
    const body = await api.lrt(sta);
    const now = Date.now();
    setState({ rows: lrtDepartureRows(sta, body.platforms, now, ROWS), now });
  });
  return <RowsCard rows={state?.rows ?? null} now={state?.now ?? 0} accent={LRT_BRAND.color} />;
}

function FavCard({ group, active }: { group: FavGroup<Favorite>; active: boolean }) {
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  const key = group.favs.map((f) => `${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`).join('|');
  usePoll(active, key, async () => {
    const items = await Promise.all(
      group.favs.map(async (fav) => {
        if (!fav.stopId || isMtrFav(fav) || isLrtFav(fav)) return { fav, etas: null };
        try {
          const body = await api.eta(fav.co as Co, fav.route, fav.stopId);
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

/** 一張到站卡：左右兩邊色條（第一班嘅公司色／綫色；輕鐵站一律輕鐵金色 accent），每行 標籤、往邊、（鐵路月台）、分鐘 */
function RowsCard({ rows, now, empty = '暫時冇班次', accent: fixed }: { rows: DepartureRow[] | null; now: number; empty?: string; accent?: string }) {
  const t = useTheme();
  const { etaFormat } = usePrefs();
  const accent = fixed ?? rows?.[0]?.badge.bg ?? t.line;
  return (
    <View style={{ minHeight: 172, justifyContent: 'center', paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: t.line, borderLeftWidth: 8, borderRightWidth: 8, borderLeftColor: accent, borderRightColor: accent, backgroundColor: t.card }}>
      {rows === null && <Text style={{ textAlign: 'center', color: t.muted }}>載入中…</Text>}
      {rows?.length === 0 && <Text style={{ textAlign: 'center', color: t.muted }}>{empty}</Text>}
      {rows?.map((r) => (
        <Pressable
          key={r.key}
          onPressIn={() => r.link.co !== 'mtr' && r.link.co !== 'lrt' && warmRoute(r.link.co as Co, r.link.route, { dir: r.link.dir, stopId: r.link.stop })}
          onPress={() =>
            r.link.co === 'mtr' || r.link.co === 'lrt'
              ? openRail(r.link.stop!, r.link.co === 'lrt')
              : router.push({ pathname: '/[co]/[route]', params: { co: r.link.co, route: r.link.route, dir: r.link.dir, ...(r.link.stop ? { stop: r.link.stop } : {}) } })
          }
          accessibilityRole="link"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}
        >
          <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink, ...tabular }}>{r.badge.text}</Text>
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '600', color: t.text }}>
            往{r.dest}
          </Text>
          {r.platform ? (
            <View accessibilityLabel={`${r.platform} 號月台`} style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: r.badge.bg }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: r.badge.ink }}>{r.platform}</Text>
            </View>
          ) : null}
          {r.scheduled && <ScheduledTag />}
          {r.nowText ? (
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.text }}>{r.nowText}</Text>
          ) : r.noService ? (
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.muted }}>冇班次</Text>
          ) : r.at === null ? (
            <Icon name="chevron-right" size={18} color={t.muted} />
          ) : (
            <Text style={{ fontSize: 18, fontWeight: '800', color: t.text, ...tabular }}>{minutesLabel(r.at, now, etaFormat)}</Text>
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
