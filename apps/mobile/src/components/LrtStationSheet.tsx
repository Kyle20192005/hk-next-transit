import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LIVE_REFRESH, hkClockSec, lrtCars, lrtRoute, lrtStopEn, lrtStopName, lrtStopRoutes, lrtTrainEta, type LrtPlatform, type LrtTrain, type Prefs } from '@hknt/core';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { radius, shadowLg, tabular, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';
import { SheetGrab, useRailSheet, type SheetSize } from './RailSheet';

type Data = { sta: string; platforms: LrtPlatform[]; failed: boolean; at: number };
type Fmt = Prefs['etaFormat'];

/**
 * 輕鐵站面板（同網頁 components/rail/LrtStationSheet.tsx 一樣）：每個月台嘅班次（路線號碼、往邊、單／孖卡、幾分鐘），30 秒更新。
 * 車費網頁版先隱藏，App 都唔出。手機貼底拉板、闊螢幕右邊面板（同港鐵面板共用 useRailSheet）。
 */
export function LrtStationSheet({
  sta,
  onClose,
  all,
  onAll,
  style,
  onLayout,
  sheet,
}: {
  sta: string;
  onClose: () => void;
  all: boolean;
  onAll: (all: boolean) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** 手機拉板（null = 闊螢幕右邊面板） */
  sheet: SheetSize | null;
}) {
  const t = useTheme();
  const { etaFormat } = usePrefs();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { sizeStyle, layout, live } = useRailSheet({ sheet, all, onAll, onClose, onLayout });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const body = await api.lrt(sta);
        if (!cancelled) {
          setData({ sta, platforms: body.platforms ?? [], failed: !!body.failed, at: Date.now() });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    const id = setInterval(load, LIVE_REFRESH.etaMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // nonce：撳「重新整理」即刻再攞
  }, [sta, nonce]);

  const fresh = data?.sta === sta ? data : null;
  const plats = fresh?.platforms.filter((p) => p.trains.length) ?? [];

  return (
    <Animated.View
      onLayout={layout}
      style={[
        { backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadowLg },
        sheet && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.14 },
        style,
        sizeStyle,
      ]}
    >
      <SheetGrab live={live}>
        {sheet && <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginTop: 7, marginBottom: -3, backgroundColor: t.muted, opacity: 0.45 }} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 8, paddingLeft: 16, paddingRight: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{lrtStopName(sta)}</Text>
            <Text style={{ fontSize: 14, color: t.muted }}>{lrtStopEn(sta)}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={18} color={t.muted} />
          </Pressable>
        </View>
        <View accessibilityLabel="經過路線" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 16, paddingBottom: 10 }}>
          {lrtStopRoutes(sta).map((r) => (
            <RouteChip key={r} r={r} />
          ))}
        </View>
      </SheetGrab>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {!fresh && !error && <ActivityIndicator style={{ margin: 12 }} />}
        {!fresh && error && <Note t={t} text={`載入失敗：${error}`} />}
        {fresh?.failed && <Note t={t} text="輕鐵資料暫時攞唔到，稍後會自動再試" />}
        {fresh && !fresh.failed && !plats.length && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
        {plats.map((p) => (
          <View key={p.platform} accessibilityLabel={`${p.platform} 號月台`} style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 2 }}>
            <View style={{ minHeight: 30, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.muted }}>{p.platform} 號月台</Text>
            </View>
            {p.trains.map((x, i) => (
              <TrainRow key={i} x={x} fmt={etaFormat} now={fresh?.at ?? 0} t={t} first={i === 0} />
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.line }}>
        <Text style={{ fontSize: 12, color: t.muted, ...tabular }}>{fresh ? `最後更新 ${hkClockSec(fresh.at)}` : ' '}</Text>
        <Pressable
          onPress={() => {
            setLoading(true);
            setNonce((n) => n + 1);
          }}
          disabled={loading}
          accessibilityLabel="重新整理"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: t.surface2, opacity: loading ? 0.6 : 1 }}
        >
          <Icon name="refresh" size={16} color={t.text} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.text }}>重新整理</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** 路線號碼（路線色邊、白底），同路綫圖嘅號碼一樣 */
export function RouteChip({ r }: { r: string }) {
  return (
    <View style={{ minWidth: 44, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, borderWidth: 1, borderColor: '#1d1d1f', backgroundColor: lrtRoute(r)?.color ?? '#888' }}>
      <View style={{ position: 'absolute', left: 2, right: 2, top: 2, bottom: 2, borderRadius: 999, backgroundColor: '#ffffff' }} />
      <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '800', color: '#111111' }}>{r}</Text>
    </View>
  );
}

function TrainRow({ x, fmt, now, t, first }: { x: LrtTrain; fmt: Fmt; now: number; t: Theme; first: boolean }) {
  const e = lrtTrainEta(x, fmt, now);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderTopWidth: first ? 0 : 1, borderTopColor: t.line }}>
      <RouteChip r={x.route} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.text }}>
        往 {x.dest}
      </Text>
      <Text style={{ fontSize: 12, color: t.muted }}>{lrtCars(x.cars)}</Text>
      <View style={{ minWidth: 72, alignItems: 'flex-end' }}>
        <Text style={{ color: t.accent, ...tabular }}>
          <Text style={{ fontSize: e.now ? 16 : 20, fontWeight: '800' }}>{e.main}</Text>
          {e.unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted }}> {e.unit}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function Note({ t, text }: { t: Theme; text: string }) {
  return (
    <View style={{ padding: 10, borderRadius: radius.s, backgroundColor: t.specialSoft }}>
      <Text style={{ color: t.special, fontSize: 13 }}>{text}</Text>
    </View>
  );
}
