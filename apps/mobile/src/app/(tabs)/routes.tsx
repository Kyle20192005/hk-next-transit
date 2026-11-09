import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { TRANSPORT_MODES, orderedModes, placeMatches, radiusLabel, type PlaceMatch, type RouteIndex, type StopRouteHit, type TransportMode } from '@hknt/core';
import { api, type Co } from '@/lib/api';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { AppBar, Brand, BRAND_ROW, ComingSoon, CompanyTag } from '@/components/ui';
import { RailView } from '@/components/RailView';
import { TramView } from '@/components/TramView';
import { Icon } from '@/components/Icon';
import { Keypad } from '@/components/Keypad';
import { preloadRoute, warmRoute } from '@/lib/prefetch';
import { usePrefs } from '@/lib/prefs';

type Route = RouteIndex['routes'][number];

/**
 * 路線列表（同網頁版首頁一樣）：
 * - 黃色標題區入面嘅搜尋欄；預設用巴士號碼鍵盤（唔彈系統鍵盤），撳「地點」轉做打字搜起點／終點
 * - 鍵盤只開可以接落去嘅數字同字母
 * - 雙向路線列出兩個目的地，各自撳入對應方向
 */
export default function RoutesTab() {
  const t = useTheme();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [place, setPlace] = useState<string | null>(null);
  // 交通工具：暫時只有巴士做好；首頁捷徑會帶 ?mode= 過嚟
  // 首頁大字、大卡、收藏撳港鐵站：?mode=rail&sta=XXX&n=（n 每次唔同，同一個站都會再飛）
  const params = useLocalSearchParams<{ mode?: string; sta?: string; n?: string; lrt?: string }>();
  // 設定「交通工具優先」：預設揀邊款、分類次序
  const { priority } = usePrefs();
  const [mode, setMode] = useState<TransportMode>(priority === 'rail' ? 'rail' : 'bus');
  const [seenParam, setSeenParam] = useState<string | undefined>(undefined);
  const paramKey = `${params.mode}:${params.n ?? ''}`;
  if (paramKey !== seenParam) {
    setSeenParam(paramKey);
    if (TRANSPORT_MODES.some((m) => m.id === params.mode)) setMode(params.mode as TransportMode);
  }
  const [seenPriority, setSeenPriority] = useState(priority);
  if (priority !== seenPriority) {
    setSeenPriority(priority);
    setMode(priority === 'rail' ? 'rail' : 'bus');
  }
  // 港鐵路綫圖網頁版做咗，App 版未做：App 暫時當未 ready（顯示「功能即將推出」）
  const modeInfo = TRANSPORT_MODES.find((m) => m.id === mode)!;
  // 港鐵：路綫圖 + 車站搜尋（唔使號碼鍵盤）
  const rail = mode === 'rail';
  const [railQ, setRailQ] = useState('');
  // 電車：路綫圖 + 電車站搜尋（同港鐵一樣，唔使號碼鍵盤）
  const tram = mode === 'tram';
  const [tramQ, setTramQ] = useState('');
  const list = useRef<FlatList<PlaceMatch<Route>>>(null);

  const fetchRoutes = () => api.routes().then((r) => setRoutes(r.routes)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void fetchRoutes();
  }, []);
  const load = () => {
    setError(null);
    void fetchRoutes();
  };

  // 地點搜尋：中途站經過嘅路線由伺服器搵（同網頁一樣），停手 0.25 秒先問
  const [hits, setHits] = useState<{ q: string; routes: StopRouteHit[] }>({ q: '', routes: [] });
  const placeQ = place?.trim() ?? '';
  useEffect(() => {
    if (!placeQ) return;
    let cancelled = false;
    const id = setTimeout(() => {
      api
        .stopSearch(placeQ)
        .then((b) => !cancelled && setHits({ q: placeQ, routes: b.routes }))
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [placeQ]);
  const searchingStops = place !== null && !!placeQ && hits.q !== placeQ;

  const matches = useMemo<PlaceMatch<Route>[]>(() => {
    if (!routes) return [];
    if (place !== null) return placeMatches(routes, placeQ, hits.q === placeQ ? hits.routes : []);
    return (code ? routes.filter((r) => r.route.startsWith(code)) : routes).map((r) => ({ r, via: {} }));
  }, [routes, code, place, placeQ, hits]);

  const nextChars = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes ?? []) if (r.route.startsWith(code) && r.route.length > code.length) set.add(r.route[code.length]!);
    return set;
  }, [routes, code]);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [code, place]);

  // 預先 fetch：候選得 3 條或以下、停咗 0.4 秒，預載佢哋嘅路線資料（唔 call 巴士公司）
  useEffect(() => {
    if (!code && !place?.trim()) return;
    if (matches.length === 0 || matches.length > 3) return;
    const id = setTimeout(() => matches.forEach(({ r }) => preloadRoute((r.co ?? 'ctb') as Co, r.route)), 400);
    return () => clearTimeout(id);
  }, [matches, code, place]);

  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <View style={BRAND_ROW}>
          <Brand />
        </View>
        {/* 交通工具分類（同網頁一樣）：喺搜尋欄上面；揀咗未做嘅，搜尋欄同鍵盤都收埋 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: -4, marginBottom: -2 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {orderedModes(priority).map((m) => {
            const on = mode === m.id;
            return (
              <Pressable key={m.id} onPress={() => setMode(m.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? t.onBrand : t.onBrandSoft }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: on ? t.brand : t.onBrand }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {rail && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 8, borderRadius: radius.m, backgroundColor: t.card, ...shadow }}>
            <Icon name="search" size={20} color={t.muted} />
            <TextInput
              value={railQ}
              onChangeText={setRailQ}
              placeholder="搜尋港鐵站、輕鐵站，例如 旺角、天水圍"
              placeholderTextColor={t.muted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="搜尋港鐵站"
              style={{ flex: 1, fontSize: 17, color: t.text, paddingVertical: 12 }}
            />
            {railQ !== '' && (
              <Pressable onPress={() => setRailQ('')} accessibilityLabel="清除" style={{ width: 34, height: 34, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
                <Icon name="close" size={18} color={t.muted} />
              </Pressable>
            )}
          </View>
        )}
        {tram && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 8, borderRadius: radius.m, backgroundColor: t.card, ...shadow }}>
            <Icon name="search" size={20} color={t.muted} />
            <TextInput
              value={tramQ}
              onChangeText={setTramQ}
              placeholder="搜尋電車站，例如 銀行街、跑馬地"
              placeholderTextColor={t.muted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="搜尋電車站"
              style={{ flex: 1, fontSize: 17, color: t.text, paddingVertical: 12 }}
            />
            {tramQ !== '' && (
              <Pressable onPress={() => setTramQ('')} accessibilityLabel="清除" style={{ width: 34, height: 34, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
                <Icon name="close" size={18} color={t.muted} />
              </Pressable>
            )}
          </View>
        )}
        {modeInfo.ready && !rail && !tram && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 14, paddingRight: 8, borderRadius: radius.m, backgroundColor: t.card, ...shadow }}>
          <Icon name="search" size={20} color={t.muted} />
          {place === null ? (
            <Pressable style={{ flex: 1, paddingVertical: 12 }} onPress={() => setPlace('')} accessibilityRole="search" accessibilityLabel="搜尋路線">
              <Text style={code ? { fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: 0.5 } : { fontSize: 17, color: t.muted }}>{code || '輸入路線號碼'}</Text>
            </Pressable>
          ) : (
            <TextInput
              autoFocus
              value={place}
              onChangeText={setPlace}
              placeholder="輸入地點，例如 北角、中環"
              placeholderTextColor={t.muted}
              returnKeyType="search"
              style={{ flex: 1, fontSize: 17, color: t.text, paddingVertical: 12 }}
            />
          )}
          {(code || place !== null) && (
            <Pressable
              onPress={() => (place !== null ? setPlace(null) : setCode(''))}
              accessibilityLabel={place !== null ? '轉返號碼鍵盤' : '清除'}
              style={{ minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}
            >
              {place !== null ? <Text style={{ fontWeight: '700', color: t.muted }}>123</Text> : <Icon name="close" size={18} color={t.muted} />}
            </Pressable>
          )}
        </View>
        )}
      </AppBar>

      {rail ? (
        <RailView query={railQ} onPicked={() => setRailQ('')} open={params.sta && params.mode !== 'tram' ? { sta: params.sta, n: params.n ?? '', lrt: params.lrt === '1' } : null} />
      ) : tram ? (
        <TramView query={tramQ} onPicked={() => setTramQ('')} open={params.sta && params.mode === 'tram' ? { sta: params.sta, n: params.n ?? '' } : null} />
      ) : !modeInfo.ready ? (
        <ComingSoon icon="route" title={`${modeInfo.label}到站`} text="巴士做好咗先，其他交通工具陸續加入。" />
      ) : error ? (
        <Pressable onPress={load} style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: t.special }}>載入失敗：{error}</Text>
          <Text style={{ color: t.accent, marginTop: 6, fontWeight: '600' }}>撳一下再試</Text>
        </Pressable>
      ) : !routes ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          ref={list}
          data={matches}
          keyExtractor={({ r }) => `${r.co ?? 'ctb'}-${r.route}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12, gap: 8 }}
          initialNumToRender={15}
          windowSize={7}
          renderItem={({ item }) => <RouteCard r={item.r} via={item.via} />}
          ListHeaderComponent={!code && place === null ? <NearbyShortcut /> : undefined}
          ListEmptyComponent={searchingStops ? undefined : <Text style={{ textAlign: 'center', padding: 20, color: t.muted }}>搵唔到路線</Text>}
          ListFooterComponent={searchingStops ? <Text style={{ textAlign: 'center', padding: 16, color: t.muted }}>搵緊經過呢度嘅路線…</Text> : undefined}
        />
      )}

      {modeInfo.ready && !rail && !tram && place === null && routes && (
        <Keypad nextChars={nextChars} onKey={(k) => setCode((c) => c + k)} onBack={() => setCode((c) => c.slice(0, -1))} onPlace={() => setPlace('')} canBack={code.length > 0} />
      )}
    </View>
  );
}

/** 一條路線一張卡：左邊號碼同公司，右邊每個方向一行（撳入對應方向） */
function RouteCard({ r, via = {} }: { r: Route; via?: PlaceMatch<Route>['via'] }) {
  const t = useTheme();
  const co = (r.co ?? 'ctb') as Co;
  const dirs = r.dirs ?? ['O'];
  const loop = r.origTc === r.destTc;
  // 地點搜尋撞中中途站：顯示「經 XX」，撳入去直接打開嗰個站（同網頁一樣）
  const loopVia = via.O ?? via.I;
  const options = loop
    ? [{ d: loopVia?.dir ?? ('O' as const), to: r.origTc, sub: loopVia ? `循環線 · 經 ${loopVia.stopName}` : '循環線', stop: loopVia?.stopId, isVia: !!loopVia }]
    : (['O', 'I'] as const)
        .filter((d) => dirs.includes(d))
        .map((d) => ({
          d,
          to: d === 'O' ? r.destTc : r.origTc,
          sub: via[d] ? `經 ${via[d]!.stopName}` : dirs.length === 1 ? `由 ${d === 'O' ? r.origTc : r.destTc}` : null,
          stop: via[d]?.stopId,
          isVia: !!via[d],
        }));
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: radius.m, overflow: 'hidden', ...shadow }}>
      <Pressable onPressIn={() => warmRoute(co, r.route)} onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: r.route } })} accessibilityRole="link" style={{ width: 108, paddingVertical: 12, paddingLeft: 16, justifyContent: 'center', gap: 4 }} accessibilityLabel={`${r.route} 路線`}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.3, ...tabular }}>{r.route}</Text>
          <CompanyTag companies={r.companies ?? ['CTB']} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {/* 唔用 Link asChild：web 版唔會將 Pressable 嘅 style 傳落 <a>，排版會亂 */}
        {options.map((o, i) => (
            <Pressable
              key={o.d}
              onPressIn={() => warmRoute(co, r.route, { dir: o.d, stopId: o.stop })}
              onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: r.route, dir: o.d, ...(o.stop ? { stop: o.stop } : {}) } })}
              accessibilityRole="link"
              accessibilityLabel={`${r.route} 往 ${o.to}${o.isVia ? `，${o.sub}` : ''}`}
              style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 4, paddingRight: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>
                  {!loop && <Text style={{ color: t.muted, fontWeight: '500', fontSize: 13 }}>往 </Text>}
                  {o.to}
                </Text>
                {o.sub && (
                  <Text numberOfLines={1} style={{ color: o.isVia ? t.accent : t.muted, fontWeight: o.isVia ? '600' : '400', fontSize: 13 }}>
                    {o.sub}
                  </Text>
                )}
              </View>
              <Icon name="chevron-right" size={18} color={t.muted} />
            </Pressable>
        ))}
      </View>
    </View>
  );
}

/** 巴士路線頁頂：「附近巴士站」捷徑（同網頁一樣） */
function NearbyShortcut() {
  const t = useTheme();
  const { nearbyRadius } = usePrefs();
  return (
    <Pressable
      onPress={() => router.push('/nearby')}
      accessibilityRole="link"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.m, backgroundColor: t.card, transform: [{ scale: pressed ? 0.98 : 1 }], ...shadow })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.brandSoft }}>
        <Icon name="pin" size={20} color={t.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>附近巴士站</Text>
        <Text style={{ fontSize: 13, color: t.muted }}>搵你附近 {radiusLabel(nearbyRadius)}內嘅站同每條線下一班車</Text>
      </View>
      <Icon name="chevron-right" size={18} color={t.muted} />
    </Pressable>
  );
}
