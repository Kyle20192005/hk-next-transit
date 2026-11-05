import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMPANIES, type Company } from '@hknt/core';
import { radius, shadow, useTheme } from '@/lib/theme';
import { BusGlyph, Icon, type IconName } from './Icon';

/** 公司標籤：巴士圖示 + 公司名，用公司代表色；聯營線合併做一個分色標籤 */
export function CompanyTag({ companies, compact = false }: { companies: readonly Company[]; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 6, overflow: 'hidden' }}>
      {companies.map((c, i) => {
        const info = COMPANIES[c];
        return (
          <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: info.bg }}>
            {i === 0 && !compact && <BusGlyph size={11} color={info.ink} />}
            <Text style={{ color: info.ink, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>{info.name}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** 黃色標題列（首頁分頁、路線頁），底部圓角，頂部讓出狀態列 */
export function AppBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          backgroundColor: t.brand,
          paddingTop: insets.top + 10,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomLeftRadius: radius.bar,
          borderBottomRightRadius: radius.bar,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** 標題列上嘅圖示掣（40×40） */
export function BarButton({ icon, onPress, label, on = false }: { icon: IconName; onPress: () => void; label: string; on?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? t.onBrand : t.onBrandSoft,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Icon name={icon} color={on ? t.brand : t.onBrand} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.m, ...shadow }, style]}>{children}</View>;
}

/** 空狀態：圓形圖示 + 說明 + 主要按鈕 */
export function EmptyState({ icon, children, action }: { icon: IconName; children: ReactNode; action?: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean } }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: t.brandSoft, marginBottom: 4 }}>
        <Icon name={icon} size={32} color={t.accent} />
      </View>
      {children}
      {action && <PrimaryButton {...action} />}
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderRadius: radius.m,
        backgroundColor: t.brand,
        opacity: disabled ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {icon && <Icon name={icon} size={20} color={t.onBrand} />}
      <Text style={{ color: t.onBrand, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

/** 「原定」：時間表時間，唔係實時 */
export function ScheduledTag() {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: t.surface2, color: t.muted }}>
      原定
    </Text>
  );
}

export function Pill({ label, special = false }: { label: string; special?: boolean }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 8,
        paddingVertical: 1,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: special ? t.specialSoft : t.brandSoft,
        color: special ? t.special : t.accent,
      }}
    >
      {label}
    </Text>
  );
}
