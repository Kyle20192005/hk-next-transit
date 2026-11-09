import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LIVE_REFRESH, hkClockSec, mtrLine, mtrStationEn, mtrStationLines, mtrStationName, mtrTrainEta, type MtrDirection, type MtrLineEtas, type MtrTrain, type Prefs } from '@hknt/core';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { radius, shadowLg, tabular, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';

type Data = { sta: string; lines: MtrLineEtas[]; failed: string[]; at: number };
type Fmt = Prefs['etaFormat'];

/**
 * 港鐵站到站時間面板（同網頁 components/rail/MtrStationSheet.tsx 一樣）：唔遮成幅圖（手機浮喺下面、闊螢幕喺右邊），
 * 頂部按綫分頁（分頁頂有綫色）；每個方向先顯示下班車（目的地、月台、正在離開／N 分鐘），
 * 「所有班次」展開成個表（目的地｜月台｜下班車，按方向分組）。30 秒更新一次，底部顯示最後更新時間。
 */
export function MtrStationSheet({
  sta,
  onClose,
  tab,
  onTab,
  all,
  onAll,
  style,
  onLayout,
}: {
  sta: string;
  onClose: () => void;
  tab: string | null;
  onTab: (line: string) => void;
  all: boolean;
  onAll: (all: boolean) => void;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const t = useTheme();
  const { etaFormat } = usePrefs();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const body = await api.mtr(sta);
        if (!cancelled) {
          setData({ ...body, sta, at: Date.now() });
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

  const codes = mtrStationLines(sta);
  // 記住上次揀嘅綫；呢個站冇就揀第一條
  const line = tab && codes.includes(tab) ? tab : codes[0]!;
  const fresh = data?.sta === sta ? data : null;
  const etas = fresh?.lines.find((l) => l.line === line);
  const failed = fresh?.failed.includes(line);
  const info = mtrLine(line)!;
  const empty = sta === 'RAC' ? '暫時冇班次（只喺賽馬日開放）' : '暫時冇班次';
  const hasTrains = !!etas?.dirs.some((d) => d.trains.length);

  return (
    <View onLayout={onLayout} style={[{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadowLg }, style]}>
      {/* 站名 */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14, paddingBottom: 10, paddingLeft: 18, paddingRight: 14 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>{mtrStationName(sta)}</Text>
          <Text style={{ fontSize: 14, color: t.muted }}>{mtrStationEn(sta)}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 36, height: 36, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
          <Icon name="close" size={20} color={t.muted} />
        </Pressable>
      </View>

      {/* 綫分頁：頂部一條綫色 */}
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: t.line }}>
        {codes.map((c) => {
          const l = mtrLine(c)!;
          const on = c === line;
          return (
            <Pressable
              key={c}
              onPress={() => onTab(c)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 8, borderTopWidth: 4, borderTopColor: l.color, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: on ? l.color + '29' : t.surface2 }}
            >
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: on ? t.text : t.muted }}>
                {l.zh}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 14, gap: 10 }}>
        {etas?.delayed && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: radius.s, backgroundColor: t.specialSoft }}>
            <Icon name="warning" size={16} color={t.special} />
            <Text style={{ color: t.special, fontWeight: '700', fontSize: 13 }}>{info.zh}而家有延誤</Text>
          </View>
        )}
        {!fresh && !error && <ActivityIndicator style={{ margin: 12 }} />}
        {!fresh && error && <Note t={t} text={`載入失敗：${error}`} />}
        {fresh && (failed || !etas) && <Note t={t} text={`${info.zh}資料暫時攞唔到，稍後會自動再試`} />}
        {etas?.noData && <Text style={{ color: t.muted }}>港鐵暫時冇提供{info.zh}嘅到站時間，列車可能照常行駛。</Text>}

        {etas && !etas.noData && (
          <>
            {/* 下班車：每個方向一行 */}
            <View style={{ borderRadius: radius.m, backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ marginTop: 6, marginBottom: 2, fontSize: 13, fontWeight: '700', color: t.muted }}>下班車</Text>
              {etas.dirs.map((d, i) => (
                <NextRow key={d.dir} d={d} empty={empty} fmt={etaFormat} t={t} color={info.color} ink={info.ink} first={i === 0} />
              ))}
            </View>

            {etas.dirs.some((d) => d.trains.length > 1) && (
              <Pressable onPress={() => onAll(!all)} accessibilityRole="button" accessibilityState={{ expanded: all }} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 }}>
                <Text style={{ color: t.accent, fontWeight: '700', fontSize: 14 }}>{all ? '收埋班次表' : '所有班次'}</Text>
                <View style={{ transform: [{ rotate: all ? '180deg' : '0deg' }] }}>
                  <Icon name="chevron-down" size={18} color={t.accent} />
                </View>
              </Pressable>
            )}

            {/* 所有班次表 */}
            {all && hasTrains && (
              <View>
                <View style={{ flexDirection: 'row', paddingHorizontal: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: t.line }}>
                  <Text style={[th(t), { flex: 1 }]}>目的地</Text>
                  <Text style={[th(t), { width: 56, textAlign: 'center' }]}>月台</Text>
                  <Text style={[th(t), { width: 96, textAlign: 'right' }]}>下班車</Text>
                </View>
                {etas.dirs
                  .filter((d) => d.trains.length)
                  .map((d) => (
                    <View key={d.dir}>
                      <Text style={{ paddingTop: 12, paddingBottom: 4, paddingHorizontal: 6, fontSize: 13, fontWeight: '800', color: t.text }}>{d.label}</Text>
                      {d.trains.map((x, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 7, borderBottomWidth: i === d.trains.length - 1 ? 0 : 1, borderBottomColor: t.line }}>
                          <Text style={{ flex: 1, fontSize: 15, color: t.text }}>
                            {x.destName}
                            {x.viaRacecourse ? <Text style={{ color: t.muted, fontSize: 13 }}>（經馬場）</Text> : null}
                          </Text>
                          <View style={{ width: 56, alignItems: 'center' }}>
                            <Plat n={x.plat} color={info.color} ink={info.ink} />
                          </View>
                          <View style={{ width: 96, alignItems: 'flex-end' }}>
                            <EtaText x={x} fmt={etaFormat} t={t} size={16} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.line }}>
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
    </View>
  );
}

const th = (t: Theme) => ({ fontSize: 12, fontWeight: '700' as const, color: t.muted });

function Note({ t, text }: { t: Theme; text: string }) {
  return (
    <View style={{ padding: 10, borderRadius: radius.s, backgroundColor: t.specialSoft }}>
      <Text style={{ color: t.special, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

/** 下班車一行：目的地、月台圈、時間（後面一班細字） */
function NextRow({ d, empty, fmt, t, color, ink, first: isFirst }: { d: MtrDirection; empty: string; fmt: Fmt; t: Theme; color: string; ink: string; first: boolean }) {
  const [first, second] = d.trains;
  const after = second && mtrTrainEta(second, fmt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderTopWidth: isFirst ? 0 : 1, borderTopColor: t.line }}>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.text }}>
        {first ? `往 ${first.destName}` : d.label}
        {first?.viaRacecourse ? <Text style={{ color: t.muted, fontSize: 13, fontWeight: '400' }}>（經馬場）</Text> : null}
      </Text>
      {first ? (
        <>
          <Plat n={first.plat} color={color} ink={ink} />
          <View style={{ minWidth: 84, alignItems: 'flex-end' }}>
            <EtaText x={first} fmt={fmt} t={t} size={20} />
            {after ? (
              <Text style={{ fontSize: 12, color: t.muted, ...tabular }}>
                之後 {after.main}
                {after.unit ? ` ${after.unit}` : ''}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <Text style={{ fontSize: 14, color: t.muted }}>{empty}</Text>
      )}
    </View>
  );
}

function EtaText({ x, fmt, t, size }: { x: MtrTrain; fmt: Fmt; t: Theme; size: number }) {
  const e = mtrTrainEta(x, fmt);
  return (
    <Text style={{ color: t.accent, ...tabular }}>
      <Text style={{ fontSize: e.now ? size - 4 : size, fontWeight: '800' }}>{e.main}</Text>
      {e.unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted }}> {e.unit}</Text> : null}
    </Text>
  );
}

/** 月台：綫色圓圈入面一個數字 */
function Plat({ n, color, ink }: { n: string; color: string; ink: string }) {
  if (!n) return <View style={{ width: 26 }} />;
  return (
    <View accessibilityLabel={`${n} 號月台`} style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: ink }}>{n}</Text>
    </View>
  );
}
