import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { LaunchOverlay } from '@/components/LaunchOverlay';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { loadPrefs } from '@/lib/prefs';

// 設定（深色模式等）越早讀越好
loadPrefs();

// 開 App 嘅載入畫面（黃底 logo，app.json 嘅 expo-splash-screen）：由 LaunchOverlay 接手做動畫，原生嗰層唔使淡出
SplashScreen.setOptions({ duration: 0, fade: false });

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
        <Stack.Screen name="nearby" />
        <Stack.Screen name="news" />
        <Stack.Screen name="tools" />
      </Stack>
      <LaunchOverlay />
    </SafeAreaProvider>
  );
}
