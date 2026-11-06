import { Text, View } from 'react-native';
import { AppBar, ComingSoon } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** 導航（點到點路線規劃）：未做（同網頁 components/home/Navigation.tsx 一樣） */
export default function NavigationTab() {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>導航</Text>
      </AppBar>
      <ComingSoon icon="navigate" title="點到點導航" text="輸入起點同目的地，揀最快嘅巴士、港鐵、小巴組合，連轉車等候時間。" />
    </View>
  );
}
