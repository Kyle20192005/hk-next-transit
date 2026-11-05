import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { Eta } from '@hknt/core';
import { api } from '@/lib/api';
import { favKey, removeFavorite, useFavorites, type Favorite } from '@/lib/favorites';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { AppBar, CompanyTag, EmptyState, ScheduledTag } from '@/components/ui';
import { Icon } from '@/components/Icon';

const REFRESH_MS = 30_000;

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
        <EmptyState icon="star" action={{ label: '去路線列表', onPress: () => router.navigate('/') }}>
          <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 22 }}>喺路線頁撳標題列嘅星號收藏路線，{'\n'}或者打開一個站撳「收藏呢個站」。</Text>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>收藏咗嘅站會喺度直接顯示下一班車（只儲存喺呢部機）</Text>
        </EmptyState>
      ) : (
        <FlatList data={list} keyExtractor={favKey} contentContainerStyle={{ padding: 12, gap: 10 }} renderItem={({ item }) => <FavItem f={item} />} />
      )}
    </View>
  );
}

function FavItem({ f }: { f: Favorite }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: radius.l, ...shadow }}>
        <Pressable
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: f.co, route: f.route, dir: f.dir, ...(f.stopId ? { stop: f.stopId } : {}) } })}
          accessibilityRole="link"
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
          <View style={{ width: 88, paddingVertical: 12, paddingLeft: 16, gap: 4 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, ...tabular }}>{f.route}</Text>
            <CompanyTag companies={f.companies} />
          </View>
          <View style={{ flex: 1, gap: 2, paddingVertical: 12 }}>
            <Text numberOfLines={1} style={{ fontWeight: '700', color: t.text, fontSize: 16 }}>
              <Text style={{ color: t.muted, fontWeight: '500', fontSize: 13 }}>往 </Text>
              {f.dest}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {f.stopName && <Icon name="pin" size={14} color={t.muted} />}
              <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13, flexShrink: 1 }}>
                {f.stopName ?? '成條路線'}
              </Text>
            </View>
          </View>
          {f.stopId ? <FavEtas f={f} /> : <Icon name="chevron-right" size={20} color={t.muted} />}
        </Pressable>
      <Pressable onPress={() => removeFavorite(f)} accessibilityLabel={`取消收藏 ${f.route}${f.stopName ? ` ${f.stopName}` : ''}`} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
        <Icon name="star-fill" size={20} color={t.brand} />
      </Pressable>
    </View>
  );
}

function FavEtas({ f }: { f: Favorite }) {
  const t = useTheme();
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.eta(f.co, f.route, f.stopId!);
        if (!cancelled) setEtas(body.etas.filter((e) => e.eta && e.dir === f.dir));
      } catch {
        /* 下次再試 */
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [f.co, f.route, f.stopId, f.dir]);

  if (etas === null) return <Text style={{ color: t.muted }}>…</Text>;
  if (!etas.length) return <Text style={{ color: t.muted, fontSize: 13 }}>冇班次</Text>;
  const mins = etas.slice(0, 3).map((e) => Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000)));
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ color: t.accent, ...tabular }}>
        <Text style={{ fontSize: 24, fontWeight: '800' }}>{mins[0] === 0 ? '即將' : mins[0]}</Text>
        {mins[0] !== 0 && <Text style={{ fontSize: 13, fontWeight: '700' }}> 分</Text>}
      </Text>
      {etas[0]?.scheduled && <ScheduledTag />}
      {mins.length > 1 && <Text style={{ color: t.muted, fontSize: 12, ...tabular }}>{mins.slice(1).join('、')} 分</Text>}
    </View>
  );
}
