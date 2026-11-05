import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { shadow, tabular, useTheme } from '@/lib/theme';
import { Icon } from './Icon';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const KEY_H = 46;
const GAP = 8;

/** 鍵盤一粒掣 */
function Key({ label, onPress, disabled, accent, children, a11y, width }: { label?: string; onPress: () => void; disabled?: boolean; accent?: boolean; children?: ReactNode; a11y?: string; width: `${number}%` }) {
  const t = useTheme();
  return (
    <View style={{ width, flexGrow: 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y ?? label}
        style={({ pressed }) => ({
          height: KEY_H,
          flexDirection: 'row',
          gap: 4,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: pressed ? t.brandSoft : t.card,
          opacity: disabled ? 0.28 : 1,
          ...(disabled ? {} : shadow),
        })}
      >
        {children ?? <Text style={{ fontSize: 21, fontWeight: '700', color: accent ? t.accent : t.text, ...tabular }}>{label}</Text>}
      </Pressable>
    </View>
  );
}

/** 巴士號碼鍵盤：左邊數字（冇路線嘅變灰），右邊只列可以接落去嘅字母（同網頁版一樣） */
export function Keypad({ nextChars, onKey, onBack, onPlace, canBack }: { nextChars: Set<string>; onKey: (k: string) => void; onBack: () => void; onPlace: () => void; canBack: boolean }) {
  const t = useTheme();
  const letters = [...nextChars].filter((c) => /[A-Z]/.test(c)).sort();
  return (
    <View style={{ flexDirection: 'row', gap: GAP, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: t.surface2, borderTopWidth: 1, borderTopColor: t.line }}>
      <View style={{ flex: 3, flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {DIGITS.map((d) => (
          <Key key={d} width="30%" label={d} onPress={() => onKey(d)} disabled={!nextChars.has(d)} />
        ))}
        <Key width="30%" onPress={onPlace} a11y="用地點搜尋">
          <Icon name="search" size={18} color={t.accent} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.accent }}>地點</Text>
        </Key>
        <Key width="30%" label="0" onPress={() => onKey('0')} disabled={!nextChars.has('0')} />
        <Key width="30%" onPress={onBack} disabled={!canBack} a11y="刪除">
          <Icon name="backspace" size={24} color={t.accent} />
        </Key>
      </View>
      <ScrollView style={{ flex: 2, maxHeight: 4 * KEY_H + 3 * GAP }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {letters.map((l) => (
          <Key key={l} width="45%" label={l} accent onPress={() => onKey(l)} />
        ))}
      </ScrollView>
    </View>
  );
}
