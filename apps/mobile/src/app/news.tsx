import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { filterNews, type NewsFilter } from '@hknt/core';
import { AppBar, BarButton } from '@/components/ui';
import { NewsChips, NewsList } from '@/components/NewsList';
import { useNews } from '@/lib/news';
import { useTheme } from '@/lib/theme';

/** 交通消息頁（由首頁入，同網頁 components/home/News.tsx 一樣）；?lat&lng 有位置就預設睇附近 */
export default function NewsScreen() {
  const t = useTheme();
  const q = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const pos = q.lat && q.lng ? { lat: Number(q.lat), lng: Number(q.lng) } : null;
  const items = useNews(pos);
  const [filter, setFilter] = useState<NewsFilter>(pos ? 'nearby' : 'all');
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppBar style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BarButton icon="back" label="返回" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: t.onBrand }}>交通消息</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.onBrand, opacity: 0.7 }}>運輸署</Text>
        </View>
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <NewsChips value={filter} onChange={setFilter} hasPos={!!pos} />
        {items === null ? <Text style={{ color: t.muted, padding: 8 }}>載入中…</Text> : <NewsList items={filterNews(items, filter)} empty={filter === 'nearby' ? '附近冇特別交通消息' : '暫時冇特別交通消息'} />}
        <Text style={{ fontSize: 12, lineHeight: 18, color: t.muted }}>資料來源：運輸署特別交通消息。「附近」按你附近 1.5 公里內嘅站名判斷，僅供參考。</Text>
      </ScrollView>
    </View>
  );
}
