import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeServiceIds, fmtMinutes, hkParts, serviceDaysLabel, timetablePeriods, variantLabel, type Calendar, type Variant } from '@hknt/core';
import { radius, shadowLg, tabular, useTheme } from '@/lib/theme';
import { Icon } from './Icon';

const time = (m: number) => `${m >= 1440 ? '翌日 ' : ''}${fmtMinutes(m)}`;

/**
 * 詳細班次（同網頁 TimetableDrawer 一樣）：由右邊拉出；按服務日子分頁（預設今日），
 * 時段由時間表還原（每 N 分鐘一班），今日而家嘅時段標「而家」並捲到。
 */
export function TimetableSheet({ visible, onClose, variants, selectedId, calendar }: { visible: boolean; onClose: () => void; variants: Variant[]; selectedId: string | null; calendar: Calendar }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const withTimes = variants.filter((v) => v.schedules.length);
  const [variantId, setVariantId] = useState(selectedId);
  const v = withTimes.find((x) => x.id === variantId) ?? withTimes[0];
  const now = new Date();
  const today = activeServiceIds(calendar, now);
  const nowMinutes = hkParts(now).minutes;

  // 服務日子分頁：同一組日子嘅 serviceId 併埋（計算好平，唔使 memo）
  const groups = new Map<string, { label: string; ids: string[]; today: boolean; order: number }>();
  for (const s of v?.schedules ?? []) {
    const c = calendar[s.serviceId];
    const label = c ? serviceDaysLabel(c.days) : '其他';
    const order = c ? c.days.findIndex(Boolean) : 9;
    const g = groups.get(label) ?? { label, ids: [], today: false, order };
    g.ids.push(s.serviceId);
    g.today ||= today.has(s.serviceId);
    groups.set(label, g);
  }
  const tabs = [...groups.values()].sort((a, b) => a.order - b.order);
  const [tab, setTab] = useState<string | null>(null);
  const current = tabs.find((x) => x.label === tab) ?? tabs.find((x) => x.today) ?? tabs[0];
  const isToday = current?.today ?? false;
  const periods = v && current ? timetablePeriods(v.schedules.filter((s) => current.ids.includes(s.serviceId)).flatMap((s) => s.departures)) : [];
  const nowIndex = isToday
    ? periods.findIndex((p, i) => {
        const next = periods[i + 1];
        return nowMinutes >= p.start && (p.headway ? nowMinutes <= p.end : !next || nowMinutes < next.start);
      })
    : -1;
  const nextIndex = isToday && nowIndex < 0 ? periods.findIndex((p) => p.start > nowMinutes) : -1;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const rowY = useRef<number[]>([]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel="關閉詳細班次">
        <Pressable
          onPress={() => {}}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '88%', maxWidth: 380, backgroundColor: t.card, borderTopLeftRadius: radius.l, borderBottomLeftRadius: radius.l, paddingTop: insets.top, paddingBottom: insets.bottom, ...shadowLg }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 12, paddingLeft: 20, paddingRight: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>詳細班次</Text>
            <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 36, height: 36, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
              <Icon name="close" size={20} color={t.muted} />
            </Pressable>
          </View>
          {withTimes.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
              {withTimes.map((x) => (
                <Chip key={x.id} label={`${x.special ? '特別班：' : ''}${variantLabel(x)}`} on={x.id === v?.id} onPress={() => { setVariantId(x.id); setTab(null); }} />
              ))}
            </ScrollView>
          )}
          {tabs.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 12, paddingHorizontal: 16 }}>
                {tabs.map((x) => (
                  <Chip key={x.label} label={x.label} sub={x.today ? '今日' : undefined} on={x.label === current?.label} onPress={() => setTab(x.label)} />
                ))}
              </View>
              <Text style={{ marginTop: 12, marginBottom: 4, marginHorizontal: 20, fontSize: 12, color: t.muted }}>由總站開出時間</Text>
              <ScrollView
                ref={scroll}
                onContentSizeChange={() => {
                  const k = nowIndex >= 0 ? nowIndex : nextIndex;
                  const y = rowY.current[k];
                  if (k >= 0 && y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
                }}
              >
                {periods.map((p, i) => {
                  const hl = i === nowIndex || i === nextIndex;
                  return (
                    <View
                      key={`${p.start}-${i}`}
                      onLayout={(e) => (rowY.current[i] = e.nativeEvent.layout.y)}
                      style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 11, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: hl ? t.brandSoft : 'transparent', borderLeftWidth: hl ? 4 : 0, borderLeftColor: t.brand }}
                    >
                      <Text style={{ flex: 1, fontWeight: '600', color: t.text, ...tabular }}>
                        {time(p.start)}
                        {p.headway !== null ? ` – ${time(p.end)}` : ''}
                      </Text>
                      {p.headway !== null && <Text style={{ fontSize: 14, color: hl ? t.text : t.muted }}>每 {p.headway} 分鐘</Text>}
                      {(i === nowIndex || i === nextIndex) && (
                        <Text style={{ fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, overflow: 'hidden', backgroundColor: t.brand, color: t.onBrand }}>
                          {i === nowIndex ? '而家' : '下一班'}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <Text style={{ margin: 20, color: t.muted }}>呢個走法冇時間表資料</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? t.brand : t.surface2 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.onBrand : t.text }}>{label}</Text>
      {sub && <Text style={{ fontSize: 10, fontWeight: '700', color: on ? t.onBrand : t.muted }}>{sub}</Text>}
    </Pressable>
  );
}
