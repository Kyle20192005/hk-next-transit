import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { radius, shadow, shadowLg, useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Pill } from './ui';

export interface VariantItem {
  id: string;
  label: string;
  special: boolean;
  running: boolean;
  /** 冇時間表資料：狀態用灰色 */
  unknown: boolean;
  status: string;
  statusShort: string;
  window: string | null;
}

/** 走法選擇：平時只顯示揀咗嘅一行，撳先展開（蓋住地圖，唔推郁版面） */
export function VariantPicker({ items, selectedId, onSelect }: { items: VariantItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, items.findIndex((x) => x.id === selectedId));
  const selected = items[selectedIndex];
  if (!selected) return null;

  return (
    <View style={{ zIndex: 20 }}>
      <Pressable
        onPress={() => items.length > 1 && setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`走法：${selected.label}，${selected.status}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 14, paddingRight: 12, borderRadius: radius.m, backgroundColor: t.card, ...shadow }}
      >
        <No item={selected} n={selectedIndex + 1} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
          <Text numberOfLines={1} style={{ flexShrink: 0, maxWidth: '60%', fontWeight: '700', fontSize: 16, color: selected.special ? t.special : t.text }}>
            {selected.label}
          </Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: statusColor(t, selected) }}>
            {selected.statusShort}
          </Text>
        </View>
        {items.length > 1 && (
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="chevron-down" size={20} color={t.muted} />
          </View>
        )}
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, maxHeight: 360, borderRadius: radius.l, backgroundColor: t.card, overflow: 'hidden', ...shadowLg }}>
          <ScrollView>
            {items.map((x, i) => {
              const active = x.id === selected.id;
              return (
                <Pressable
                  key={x.id}
                  onPress={() => {
                    setOpen(false);
                    onSelect(x.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{ flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: active ? t.brandSoft : t.card }}
                >
                  <No item={x} n={i + 1} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {x.special && <Pill label="特別班" special />}
                      <Text style={{ fontWeight: '700', color: t.text }}>{x.label}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: statusColor(t, x) }}>{x.status}</Text>
                    {x.window && <Text style={{ fontSize: 13, color: t.muted }}>{x.window}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const statusColor = (t: ReturnType<typeof useTheme>, x: VariantItem) => (x.running ? t.ok : x.unknown ? t.muted : t.idle);

function No({ item, n }: { item: VariantItem; n: number }) {
  const t = useTheme();
  return (
    <View style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: item.running ? t.okSoft : t.specialSoft }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: item.running ? t.ok : t.idle }}>{n}</Text>
    </View>
  );
}
