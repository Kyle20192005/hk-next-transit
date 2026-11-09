import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View, useColorScheme, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { etaParts, hkClock, hkClockSec, LIVE_REFRESH, oppositeTramStation, TRAM_BRAND, TRAM_DIR_ZH, TRAM_JOYYOU_NOTE, tramStation, tramStationName, type TramEta, type TramStopDest } from '@hknt/core';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { usePrefs } from '@/lib/prefs';
import { radius, shadowLg, tabular, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';
import { SheetGrab, useRailSheet, type SheetSize } from './RailSheet';

type Data = { sta: string; realtime: TramEta[] | null; schedule: TramStopDest[]; fare: number | null; at: number };
const DIR_HINT: Record<string, string> = { W: '西行 · 往上環、堅尼地城方向', E: '東行 · 往銅鑼灣、筲箕灣方向', S: '往跑馬地', N: '由跑馬地開出', T: '總站' };

/**
 * 電車站面板（同網頁 components/rail/TramStationSheet.tsx 一樣）：有實時就列每班車，冇就按時間表
 * （每個目的地下幾班、約幾多分鐘一班、頭尾班）；「對面」轉去對面方向最近嘅站。手機貼底拉板、闊螢幕右邊面板。
 */
export function TramStationSheet({
  sta,
  onClose,
  all,
  onAll,
  style,
  onLayout,
  sheet,
  onOpposite,
}: {
  sta: string;
  onClose: () => void;
  all: boolean;
  onAll: (all: boolean) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  sheet: SheetSize | null;
  onOpposite: (sta: string) => void;
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
        const body = await api.tram(sta);
        if (!cancelled) {
          setData({ sta, realtime: body.realtime ?? null, schedule: body.schedule ?? [], fare: body.fare ?? null, at: Date.now() });
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
  }, [sta, nonce]);

  const st = tramStation(sta);
  const fresh = data?.sta === sta ? data : null;
  const now = fresh?.at ?? 0;
  const opp = oppositeTramStation(sta);

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 6, paddingLeft: 16, paddingRight: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>{tramStationName(sta)}</Text>
            <Text style={{ fontSize: 14, color: t.muted }}>{st?.en}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={18} color={t.muted} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, paddingRight: 12, paddingBottom: 10 }}>
          <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="tram" size={16} color={TRAM_BRAND.color} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: t.muted }}>
              {st?.alightOnly ? '只落客' : DIR_HINT[st?.dir ?? 'T']}
            </Text>
          </View>
          {opp && (
            <Pressable
              onPress={() => {
                haptic.tap();
                onOpposite(opp);
              }}
              accessibilityRole="button"
              accessibilityLabel={`轉去對面嘅${tramStationName(opp)}站（${TRAM_DIR_ZH[tramStation(opp)!.dir]}）`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: t.surface2 }}
            >
              <Icon name="swap" size={16} color={t.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.text }}>對面（{TRAM_DIR_ZH[tramStation(opp)!.dir]}）</Text>
            </Pressable>
          )}
        </View>
      </SheetGrab>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {!fresh && !error && <ActivityIndicator style={{ margin: 12 }} />}
        {!fresh && error && <Text style={{ color: t.special }}>載入失敗：{error}</Text>}
        {fresh?.realtime && (
          <View style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 2 }}>
            <View style={{ minHeight: 30, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: t.muted }}>下一班電車</Text>
            </View>
            {fresh.realtime.map((e, i) => {
              const p = etaParts(e.at, now, etaFormat);
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.text }}>
                    往 {e.destZh}
                  </Text>
                  <Text style={{ color: t.accent, ...tabular }}>
                    <Text style={{ fontSize: e.arrived || p.main === '即將' ? 16 : 20, fontWeight: '800' }}>{e.arrived ? '已到站' : p.main}</Text>
                    {!e.arrived && p.unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted }}> {p.unit}</Text> : null}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {fresh && !fresh.realtime && (
          <>
            {!fresh.schedule.length && <Text style={{ color: t.muted }}>{st?.alightOnly ? '呢個站只落客' : '暫時冇時間表資料'}</Text>}
            {fresh.schedule.map((d) => (
              <DestCard key={d.dest} d={d} now={now} fmt={etaFormat} t={t} />
            ))}
            {fresh.schedule.length > 0 && <Text style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>電車公司冇開放實時到站資料，以上按運輸署時間表推算，實際可能早或者遲幾分鐘。</Text>}
          </>
        )}
        {fresh && fresh.fare !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Icon name="ticket" size={16} color={t.muted} />
            <Text style={{ flexShrink: 1, fontSize: 13, color: t.muted }}>
              成人 ${fresh.fare.toFixed(1)}（全程同價，落車付款）· {TRAM_JOYYOU_NOTE}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.line }}>
        <Text style={{ fontSize: 12, color: t.muted, ...tabular }}>{fresh ? `最後更新 ${hkClockSec(fresh.at)}` : ' '}</Text>
        <Pressable
          onPress={() => {
            haptic.tap();
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

/** 一個目的地：下幾班（約）、約幾多分鐘一班、頭尾班（同網頁一樣） */
function DestCard({ d, now, fmt, t }: { d: TramStopDest; now: number; fmt: 'minutes' | 'clock'; t: Theme }) {
  const dark = useColorScheme() === 'dark';
  const times = d.next.map((x) => {
    const m = Math.round((x - now) / 60000);
    return fmt === 'clock' ? hkClock(x) : m <= 0 ? '即將' : `${m} 分`;
  });
  return (
    <View accessibilityLabel={`往${tramStationName(d.dest)}`} style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: '800', color: t.text }}>
          往 {tramStationName(d.dest)}
        </Text>
        {d.headway !== null && (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,122,77,0.14)' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: dark ? '#3ec48a' : TRAM_BRAND.color }}>約每 {d.headway} 分鐘一班</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
        <Text style={{ flex: 1, fontSize: 14, color: t.muted }}>{times.length ? '下幾班（約）' : '今日班次已經完'}</Text>
        {times.length > 0 && <Text style={{ fontSize: 17, fontWeight: '800', color: t.text, ...tabular }}>{times.join(' · ')}</Text>}
      </View>
      {d.first !== null && d.last !== null && (
        <Text style={{ fontSize: 12, color: t.muted }}>
          頭班約 {hkClock(d.first)} · 尾班約 {hkClock(d.last)}
        </Text>
      )}
    </View>
  );
}
