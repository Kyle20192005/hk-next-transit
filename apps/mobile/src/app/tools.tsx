import { router } from 'expo-router';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_TOOLS, TOOLS, TOOL_GROUPS, toolById, dragShift, moveTool, toggleTool, type ToolId } from '@hknt/core';
import { ToolSlot, ToolTile } from '@/components/ToolTile';
import { AppBar, BarButton } from '@/components/ui';
import { saveTools, useTools } from '@/lib/news';
import { radius, useTheme } from '@/lib/theme';

/**
 * 自訂常用工具（參考港鐵 App，同網頁 components/home/ToolEditor.tsx 一樣）：頂部黃色區係揀咗嘅（紅色「−」移除；手指拖住左右移排位置），
 * 下面按分類列出全部工具（藍色「+」加入，已揀嘅變淡），撳「儲存」先生效。
 */
export default function ToolsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const saved = useTools();
  const [draft, setDraft] = useState<ToolId[] | null>(null);
  const tools = draft ?? saved;
  const full = tools.length >= MAX_TOOLS;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <BarButton icon="back" label="返回" onPress={back} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>自訂常用工具</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', lineHeight: 22, color: t.onBrand, opacity: 0.85 }}>
          撳「+」或「−」加入或者移除（最多 {MAX_TOOLS} 個）；拖住已揀嘅工具左右移排位置
        </Text>
        <DragRow tools={tools} onChange={setDraft} />
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

const GAP = 10;

/** 頂部揀咗嘅工具：手指拖住左右移排位置（同網頁一樣：拖緊嗰個跟住手指，其他即時讓位，放手先改次序） */
function DragRow({ tools, onChange }: { tools: ToolId[]; onChange: (t: ToolId[]) => void }) {
  const [rowW, setRowW] = useState(0);
  const step = (rowW - GAP * (MAX_TOOLS - 1)) / MAX_TOOLS + GAP;
  const [drag, setDrag] = useState<{ id: ToolId; from: number; dx: number } | null>(null);
  const to = drag ? Math.max(0, Math.min(tools.length - 1, drag.from + Math.round(drag.dx / step))) : 0;
  // 手勢 callback 用嘅最新值（PanResponder 每格只建一次）
  const live = useRef<Live>({ tools, step, to, onChange, setDrag });
  useLayoutEffect(() => {
    live.current = { tools, step, to, onChange, setDrag };
  }, [tools, step, to, onChange]);

  return (
    <View onLayout={(e) => setRowW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: GAP, paddingTop: 8 }}>
      {Array.from({ length: MAX_TOOLS }, (_, i) => {
        const id = tools[i];
        if (!id) return <ToolSlot key={`empty-${i}`} />;
        const me = drag?.id === id;
        const dx = !drag ? 0 : me ? drag.dx : dragShift(i, drag.from, to) * step;
        return (
          <DragTile key={id} id={id} index={i} live={live} dx={dx} lifted={me} dragging={!!drag} onRemove={tools.length > 1 ? () => onChange(toggleTool(tools, id)) : undefined} />
        );
      })}
    </View>
  );
}

type Live = {
  tools: ToolId[];
  step: number;
  to: number;
  onChange: (t: ToolId[]) => void;
  setDrag: (d: { id: ToolId; from: number; dx: number } | null) => void;
};

function DragTile({ id, index, live, dx, lifted, dragging, onRemove }: { id: ToolId; index: number; live: RefObject<Live>; dx: number; lifted: boolean; dragging: boolean; onRemove?: () => void }) {
  const [responder] = useState(() => {
    const end = () => {
      const { tools, to, onChange, setDrag } = live.current;
      onChange(moveTool(tools, tools.indexOf(id), to));
      setDrag(null);
    };
    return PanResponder.create({
      // 橫向移動先算拖（輕撳唔會觸發）；開始之後唔放俾其他手勢
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => live.current.setDrag({ id, from: live.current.tools.indexOf(id), dx: 0 }),
      onPanResponderMove: (_, g) => {
        const { tools, step, setDrag } = live.current;
        const from = tools.indexOf(id);
        setDrag({ id, from, dx: Math.max(-from * step - 12, Math.min((tools.length - 1 - from) * step + 12, g.dx)) });
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  });
  return (
    <View
      {...responder.panHandlers}
      style={{
        flex: 1,
        borderRadius: 18,
        zIndex: lifted ? 2 : 0,
        transform: [{ translateX: dx }, { scale: lifted ? 1.06 : 1 }],
        ...(lifted ? { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 } : {}),
      }}
    >
      <ToolTile id={id} label={`${toolById(id).label}，第 ${index + 1} 個（拖住左右移位置）`} mark={dragging ? undefined : 'remove'} onMark={onRemove} />
    </View>
  );
}
