import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LIVE_REFRESH, hkClockSec, lrtCars, lrtRoute, lrtStopEn, lrtStopName, lrtStopRoutes, lrtByRoute, lrtTrainEta, mtrXferOf, type LrtPlatform, type LrtTrain, type Prefs } from '@hknt/core';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { setPref, usePrefs } from '@/lib/prefs';
import { radius, shadowLg, tabular, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';
import { SheetGrab, useRailSheet, type SheetSize } from './RailSheet';
import { XferButton } from './XferButton';

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
  onXfer,
}: {
  sta: string;
  onClose: () => void;
  all: boolean;
  onAll: (all: boolean) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** 手機拉板（null = 闊螢幕右邊面板） */
  sheet: SheetSize | null;
  /** 「轉乘港鐵」：轉去港鐵圖嘅站 */
  onXfer: (mtrSta: string) => void;
}) {
  const t = useTheme();
  const { etaFormat, lrtGroup } = usePrefs();
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
          {mtrXferOf(sta) && <XferButton to="mtr" sta={mtrXferOf(sta)!} onPick={onXfer} />}
          <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={18} color={t.muted} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 16, paddingRight: 12, paddingBottom: 10 }}>
          <View accessibilityLabel="經過路線" style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {lrtStopRoutes(sta).map((r) => (
              <RouteChip key={r} r={r} />
            ))}
          </View>
          {/* 班次按月台定按路線排（記入設定，設定頁都改得；同網頁一樣） */}
          <View accessibilityRole="tablist" accessibilityLabel="班次排法" style={{ flexDirection: 'row', padding: 2, borderRadius: 999, backgroundColor: t.surface2 }}>
            {(
              [
                ['platform', '月台'],
                ['route', '路線'],
              ] as const
            ).map(([v, label]) => {
              const on = lrtGroup === v;
              return (
                <Pressable
                  key={v}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    if (on) return;
                    haptic.pick();
                    setPref('lrtGroup', v);
                  }}
                  style={{ paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: on ? t.card : 'transparent', ...(on ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null) }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.text : t.muted }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SheetGrab>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {!fresh && !error && <ActivityIndicator style={{ margin: 12 }} />}
        {!fresh && error && <Note t={t} text={`載入失敗：${error}`} />}
        {fresh?.failed && <Note t={t} text="輕鐵資料暫時攞唔到，稍後會自動再試" />}
        {fresh && !fresh.failed && !plats.length && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
        {lrtGroup === 'platform' &&
          plats.map((p) => (
            <View key={p.platform} accessibilityLabel={`${p.platform} 號月台`} style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 2 }}>
              <View style={{ minHeight: 30, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.muted }}>{p.platform} 號月台</Text>
              </View>
              {p.trains.map((x, i) => (
                <TrainRow key={i} x={x} fmt={etaFormat} now={fresh?.at ?? 0} t={t} first={i === 0} />
              ))}
            </View>
          ))}
        {/* 按路線：每條路線、每個方向一組，每班車寫幾號月台 */}
        {lrtGroup === 'route' &&
          fresh &&
          lrtByRoute(fresh.platforms).map((g) => (
            <View key={`${g.route}|${g.dest}`} accessibilityLabel={`${g.route} 往 ${g.dest}`} style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 2 }}>
              <View style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RouteChip r={g.route} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', color: t.text }}>
                  往 {g.dest}
                </Text>
              </View>
              {g.trains.map((x, i) => (
                <TrainRow key={i} x={x} fmt={etaFormat} now={fresh.at} t={t} first={i === 0} platform={x.platform} />
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

/** 一班車：按月台 =「[路線] 往 X」；按路線（有 platform）=「N 號月台」 */
function TrainRow({ x, fmt, now, t, first, platform }: { x: LrtTrain; fmt: Fmt; now: number; t: Theme; first: boolean; platform?: string }) {
  const e = lrtTrainEta(x, fmt, now);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderTopWidth: first ? 0 : 1, borderTopColor: t.line }}>
      {platform === undefined && <RouteChip r={x.route} />}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.text }}>
        {platform === undefined ? `往 ${x.dest}` : `${platform} 號月台`}
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
