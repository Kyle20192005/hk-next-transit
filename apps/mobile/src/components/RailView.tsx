import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDistance, lrtRecent, lrtRoute, lrtRouteName, lrtStopEn, lrtStopName, lrtStopRoutes, mtrCardStations, mtrLine, mtrRecent, mtrStationEn, mtrStationLines, mtrStationName, nearestLrtStops, searchLrtStops, searchMtrStations } from '@hknt/core';
import { Icon } from './Icon';
import { useNearbyStops } from './Nearby';
import { addRecent } from '@/lib/recent';
import { radius, shadow, shadowLg, useTheme } from '@/lib/theme';
import { MtrMap } from './MtrMap';
import { LrtMap } from './LrtMap';
import { MtrStationSheet } from './MtrStationSheet';
import { LrtStationSheet, RouteChip } from './LrtStationSheet';
import type { MapFocus, MapInset } from './SchematicMap';

type Kind = 'mtr' | 'lrt';
type Hit = { sta: string; lrt: boolean };
const KIND_KEY = 'hknt.rail';
const NO_INSET: MapInset = { right: 0, bottom: 0 };
/** 手機面板最高幾多（同網頁 CSS 一樣）：矮螢幕都要放得晒下班車，最少留 120 地圖，最高 380（或者 58%，邊個大用邊個） */
const panelMax = (h: number) => (h ? Math.max(h * 0.58, Math.min(h - 120, 380)) : 380);
/** 拉板全開時頂部留幾多地圖 */
const FULL_GAP = 56;

/**
 * 「路線」分頁 → 港鐵・輕鐵（同網頁 components/rail/RailView.tsx 一樣）：左上角切換港鐵／輕鐵路綫圖（記住上次揀邊個），
 * 路綫圖 + 到站面板 + 搜尋結果（港鐵站、輕鐵站一齊搵）。搜尋欄喺標題列（routes.tsx），呢度出結果（浮喺地圖頂）；
 * 揀咗就清空、收鍵盤、轉去嗰幅圖、飛去嗰個站並打開面板。面板唔遮成幅圖：量佢遮咗幾多（inset）俾地圖。
 */
export function RailView({ query, onPicked, open }: { query: string; onPicked: () => void; open?: { sta: string; n: string; lrt?: boolean } | null }) {
  const t = useTheme();
  const { width: winW } = useWindowDimensions();
  const wide = winW >= 768;
  const [kind, setKindState] = useState<Kind>('mtr');
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [all, setAll] = useState(wide);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [inset, setInset] = useState<MapInset>({ right: 0, bottom: 0 });
  const results = useMemo<Hit[]>(() => [...searchMtrStations(query, 6).map((s) => ({ sta: s, lrt: false })), ...searchLrtStops(query, 6).map((s) => ({ sta: s, lrt: true }))], [query]);

  // 記住上次睇港鐵定輕鐵
  useEffect(() => {
    AsyncStorage.getItem(KIND_KEY)
      .then((v) => v === 'lrt' && setKindState((k) => (k === 'mtr' ? 'lrt' : k)))
      .catch(() => {});
  }, []);
  const [movedNear, setMovedNear] = useState<Kind | null>(null);
  /** 輕鐵：喺圖上標出嘅路線（站面板撳路線號碼；轉圖就取消） */
  const [route, setRoute] = useState<string | null>(null);
  const setKind = (k: Kind) => {
    setKindState(k);
    setRoute(null);
    setSta(null);
    setFocus(null);
    setMovedNear(null);
    AsyncStorage.setItem(KIND_KEY, k).catch(() => {});
  };

  // 附近嘅站（用首頁嗰份定位，有快取）：800 米內嘅都標，冇就標 2 公里內最近一個（同網頁一樣）
  const { state: nearby } = useNearbyStops(true);
  const near = useMemo(() => {
    if (nearby.kind !== 'ok') return [];
    if (kind === 'mtr') return mtrCardStations(nearby.mtr, 800, 3);
    const list = nearestLrtStops(nearby.lat, nearby.lng, 2000, 3);
    const close = list.filter((n) => n.distance <= 800);
    return close.length ? close : list.slice(0, 1);
  }, [nearby, kind]);
  // 第一次知道附近有咩站：唔喺畫面就移過去（唔變大細）；已經揀咗站就唔郁
  if (movedNear !== kind && near[0]) {
    setMovedNear(kind);
    if (!sta) setFocus({ sta: near[0].sta, zoom: false });
  }
  // 由首頁、收藏撳入嚟（?sta=&lrt=）：轉去嗰幅圖，飛去（放大置中）再打開
  const openKey = open ? `${open.lrt ? 'l' : 'm'}${open.sta}:${open.n}` : null;
  const [seenOpen, setSeenOpen] = useState<string | null>(null);
  if (openKey !== seenOpen) {
    setSeenOpen(openKey);
    if (open) {
      setKindState(open.lrt ? 'lrt' : 'mtr');
      setRoute(null);
      setMovedNear(open.lrt ? 'lrt' : 'mtr');
      setSta(open.sta);
      setFocus({ sta: open.sta, zoom: true });
      if (!wide) setAll(false);
    }
  }

  // 手機每次揀新站都由半開開始（方便繼續撳地圖）
  const onStation = useCallback(
    (c: string) => {
      setSta(c);
      setFocus({ sta: c, zoom: false });
      if (!wide) setAll(false);
    },
    [wide],
  );
  /** 轉去某幅圖嘅站（搜尋、面板「轉乘」）：飛去（放大置中）再打開 */
  const jump = (k: Kind, s: string) => {
    setKindState(k);
    setRoute(null);
    setMovedNear(k);
    AsyncStorage.setItem(KIND_KEY, k).catch(() => {});
    setSta(s);
    setFocus({ sta: s, zoom: true });
    if (!wide) setAll(false);
  };
  const pick = (h: Hit) => {
    Keyboard.dismiss();
    onPicked();
    jump(h.lrt ? 'lrt' : 'mtr', h.sta);
  };
  const close = useCallback(() => setSta(null), []);
  // 打開咗嘅港鐵站、輕鐵站記入首頁「最近睇過」
  useEffect(() => {
    if (sta) addRecent(kind === 'lrt' ? lrtRecent(sta) : mtrRecent(sta));
  }, [sta, kind]);

  const onPanelLayout = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout;
    const v = wide ? { right: Math.max(0, box.w - x), bottom: 0 } : { right: 0, bottom: Math.max(0, box.h - y) };
    setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
  };
  const name = (s: string) => (kind === 'lrt' ? lrtStopName(s) : mtrStationName(s));
  const nearIds = near.map((n) => n.sta);
  const sheetSize = wide ? null : { full: Math.max(200, box.h - FULL_GAP), peekMax: panelMax(box.h) };
  const panelStyle = wide ? ({ position: 'absolute', top: 12, right: 12, bottom: 12, width: 380 } as const) : ({ position: 'absolute', left: 0, right: 0, bottom: 0 } as const);

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {kind === 'mtr' ? (
        <MtrMap key="mtr" selected={sta} onStation={onStation} focus={focus} inset={sta ? inset : NO_INSET} near={nearIds} />
      ) : (
        <LrtMap key="lrt" selected={sta} onStation={onStation} focus={focus} inset={sta ? inset : NO_INSET} near={nearIds} route={route} />
      )}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* 港鐵／輕鐵切換：大過其他浮動掣，有圖示，揀咗嘅用黃色（同網頁 .rail-switch 一樣） */}
        <View
          accessibilityRole="tablist"
          style={{ flexDirection: 'row', gap: 2, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, ...shadow, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
        >
          {(['mtr', 'lrt'] as const).map((k) => {
            const on = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => k !== kind && setKind(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingLeft: 12, paddingRight: 16, borderRadius: 999, backgroundColor: on ? t.brand : 'transparent', opacity: on ? 1 : 0.6 }}
              >
                <Icon name={k === 'mtr' ? 'train' : 'lrt'} size={18} color={on ? t.onBrand : t.text} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: on ? t.onBrand : t.text }}>{k === 'mtr' ? '港鐵' : '輕鐵'}</Text>
              </Pressable>
            );
          })}
        </View>
        {kind === 'lrt' && route && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 8, paddingRight: 5, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, ...shadow }}>
            <RouteChip r={route} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>{lrtRouteName(route)}</Text>
            <Pressable onPress={() => setRoute(null)} accessibilityRole="button" accessibilityLabel="唔再標出路線" hitSlop={6} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
              <Icon name="close" size={14} color={t.muted} />
            </Pressable>
          </View>
        )}
        {near[0] && (
          <Pressable
            onPress={() => {
              setSta(near[0]!.sta);
              setFocus({ sta: near[0]!.sta, zoom: true });
            }}
            accessibilityRole="button"
            accessibilityLabel={`附近${kind === 'lrt' ? '輕鐵' : '港鐵'}站：${name(near[0].sta)}，${formatDistance(near[0].distance)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: t.card, ...shadow }}
          >
            <Icon name="navigate" size={16} color="#2f6fd6" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>附近：{name(near[0].sta)}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.muted }}>· {formatDistance(near[0].distance)}</Text>
          </Pressable>
        )}
      </View>
      {sta && kind === 'mtr' && <MtrStationSheet sta={sta} onClose={close} tab={tab} onTab={setTab} all={all} onAll={setAll} onLayout={onPanelLayout} sheet={sheetSize} style={panelStyle} onXfer={(s) => jump('lrt', s)} />}
      {sta && kind === 'lrt' && <LrtStationSheet sta={sta} onClose={close} all={all} onAll={setAll} onLayout={onPanelLayout} sheet={sheetSize} style={panelStyle} onXfer={(s) => jump('mtr', s)} route={route} onRoute={setRoute} />}
      {query.trim() !== '' && (
        <View style={{ position: 'absolute', top: 8, left: 12, right: 12, maxHeight: '70%', borderRadius: radius.m, backgroundColor: t.card, ...shadowLg }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 6 }}>
            {results.map((h, i) => {
              const colors = h.lrt ? lrtStopRoutes(h.sta).map((r) => lrtRoute(r)?.color) : mtrStationLines(h.sta).map((l) => mtrLine(l)?.color);
              return (
                <Pressable
                  key={`${h.lrt ? 'l' : 'm'}${h.sta}`}
                  onPress={() => pick(h)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.s, backgroundColor: pressed || i === 0 ? t.surface2 : 'transparent' })}
                >
                  <View style={{ width: 6, gap: 2, alignSelf: 'stretch', justifyContent: 'center' }}>
                    {colors.slice(0, 4).map((c, k) => (
                      <View key={k} style={{ height: 22 / Math.max(1, Math.min(4, colors.length)), minHeight: 5, borderRadius: 3, backgroundColor: c }} />
                    ))}
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{h.lrt ? lrtStopName(h.sta) : mtrStationName(h.sta)}</Text>
                    <Text style={{ fontSize: 13, color: t.muted }}>{h.lrt ? lrtStopEn(h.sta) : mtrStationEn(h.sta)}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ maxWidth: '40%', fontSize: 12, color: t.muted }}>
                    {h.lrt
                      ? `輕鐵 ${lrtStopRoutes(h.sta).join('・')}`
                      : mtrStationLines(h.sta)
                          .map((l) => mtrLine(l)?.zh)
                          .join('・')}
                  </Text>
                </Pressable>
              );
            })}
            {!results.length && <Text style={{ padding: 12, color: t.muted }}>搵唔到「{query.trim()}」</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
