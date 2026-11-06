import { Pressable, Text, View } from 'react-native';
import { tint, toolById, type ToolId } from '@hknt/core';
import { radius, shadow, useTheme } from '@/lib/theme';
import { Icon } from './Icon';

/** 常用工具方格（首頁同「自訂常用工具」共用，同網頁 .tool-tile 一樣） */
export function ToolTile({
  id,
  onPress,
  badge = 0,
  dim = false,
  lifted = false,
  mark,
  onMark,
  disabled = false,
  label,
}: {
  id: ToolId;
  onPress?: () => void;
  badge?: number;
  dim?: boolean;
  lifted?: boolean;
  /** 右上角：紅色「−」（移除）或藍色「+」（加入） */
  mark?: 'add' | 'remove' | 'add-off';
  onMark?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const t = useTheme();
  const x = toolById(id);
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ?? x.label}
        style={({ pressed }) => ({
          alignItems: 'center',
          gap: 6,
          paddingTop: 12,
          paddingBottom: 10,
          borderRadius: 18,
          backgroundColor: t.card,
          opacity: dim ? 0.45 : 1,
          borderWidth: lifted ? 3 : 0,
          borderColor: t.onBrand,
          margin: lifted ? -3 : 0,
          transform: [{ translateY: lifted ? -3 : 0 }, { scale: pressed && !disabled ? 0.97 : 1 }],
          ...shadow,
        })}
      >
        <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(x.color, 0.12) }}>
          <Icon name={x.icon} size={28} color={x.color} />
          {badge > 0 && (
            <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5484D', borderWidth: 2, borderColor: t.card }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: t.text }}>
          {x.label}
        </Text>
        {x.soon && <Text style={{ marginTop: -4, fontSize: 11, fontWeight: '700', color: t.muted }}>即將推出</Text>}
      </Pressable>
      {mark && (
        <Pressable
          onPress={onMark}
          disabled={!onMark}
          hitSlop={8}
          accessibilityLabel={mark === 'remove' ? `移除${x.label}` : `加入${x.label}`}
          style={{ position: 'absolute', top: -8, right: -6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.card, backgroundColor: mark === 'remove' ? '#E5484D' : mark === 'add' ? '#2F6FD6' : '#9BB6E3' }}
        >
          <Icon name={mark === 'remove' ? 'minus' : 'plus'} size={16} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

/** 空位（揀咗少過 4 個） */
export function ToolSlot() {
  const t = useTheme();
  return <View style={{ flex: 1, minHeight: 96, borderRadius: radius.l, borderWidth: 2, borderStyle: 'dashed', borderColor: t.onBrandSoft }} />;
}
