import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { NewsFilter, NewsItem } from '@hknt/core';
import { radius, shadow, useTheme } from '@/lib/theme';
import { Icon } from './Icon';

const BLUE = '#2F6FD6';

/** 消息分類掣：全部／附近（有位置先有）／港鐵（同網頁 News.tsx 一樣） */
export function NewsChips({ value, onChange, hasPos }: { value: NewsFilter; onChange: (f: NewsFilter) => void; hasPos: boolean }) {
  const t = useTheme();
  const opts: { id: NewsFilter; label: string }[] = [{ id: 'all', label: '全部' }, ...(hasPos ? [{ id: 'nearby' as const, label: '附近' }] : []), { id: 'mtr', label: '港鐵' }];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: on ? BLUE : t.line, backgroundColor: on ? 'rgba(47,111,214,0.1)' : t.card }}>
            {o.id === 'nearby' && <Icon name="navigate" size={16} color={on ? BLUE : t.text} />}
            <Text style={{ fontSize: 15, fontWeight: '700', color: on ? BLUE : t.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Tag({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, backgroundColor: bg }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: fg }}>{label}</Text>
    </View>
  );
}

/** 消息列表：撳一條展開全文 */
export function NewsList({ items, empty }: { items: NewsItem[]; empty: string }) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length)
    return (
      <View style={{ padding: 16, borderRadius: radius.l, backgroundColor: t.card, ...shadow }}>
        <Text style={{ color: t.muted }}>{empty}</Text>
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      {items.map((n) => (
        <Pressable key={n.id} onPress={() => setOpen((o) => (o === n.id ? null : n.id))} accessibilityState={{ expanded: open === n.id }} style={{ padding: 14, gap: 6, borderRadius: radius.l, backgroundColor: t.card, opacity: n.closed ? 0.6 : 1, ...shadow }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {n.closed ? <Tag label="已完結" fg={t.muted} bg={t.surface2} /> : <Tag label="進行中" fg="#D7282F" bg="rgba(229,72,77,0.12)" />}
            {n.nearby && <Tag label="附近" fg={BLUE} bg="rgba(47,111,214,0.12)" />}
            {n.mtr && <Tag label="港鐵" fg="#B3202A" bg="rgba(215,40,47,0.1)" />}
            {n.bus && <Tag label="巴士" fg={t.accent} bg={t.brandSoft} />}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', lineHeight: 22, color: t.text }}>{n.title}</Text>
          {open === n.id && <Text style={{ fontSize: 14, lineHeight: 22, color: t.muted }}>{n.text}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
