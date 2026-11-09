import { Pressable, Text, View } from 'react-native';
import { LRT_BRAND, lrtStopName, mtrLine, mtrStationName } from '@hknt/core';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

/**
 * 站面板頂「轉乘 [輕鐵] ›」／「轉乘 [屯馬綫] ›」（同網頁 components/rail/XferButton.tsx 一樣，core rail-xfer.ts）：
 * 撳咗轉去另一幅路綫圖、飛去嗰個站並打開。標記同路綫圖上嗰個一樣（港鐵圖：輕鐵金色；輕鐵圖：屯馬綫色）。
 */
export function XferButton({ to, sta, onPick }: { to: 'lrt' | 'mtr'; sta: string; onPick: (sta: string) => void }) {
  const t = useTheme();
  const tml = mtrLine('TML')!;
  const tag = to === 'lrt' ? { text: LRT_BRAND.zh, bg: LRT_BRAND.color, fg: LRT_BRAND.ink } : { text: tml.zh, bg: tml.color, fg: tml.ink };
  const label = to === 'lrt' ? `轉乘輕鐵${lrtStopName(sta)}站` : `轉乘港鐵${tml.zh}${mtrStationName(sta)}站`;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPick(sta);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 30,
        paddingLeft: 10,
        paddingRight: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: pressed ? t.surface2 : t.card,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.text }}>轉乘</Text>
      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: tag.bg }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: tag.fg }}>{tag.text}</Text>
      </View>
      <Icon name="chevron-right" size={14} color={t.muted} />
    </Pressable>
  );
}
