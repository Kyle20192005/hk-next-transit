import { Text, View } from 'react-native';
import { radius, useTheme } from '@/lib/theme';
import { MapHelpButton } from './mapHelp';
import type { RouteMapProps } from './RouteMap';

export type { MapBus, MapLine, MapStop } from './RouteMap';

/**
 * 瀏覽器版（只用嚟喺開發時預覽 App 版面）：MapLibre 原生地圖唔支援 web，
 * 所以只畫一個佔位，顯示站數同巴士數。真正用戶用網頁版（apps/web）。
 */
export function RouteMap({ stops, buses, company, multiCompany, height }: RouteMapProps) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: radius.l, overflow: 'hidden', backgroundColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
      <MapHelpButton company={company} multiCompany={multiCompany} />
      <Text style={{ color: t.muted }}>地圖（手機 App 先顯示）</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>
        {stops.length} 個站 · {buses.length} 架巴士
      </Text>
    </View>
  );
}
