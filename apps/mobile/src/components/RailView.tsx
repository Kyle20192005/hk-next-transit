import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { mtrLine, mtrStationEn, mtrStationLines, mtrStationName, searchMtrStations } from '@hknt/core';
import { radius, shadowLg, useTheme } from '@/lib/theme';
import { MtrMap, type MtrFocus, type MtrInset } from './MtrMap';
import { MtrStationSheet } from './MtrStationSheet';

const NO_INSET: MtrInset = { right: 0, bottom: 0 };
/** 手機面板最高幾多（同網頁 CSS 一樣）：矮螢幕都要放得晒下班車，最少留 120 地圖，最高 380（或者 58%，邊個大用邊個） */
const panelMax = (h: number) => (h ? Math.max(h * 0.58, Math.min(h - 120, 380)) : 380);
/** 拉板全開時頂部留幾多地圖 */
const FULL_GAP = 56;

/**
 * 「路線」分頁 → 港鐵（同網頁 components/rail/RailView.tsx 一樣）：路綫圖 + 到站面板 + 搜尋結果。
 * 搜尋欄喺標題列（routes.tsx），呢度出結果（浮喺地圖頂）；揀咗就清空、收鍵盤、飛去嗰個站並打開面板。
 * 面板唔遮成幅圖：量佢遮咗幾多（inset）俾地圖。
 */
export function RailView({ query, onPicked, open }: { query: string; onPicked: () => void; open?: { sta: string; n: string } | null }) {
  const t = useTheme();
  const { width: winW } = useWindowDimensions();
  const wide = winW >= 768;
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MtrFocus | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [all, setAll] = useState(wide);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [inset, setInset] = useState<MtrInset>({ right: 0, bottom: 0 });
  const results = useMemo(() => searchMtrStations(query), [query]);
  // 由首頁、收藏撳入嚟（?sta=）：飛去（放大置中）再打開
  const openKey = open ? `${open.sta}:${open.n}` : null;
  const [seenOpen, setSeenOpen] = useState<string | null>(null);
  if (openKey !== seenOpen) {
    setSeenOpen(openKey);
    if (open) {
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
  const pick = (c: string) => {
    Keyboard.dismiss();
    onPicked();
    setSta(c);
    setFocus({ sta: c, zoom: true });
    if (!wide) setAll(false);
  };
  const close = useCallback(() => setSta(null), []);

  const onPanelLayout = (e: LayoutChangeEvent) => {
    const { x, y } = e.nativeEvent.layout;
    const v = wide ? { right: Math.max(0, box.w - x), bottom: 0 } : { right: 0, bottom: Math.max(0, box.h - y) };
    setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <MtrMap selected={sta} onStation={onStation} focus={focus} inset={sta ? inset : NO_INSET} />
      {sta && (
        <MtrStationSheet
          sta={sta}
          onClose={close}
          tab={tab}
          onTab={setTab}
          all={all}
          onAll={setAll}
          onLayout={onPanelLayout}
          sheet={wide ? null : { full: Math.max(200, box.h - FULL_GAP), peekMax: panelMax(box.h) }}
          style={wide ? { position: 'absolute', top: 12, right: 12, bottom: 12, width: 380 } : { position: 'absolute', left: 0, right: 0, bottom: 0 }}
        />
      )}
      {query.trim() !== '' && (
        <View style={{ position: 'absolute', top: 8, left: 12, right: 12, maxHeight: '70%', borderRadius: radius.m, backgroundColor: t.card, ...shadowLg }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 6 }}>
            {results.map((c, i) => (
              <Pressable
                key={c}
                onPress={() => pick(c)}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.s, backgroundColor: pressed || i === 0 ? t.surface2 : 'transparent' })}
              >
                <View style={{ width: 6, gap: 2, alignSelf: 'stretch', justifyContent: 'center' }}>
                  {mtrStationLines(c).map((l) => (
                    <View key={l} style={{ height: 22 / Math.max(1, mtrStationLines(c).length), minHeight: 6, borderRadius: 3, backgroundColor: mtrLine(l)?.color }} />
                  ))}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: t.text }}>{mtrStationName(c)}</Text>
                  <Text style={{ fontSize: 13, color: t.muted }}>{mtrStationEn(c)}</Text>
                </View>
                <Text numberOfLines={1} style={{ maxWidth: '40%', fontSize: 12, color: t.muted }}>
                  {mtrStationLines(c)
                    .map((l) => mtrLine(l)?.zh)
                    .join('・')}
                </Text>
              </Pressable>
            ))}
            {!results.length && <Text style={{ padding: 12, color: t.muted }}>搵唔到「{query.trim()}」</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
