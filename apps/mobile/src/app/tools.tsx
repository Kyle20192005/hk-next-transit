import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_TOOLS, TOOLS, TOOL_GROUPS, swapTools, toggleTool, type ToolId } from '@hknt/core';
import { ToolSlot, ToolTile } from '@/components/ToolTile';
import { AppBar, BarButton } from '@/components/ui';
import { saveTools, useTools } from '@/lib/news';
import { radius, useTheme } from '@/lib/theme';

/**
 * 自訂常用工具（參考港鐵 App，同網頁 components/home/ToolEditor.tsx 一樣）：頂部黃色區係揀咗嘅（紅色「−」移除；撳兩個對調位置），
 * 下面按分類列出全部工具（藍色「+」加入，已揀嘅變淡），撳「儲存」先生效。
 */
export default function ToolsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const saved = useTools();
  const [draft, setDraft] = useState<ToolId[] | null>(null);
  const tools = draft ?? saved;
  const [lifted, setLifted] = useState<ToolId | null>(null);
  const full = tools.length >= MAX_TOOLS;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const tap = (id: ToolId) => {
    if (!lifted) return setLifted(id);
    setDraft(swapTools(tools, lifted, id));
    setLifted(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <BarButton icon="back" label="返回" onPress={back} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>自訂常用工具</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', lineHeight: 22, color: t.onBrand, opacity: 0.85 }}>
          撳「+」或「−」加入或者移除（最多 {MAX_TOOLS} 個）；撳兩個已揀嘅工具對調位置
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
          {Array.from({ length: MAX_TOOLS }, (_, i) => {
            const id = tools[i];
            if (!id) return <ToolSlot key={`empty-${i}`} />;
            return (
              <ToolTile
                key={id}
                id={id}
                lifted={lifted === id}
                onPress={() => tap(id)}
                mark="remove"
                onMark={tools.length > 1 ? () => (setDraft(toggleTool(tools, id)), setLifted(null)) : undefined}
              />
            );
          })}
        </View>
      </AppBar>

      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 18, gap: 22 }}>
        {TOOL_GROUPS.map((g) => {
          const items = TOOLS.filter((x) => x.group === g.id);
          const rows = Array.from({ length: Math.ceil(items.length / MAX_TOOLS) }, (_, r) => items.slice(r * MAX_TOOLS, r * MAX_TOOLS + MAX_TOOLS));
          return (
            <View key={g.id} style={{ gap: 12 }}>
              <Text style={{ paddingHorizontal: 4, fontSize: 17, fontWeight: '800', color: t.text }}>{g.label}</Text>
              {rows.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                  {row.map((x) => {
                    const on = tools.includes(x.id);
                    const off = on || full;
                    return <ToolTile key={x.id} id={x.id} dim={on} disabled={off} mark={off ? 'add-off' : 'add'} onPress={() => setDraft(toggleTool(tools, x.id))} onMark={off ? undefined : () => setDraft(toggleTool(tools, x.id))} label={on ? `${x.label}（已揀）` : `加入${x.label}`} />;
                  })}
                  {Array.from({ length: MAX_TOOLS - row.length }, (_, i) => (
                    <View key={`pad-${i}`} style={{ flex: 1 }} />
                  ))}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.card }}>
        <Pressable
          onPress={() => {
            saveTools(tools);
            back();
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 14, borderRadius: radius.m, backgroundColor: t.brand, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ fontSize: 17, fontWeight: '800', color: t.onBrand }}>儲存</Text>
        </Pressable>
      </View>
    </View>
  );
}
