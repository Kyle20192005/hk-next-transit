import { Text, View } from 'react-native';
import { radius, useTheme } from '@/lib/theme';
import { MapHelpButton } from './mapHelp';
import type { RouteMapProps } from './mapTypes';

/** 冇原生地圖時嘅佔位（Expo Go、web 預覽）：顯示原因、站數同巴士數，其他功能照用 */
export function MapPlaceholder({ stops, buses, company, multiCompany, height, note }: RouteMapProps & { note: string }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: t.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
      <Text style={{ color: t.muted, textAlign: 'center' }}>{note}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>
        {stops.length} 個站 · {buses.length} 架巴士
      </Text>
      <MapHelpButton company={company} multiCompany={multiCompany} />
    </View>
  );
}
