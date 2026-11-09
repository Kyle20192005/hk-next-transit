import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIVE_REFRESH, mtrLine, mtrStationEn, mtrStationLines, mtrStationName, type MtrLineEtas } from '@hknt/core';
import { api } from '@/lib/api';
import { radius, shadowLg, useTheme } from '@/lib/theme';
import { EtaInline } from './EtaInline';
import { Icon } from './Icon';

/**
 * 港鐵站到站時間（撳路綫圖個站彈出；同網頁 components/rail/MtrStationSheet.tsx 一樣嘅內容）：
 * 每條綫兩個方向，每班車分鐘同月台；同一方向去唔同地方（例如東鐵羅湖／落馬洲）就逐班列。30 秒更新一次。
 */
export function MtrStationSheet({ sta, onClose }: { sta: string; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ sta: string; lines: MtrLineEtas[]; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.mtr(sta);
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const id = setInterval(tick, LIVE_REFRESH.etaMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sta]);

  const lines = data?.sta === sta ? data.lines : null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} accessibilityLabel="關閉" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingBottom: insets.bottom, ...shadowLg }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.line, marginTop: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 10, paddingBottom: 12, paddingLeft: 20, paddingRight: 16 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text }}>{mtrStationName(sta)}</Text>
            <Text style={{ fontSize: 13, color: t.muted }}>{mtrStationEn(sta)}</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
            {mtrStationLines(sta).map((c) => {
              const l = mtrLine(c)!;
              return (
                <View key={c} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: l.color }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: l.ink }}>{l.zh}</Text>
                </View>
              );
            })}
          </View>
          <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 36, height: 36, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={20} color={t.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {error && <Text style={{ color: t.special }}>載入失敗：{error}</Text>}
          {!lines && !error && <ActivityIndicator style={{ margin: 16 }} />}
          {lines?.map((l) => {
            const info = mtrLine(l.line)!;
            return (
              <View key={l.line} style={{ padding: 14, borderRadius: radius.m, backgroundColor: t.surface2, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 5, height: 18, borderRadius: 3, backgroundColor: info.color }} />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{info.zh}</Text>
                  {l.delayed && (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: t.specialSoft }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: t.special }}>延誤</Text>
                    </View>
                  )}
                </View>
                {l.dirs.map((d) => {
                  const plats = [...new Set(d.trains.map((x) => x.plat))];
                  const dests = [...new Set(d.trains.map((x) => x.dest))];
                  return (
                    <View key={d.dir} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: t.text, flexShrink: 1 }}>{d.label}</Text>
                        {plats.length === 1 && <Plat label={plats[0]!} />}
                      </View>
                      {!d.trains.length ? (
                        <Text style={{ color: t.muted }}>{sta === 'RAC' ? '暫時冇班次（只喺賽馬日開放）' : '暫時冇班次'}</Text>
                      ) : dests.length === 1 && plats.length === 1 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <EtaInline ats={d.trains.map((x) => Date.parse(x.time))} now={now} />
                        </View>
                      ) : (
                        // 同一方向去唔同地方：逐班列
                        d.trains.map((x, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Text style={{ minWidth: 56 }}>
                              <EtaInline ats={[Date.parse(x.time)]} now={now} />
                            </Text>
                            <Text style={{ flex: 1, color: t.text }}>
                              往 {x.destName}
                              {x.viaRacecourse ? '（經馬場）' : ''}
                            </Text>
                            {plats.length > 1 && <Plat label={x.plat} />}
                          </View>
                        ))
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {data?.failed.length ? <Text style={{ color: t.special }}>{data.failed.map((c) => mtrLine(c)?.zh ?? c).join('、')}資料暫時攞唔到，稍後會自動再試</Text> : null}
          <Text style={{ fontSize: 12, color: t.muted }}>資料來源：港鐵公司（DATA.GOV.HK）。路綫圖係簡化示意圖。</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Plat({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7, backgroundColor: t.card }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.muted }}>{label} 號月台</Text>
    </View>
  );
}
