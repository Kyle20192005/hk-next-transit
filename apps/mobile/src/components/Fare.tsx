import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { AEL_ONLY_STATIONS, fareMoney, lrtStopName, mtrStationName, RAIL_FARE_TYPES, type FareEnds, type FareRole } from '@hknt/core';
import { api } from '@/lib/api';
import { radius, shadowLg, tabular, useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { SheetGrab, useRailSheet, type SheetSize } from './RailSheet';

/**
 * 路綫圖車費計算（同網頁 components/rail/Fare.tsx 一樣）：撳站 → 站上面彈出「起點｜終點」揀；
 * 起點、終點喺圖上有紅／藍標記；揀齊就喺面板顯示車費（港鐵、輕鐵分開）。
 */

/** 浮喺站上面嘅元件（站代號；地圖轉做站頂座標） */
export type RailPin = { key: string; sta: string; node: ReactNode; interactive?: boolean };

/** 起點紅、終點藍 */
export const FARE_COLOR: Record<FareRole, string> = { from: '#C0392B', to: '#2E6FBF' };
const LABEL: Record<FareRole, string> = { from: '起點', to: '終點' };
const ICON = { from: 'arrow-ne', to: 'arrow-se' } as const;

/** 細方格圖示（紅底箭咀向右上 = 起點、藍底向右下 = 終點） */
export function FareIcon({ role, size = 22 }: { role: FareRole; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: FARE_COLOR[role] }}>
      <Icon name={ICON[role]} size={Math.round(size * 0.78)} color="#ffffff" />
    </View>
  );
}

/** 撳站之後喺站上面彈出：揀做起點定終點（深色底，下面有尖角指住個站） */
export function FarePopover({ onPick }: { onPick: (role: FareRole) => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View accessibilityRole="menu" style={{ flexDirection: 'row', alignItems: 'center', padding: 6, borderRadius: 14, backgroundColor: 'rgba(28,28,30,0.94)', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
        {(['from', 'to'] as const).map((r, i) => (
          <View key={r} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {i > 0 && <View style={{ width: 1, height: 30, marginHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />}
            <Pressable onPress={() => onPick(r)} accessibilityRole="menuitem" accessibilityLabel={LABEL[r]} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: 10, backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'transparent' })}>
              <FareIcon role={r} size={26} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#ffffff' }}>{LABEL[r]}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {/* 尖角 */}
      <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(28,28,30,0.94)' }} />
    </View>
  );
}

/** 圖上起點／終點標記（喺站上面） */
export function FarePin({ role }: { role: FareRole }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center' }} accessibilityLabel={LABEL[role]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingLeft: 3, paddingRight: 10, borderRadius: 999, borderWidth: 2, borderColor: FARE_COLOR[role], backgroundColor: t.card }}>
        <FareIcon role={role} size={20} />
        <Text style={{ fontSize: 14, fontWeight: '800', color: FARE_COLOR[role] }}>{LABEL[role]}</Text>
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: FARE_COLOR[role] }} />
    </View>
  );
}

type Table = Record<string, (number | null)[]>;
const cache = new Map<string, Promise<Table>>();
const loadFares = (lrt: boolean, from: string) => {
  const key = `${lrt ? 'lrt' : 'mtr'}:${from}`;
  let p = cache.get(key);
  if (!p) {
    p = api.fare(lrt, from).then((b) => b.fares);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
};

/** 車費面板（手機貼底拉板、闊螢幕右邊，同站面板一樣）：起點 → 終點（可以對調），揀齊就列出八達通、單程票各種車費 */
export function FareSheet({
  lrt,
  ends,
  onSwap,
  onClear,
  onClose,
  style,
  onLayout,
  sheet,
}: {
  lrt: boolean;
  ends: FareEnds;
  onSwap: () => void;
  onClear: () => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  sheet: SheetSize | null;
}) {
  const t = useTheme();
  const { sizeStyle, layout, live } = useRailSheet({ sheet, all: false, onAll: () => {}, onClose, onLayout });
  const [fares, setFares] = useState<{ key: string; f: Table } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = (s: string) => (lrt ? lrtStopName(s) : mtrStationName(s));
  const key = `${lrt ? 'l' : 'm'}:${ends.from}`;
  useEffect(() => {
    if (!ends.from) return;
    let off = false;
    loadFares(lrt, ends.from).then(
      (f) => {
        if (off) return;
        setFares({ key, f });
        setErr(null);
      },
      () => !off && setErr('車費暫時攞唔到'),
    );
    return () => {
      off = true;
    };
  }, [lrt, ends.from, key]);
  const loaded = !!ends.from && fares?.key === key;
  const row = ends.from && ends.to && loaded ? fares!.f[ends.to] : undefined;
  const ael = !lrt && [ends.from, ends.to].some((s) => s && AEL_ONLY_STATIONS.includes(s));
  const noRow = !!(ends.from && ends.to && loaded && !row);
  const note = (text: string) => <Text style={{ fontSize: 13, color: t.muted, lineHeight: 19 }}>{text}</Text>;

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
            <Text style={{ fontSize: 20, fontWeight: '800', color: t.text }}>車費</Text>
            <Text style={{ fontSize: 14, color: t.muted }}>{lrt ? '輕鐵' : '港鐵'} · 撳站揀起點同終點</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="結束車費計算" style={{ width: 32, height: 32, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={18} color={t.muted} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 12, paddingBottom: 12 }}>
          <View style={{ flex: 1, gap: 8 }}>
            {(['from', 'to'] as const).map((r) => (
              <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FareIcon role={r} />
                <Text numberOfLines={1} style={ends[r] ? { fontSize: 16, fontWeight: '800', color: t.text } : { fontSize: 15, fontWeight: '600', color: t.muted }}>
                  {ends[r] ? `${name(ends[r]!)}站` : `撳圖上嘅站揀${LABEL[r]}`}
                </Text>
              </View>
            ))}
          </View>
          <Pressable onPress={onSwap} disabled={!ends.from && !ends.to} accessibilityLabel="起點終點對調" style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, opacity: !ends.from && !ends.to ? 0.4 : 1 }}>
            <Icon name="swap" size={20} color={t.text} />
          </Pressable>
        </View>
      </SheetGrab>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {noRow && note(ael ? '機場快綫車費只計香港、九龍、青衣、機場、博覽館之間，其他站要分開計。' : '冇呢兩個站之間嘅車費資料。')}
        {ends.from && ends.to && !loaded && !err ? note('載入中…') : null}
        {err && <Text style={{ color: t.special }}>{err}</Text>}
        {row && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.m, backgroundColor: t.surface2 }}>
              <Text style={{ fontSize: 15, color: t.muted }}>八達通（成人）</Text>
              <Text style={{ fontSize: 28, fontWeight: '900', color: t.accent, ...tabular }}>{fareMoney(row[0])}</Text>
            </View>
            {(['八達通', '單程票'] as const).map((g) => (
              <View key={g} accessibilityLabel={g}>
                <Text style={{ marginTop: 2, marginBottom: 6, marginLeft: 2, fontSize: 13, fontWeight: '700', color: t.muted }}>{g}</Text>
                <View style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 14, paddingVertical: 2 }}>
                  {RAIL_FARE_TYPES.filter((x) => x.group === g).map((x, i) => (
                    <View key={x.i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{x.zh}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: t.text, ...tabular }}>{fareMoney(row[x.i])}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {ael && note('機場快綫只有成人同小童車費。')}
            {note('車費來自港鐵開放數據，以港鐵公佈為準；未計轉乘優惠同其他折扣。')}
          </>
        )}
      </ScrollView>

      {(ends.from || ends.to) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.line }}>
          <Text style={{ fontSize: 12, color: t.muted }}>{lrt ? '輕鐵' : '港鐵'}車費</Text>
          <Pressable onPress={onClear} accessibilityLabel="清除起點終點" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: t.surface2 }}>
            <Icon name="close" size={16} color={t.text} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.text }}>清除</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}
