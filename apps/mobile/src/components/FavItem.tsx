import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { minutesLabel, mtrDepartureRows, mtrLine, mtrStationLines, type DepartureRow, type Eta, type FavGroupDef } from '@hknt/core';
import { api, type Co } from '@/lib/api';
import { isMtrFav, removeFavorite, type Favorite } from '@/lib/favorites';
import { openMtr } from '@/lib/open-mtr';
import { usePrefs } from '@/lib/prefs';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { warmRoute } from '@/lib/prefetch';
import { CompanyTag, ScheduledTag } from './ui';
import { Icon } from './Icon';
import { EtaInline } from './EtaInline';

const REFRESH_MS = 30_000;

/** 收藏一行（收藏頁同首頁共用）：收藏咗嘅站直接顯示下一班；港鐵站顯示每條綫每個方向下一班 */
export function FavItem({ f, groups = [], onPickGroup }: { f: Favorite; groups?: FavGroupDef[]; onPickGroup?: () => void }) {
  if (isMtrFav(f)) return <MtrFavItem f={f} groups={groups} onPickGroup={onPickGroup} />;
  return <BusFavItem f={f} groups={groups} onPickGroup={onPickGroup} />;
}

function BusFavItem({ f, groups, onPickGroup }: { f: Favorite; groups: FavGroupDef[]; onPickGroup?: () => void }) {
  const t = useTheme();
  const co = f.co as Co;
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, ...shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPressIn={() => warmRoute(co, f.route, { dir: f.dir, stopId: f.stopId })}
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: f.route, dir: f.dir, ...(f.stopId ? { stop: f.stopId } : {}) } })}
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
      <GroupPick f={f} groups={groups} label={f.route} onPickGroup={onPickGroup} />
    </View>
  );
}

/** 每個收藏下面：放入邊個分組 */
function GroupPick({ f, groups, label, onPickGroup }: { f: Favorite; groups: FavGroupDef[]; label: string; onPickGroup?: () => void }) {
  const t = useTheme();
  if (!onPickGroup || !groups.length) return null;
  const group = groups.find((g) => g.id === f.group);
  return (
    <Pressable onPress={onPickGroup} accessibilityRole="button" accessibilityLabel={`${label} 放入分組：而家${group?.name ?? '未分組'}`} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: -6, paddingHorizontal: 16, paddingBottom: 10 }}>
      <Icon name="folder" size={14} color={t.muted} />
      <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{group?.name ?? '未分組'}</Text>
      <Icon name="chevron-down" size={14} color={t.muted} />
    </Pressable>
  );
}

/** 收藏咗嘅港鐵站：站名、綫，下面每條綫每個方向下一班（最多 4 行）；撳入路綫圖嗰個站（同網頁 MtrFavItem 一樣） */
function MtrFavItem({ f, groups, onPickGroup }: { f: Favorite; groups: FavGroupDef[]; onPickGroup?: () => void }) {
  const t = useTheme();
  const sta = f.stopId!;
  const { etaFormat } = usePrefs();
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.mtr(sta);
        if (!cancelled) setState({ rows: mtrDepartureRows(sta, body.lines, 4), now: Date.now() });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sta]);
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, ...shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable onPress={() => openMtr(sta)} accessibilityRole="link" style={{ flex: 1, gap: 8, paddingVertical: 12, paddingLeft: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Icon name="train" size={18} color={t.text} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{f.stopName}</Text>
            {mtrStationLines(sta).map((l) => (
              <View key={l} style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: mtrLine(l)?.color }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: mtrLine(l)?.ink }}>{mtrLine(l)?.zh}</Text>
              </View>
            ))}
          </View>
          {state === null && <Text style={{ color: t.muted }}>…</Text>}
          {state?.rows.length === 0 && <Text style={{ color: t.muted }}>{sta === 'RAC' ? '只喺賽馬日開放' : '暫時冇班次'}</Text>}
          {state?.rows.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink }}>{r.badge.text}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: t.text }}>
                往{r.dest}
              </Text>
              {r.platform ? (
                <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: r.badge.bg }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: r.badge.ink }}>{r.platform}</Text>
                </View>
              ) : null}
              <Text style={{ minWidth: 64, textAlign: 'right', fontSize: r.nowText ? 14 : 16, fontWeight: '800', color: t.text, ...tabular }}>{r.nowText ?? minutesLabel(r.at, state.now, etaFormat)}</Text>
            </View>
          ))}
        </Pressable>
        <Pressable onPress={() => removeFavorite(f)} accessibilityLabel={`取消收藏${f.stopName}站`} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginTop: 4 }}>
          <Icon name="star-fill" size={20} color={t.brand} />
        </Pressable>
      </View>
      <GroupPick f={f} groups={groups} label={`${f.stopName}站`} onPickGroup={onPickGroup} />
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
        const body = await api.eta(f.co as Co, f.route, f.stopId!);
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
