import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Eta, FavGroupDef } from '@hknt/core';
import { api } from '@/lib/api';
import { removeFavorite, type Favorite } from '@/lib/favorites';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { warmRoute } from '@/lib/prefetch';
import { CompanyTag, ScheduledTag } from './ui';
import { Icon } from './Icon';
import { EtaInline } from './EtaInline';

const REFRESH_MS = 30_000;

/** 收藏一行（收藏頁同首頁共用）：收藏咗嘅站直接顯示下一班 */
export function FavItem({ f, groups = [], onPickGroup }: { f: Favorite; groups?: FavGroupDef[]; onPickGroup?: () => void }) {
  const t = useTheme();
  const group = groups.find((g) => g.id === f.group);
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, ...shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPressIn={() => warmRoute(f.co, f.route, { dir: f.dir, stopId: f.stopId })}
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co: f.co, route: f.route, dir: f.dir, ...(f.stopId ? { stop: f.stopId } : {}) } })}
          accessibilityRole="link"
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
          <View style={{ width: 108, paddingVertical: 12, paddingLeft: 16, gap: 4 }}>
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
      {onPickGroup && groups.length > 0 && (
        <Pressable onPress={onPickGroup} accessibilityRole="button" accessibilityLabel={`${f.route} 放入分組：而家${group?.name ?? '未分組'}`} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: -6, paddingHorizontal: 16, paddingBottom: 10 }}>
          <Icon name="folder" size={14} color={t.muted} />
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{group?.name ?? '未分組'}</Text>
          <Icon name="chevron-down" size={14} color={t.muted} />
        </Pressable>
      )}
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
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <EtaInline ats={etas.slice(0, 3).map((e) => Date.parse(e.eta!))} now={now} size={24} />
      {etas[0]?.scheduled && <ScheduledTag />}
    </View>
  );
}
