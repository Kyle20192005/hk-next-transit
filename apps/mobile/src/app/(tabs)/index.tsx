import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { RouteIndex } from '@hknt/core';
import { api, type Co } from '@/lib/api';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { AppBar, CompanyTag } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Keypad } from '@/components/Keypad';

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
  const list = useRef<FlatList<Route>>(null);

  const fetchRoutes = () => api.routes().then((r) => setRoutes(r.routes)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void fetchRoutes();
  }, []);
  const load = () => {
    setError(null);
    void fetchRoutes();
  };

  const matches = useMemo(() => {
    if (!routes) return [];
    if (place !== null) {
      const s = place.trim();
      return s ? routes.filter((r) => r.origTc?.includes(s) || r.destTc?.includes(s) || r.route.includes(s.toUpperCase())) : routes;
    }
    return code ? routes.filter((r) => r.route.startsWith(code)) : routes;
  }, [routes, code, place]);

  const nextChars = useMemo(() => {
    const set = new Set<string>();
    for (const r of routes ?? []) if (r.route.startsWith(code) && r.route.length > code.length) set.add(r.route[code.length]!);
    return set;
  }, [routes, code]);

  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [code, place]);

  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand, letterSpacing: -0.3 }}>香港巴士到站</Text>
          {routes && <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7 }}>{routes.length} 條路線</Text>}
        </View>
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
      </AppBar>

      {error ? (
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
          keyExtractor={(r) => `${r.co ?? 'ctb'}-${r.route}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12, gap: 8 }}
          initialNumToRender={15}
          windowSize={7}
          renderItem={({ item }) => <RouteCard r={item} />}
          ListEmptyComponent={<Text style={{ textAlign: 'center', padding: 20, color: t.muted }}>搵唔到路線</Text>}
        />
      )}

      {place === null && routes && (
        <Keypad nextChars={nextChars} onKey={(k) => setCode((c) => c + k)} onBack={() => setCode((c) => c.slice(0, -1))} onPlace={() => setPlace('')} canBack={code.length > 0} />
      )}
    </View>
  );
}

/** 一條路線一張卡：左邊號碼同公司，右邊每個方向一行（撳入對應方向） */
function RouteCard({ r }: { r: Route }) {
  const t = useTheme();
  const co = (r.co ?? 'ctb') as Co;
  const dirs = r.dirs ?? ['O'];
  const loop = r.origTc === r.destTc;
  const options = loop
    ? [{ d: 'O' as const, to: r.origTc, sub: '循環線' }]
    : (['O', 'I'] as const)
        .filter((d) => dirs.includes(d))
        .map((d) => ({ d, to: d === 'O' ? r.destTc : r.origTc, sub: dirs.length === 1 ? `由 ${d === 'O' ? r.origTc : r.destTc}` : null }));
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: radius.m, overflow: 'hidden', ...shadow }}>
      <Pressable onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: r.route } })} accessibilityRole="link" style={{ width: 108, paddingVertical: 12, paddingLeft: 16, justifyContent: 'center', gap: 4 }} accessibilityLabel={`${r.route} 路線`}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, letterSpacing: -0.3, ...tabular }}>{r.route}</Text>
          <CompanyTag companies={r.companies ?? ['CTB']} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {/* 唔用 Link asChild：web 版唔會將 Pressable 嘅 style 傳落 <a>，排版會亂 */}
        {options.map((o, i) => (
            <Pressable
              key={o.d}
              onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: r.route, dir: o.d } })}
              accessibilityRole="link"
              accessibilityLabel={`${r.route} 往 ${o.to}`}
              style={{ flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 4, paddingRight: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600', fontSize: 16 }}>
                  {!loop && <Text style={{ color: t.muted, fontWeight: '500', fontSize: 13 }}>往 </Text>}
                  {o.to}
                </Text>
                {o.sub && (
                  <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>
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
