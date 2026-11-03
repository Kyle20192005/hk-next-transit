import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Badge } from './Badge';

export interface VariantItem {
  id: string;
  label: string;
  special: boolean;
  running: boolean;
  status: string;
  window: string | null;
}

/** 走法選擇：平時只顯示揀咗嘅走法，撳先展開（蓋住地圖，唔推郁版面） */
export function VariantPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: VariantItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, items.findIndex((x) => x.id === selectedId));
  const selected = items[selectedIndex];
  if (!selected) return null;

  return (
    <View style={{ zIndex: 10 }}>
      <Pressable
        onPress={() => items.length > 1 && setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`走法：${selected.label}，${selected.status}`}
        style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card }}
      >
        <Row item={selected} n={selectedIndex + 1} />
        {items.length > 1 && (
          <Text style={{ alignSelf: 'center', paddingRight: 14, color: t.muted, fontSize: 12 }}>{open ? '▲' : '▼'}</Text>
        )}
      </Pressable>
      {open && (
        <View
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
            borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, overflow: 'hidden',
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
          }}
        >
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
                style={{
                  borderTopWidth: i ? 1 : 0, borderColor: t.line,
                  backgroundColor: active ? t.brandSoft : t.card,
                  borderLeftWidth: 4, borderLeftColor: active ? t.brand : 'transparent',
                }}
              >
                <Row item={x} n={i + 1} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Row({ item, n }: { item: VariantItem; n: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 12, padding: 12 }}>
      <View
        style={{
          width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
          backgroundColor: item.running ? t.ok : t.idle,
        }}
      >
        <Text style={{ color: t.bg, fontWeight: '700' }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {item.special && <Badge label="特別班" special />}
          <Text style={{ color: t.text, fontWeight: '700' }}>{item.label}</Text>
        </View>
        <Text style={{ color: item.running ? t.ok : t.idle, fontSize: 13 }}>{item.status}</Text>
        {item.window && <Text style={{ color: t.muted, fontSize: 13 }}>{item.window}</Text>}
      </View>
    </View>
  );
}
