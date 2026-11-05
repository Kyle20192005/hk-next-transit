import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/** 根：分頁（路線／附近／收藏）+ 路線頁。標題列全部自己畫（黃色），唔用系統 header */
export default function RootLayout() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      {/* 黃色標題列上面用深色狀態列字 */}
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="[co]/[route]" />
      </Stack>
    </SafeAreaProvider>
  );
}
