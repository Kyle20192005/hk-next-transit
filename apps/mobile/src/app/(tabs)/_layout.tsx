import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { useFavorites } from '@/lib/favorites';
import { useTheme } from '@/lib/theme';

/** 底部分頁列：首頁／路線／導航／收藏／設定（導航未做；附近唔係分頁，由首頁同巴士路線頁入）（同網頁版一樣，揀咗嘅圖示有淡黃底） */
export default function TabLayout() {
  const t = useTheme();
  const favCount = useFavorites().length;
  const insets = useSafeAreaInsets();
  const icon = (name: IconName, focusedName?: IconName) =>
    function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
      return (
        <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? t.brandSoft : 'transparent' }}>
          <Icon name={focused && focusedName ? focusedName : name} size={24} color={focused ? t.accent : String(color)} />
          {name === 'star' && favCount > 0 && (
            <View style={{ position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: t.onBrand }}>{favCount}</Text>
            </View>
          )}
        </View>
      );
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.muted,
        // 圖示有 30 高嘅底色膠囊，預設高度會切走文字
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line, height: 70 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 4 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2 },
        tabBarIconStyle: { height: 30 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '首頁', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="routes" options={{ title: '路線', tabBarIcon: icon('route') }} />
      <Tabs.Screen name="navigation" options={{ title: '導航', tabBarIcon: icon('navigate') }} />
      <Tabs.Screen name="favorites" options={{ title: '收藏', tabBarIcon: icon('star', 'star-fill') }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
