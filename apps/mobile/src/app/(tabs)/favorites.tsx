import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { favKey, useFavorites } from '@/lib/favorites';
import { FavItem } from '@/components/FavItem';
import { useTheme } from '@/lib/theme';
import { AppBar, EmptyState } from '@/components/ui';

/** 收藏：收藏咗嘅站直接顯示下一班；收藏咗嘅路線一撳就入 */
export default function FavoritesTab() {
  const t = useTheme();
  const list = useFavorites();
  return (
    <View style={{ flex: 1 }}>
      <AppBar>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>收藏</Text>
      </AppBar>
      {list.length === 0 ? (
        <EmptyState icon="star" action={{ label: '去路線列表', onPress: () => router.navigate('/routes') }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>喺路線頁撳標題列嘅星號收藏路線，{'\n'}或者打開一個站撳「收藏呢個站」。</Text>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>收藏咗嘅站會喺度直接顯示下一班車（只儲存喺呢部機）</Text>
        </EmptyState>
      ) : (
        <FlatList data={list} keyExtractor={favKey} contentContainerStyle={{ padding: 12, gap: 10 }} renderItem={({ item }) => <FavItem f={item} />} />
      )}
    </View>
  );
}
