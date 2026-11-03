import { Text } from 'react-native';
import { useTheme } from '@/lib/theme';

export function Badge({ label, special }: { label: string; special?: boolean }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 12, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, overflow: 'hidden',
        backgroundColor: special ? t.specialSoft : t.brandSoft, color: special ? t.special : t.brand,
      }}
    >
      {label}
    </Text>
  );
}
