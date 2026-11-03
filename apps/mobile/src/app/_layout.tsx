import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/lib/theme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.brand === '#0b57d0' ? '#0b57d0' : '#1a2b4a' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '城巴路線' }} />
        <Stack.Screen name="ctb/[route]" options={{ title: '路線資料' }} />
      </Stack>
    </>
  );
}
