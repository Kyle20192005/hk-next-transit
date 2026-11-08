import { useNetworkState } from 'expo-network';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadowLg } from '@/lib/theme';
import { Icon } from './Icon';

/** 冇網絡：頂部一條提示（同網頁 OfflineBanner 一樣）。未知（undefined）唔顯示 */
export function OfflineBanner() {
  const net = useNetworkState();
  const insets = useSafeAreaInsets();
  if (net.isConnected !== false && net.isInternetReachable !== false) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', zIndex: 100, top: insets.top + 8, left: 12, right: 12, alignItems: 'center' }}>
      <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#3b3f46', ...shadowLg }}>
        <Icon name="warning" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>冇網絡連線：到站時間暫停更新，顯示緊舊資料</Text>
      </View>
    </View>
  );
}
