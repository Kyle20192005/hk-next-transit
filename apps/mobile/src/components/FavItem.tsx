import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LRT_BRAND, lrtDepartureRows, lrtRoute, lrtStopRoutes, minutesLabel, routeCode, routeTitle, mtrDepartureRows, mtrLine, mtrStationLines, type DepartureRow, type Eta, type FavGroupDef, type FavRouteGroup } from '@hknt/core';
import { api, type Co } from '@/lib/api';
import { isLrtFav, isMtrFav, removeFavorite, type Favorite } from '@/lib/favorites';
import { openLrt, openMtr } from '@/lib/open-mtr';
import { usePrefs } from '@/lib/prefs';
import { radius, shadow, tabular, useTheme } from '@/lib/theme';
import { warmRoute } from '@/lib/prefetch';
import { CompanyTag, RegionTag, ScheduledTag } from './ui';
import { Icon } from './Icon';
import { EtaInline } from './EtaInline';

const REFRESH_MS = 30_000;

/**
 * 收藏頁：一條路線（港鐵綫、輕鐵）一張卡（同網頁 FavRouteCard 一樣，core groupFavsByRoute）：
 * 頂部路線號碼同公司（撳入路線）或者綫色 + 綫名（輕鐵：「輕鐵站」），下面每行一個收藏咗嘅站。
 */
export function FavRouteCard({ g, groups, onPickGroup }: { g: FavRouteGroup<Favorite>; groups: FavGroupDef[]; onPickGroup: (f: Favorite) => void }) {
  const t = useTheme();
  const f0 = g.favs[0]!;
  const line = isMtrFav(f0) && f0.route ? mtrLine(f0.route) : undefined;
  const co = f0.co as Co;
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.l, overflow: 'hidden', ...shadow }}>
      {isLrtFav(f0) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ width: 6, height: 22, borderRadius: 3, backgroundColor: LRT_BRAND.color }} />
          <Icon name="lrt" size={20} color={t.text} />
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.text }}>輕鐵站</Text>
          <Text style={{ fontSize: 13, color: t.muted }}>輕鐵</Text>
        </View>
      ) : isMtrFav(f0) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line }}>
          {line ? <View style={{ width: 6, height: 22, borderRadius: 3, backgroundColor: line.color }} /> : <Icon name="train" size={20} color={t.text} />}
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.text }}>{line ? line.zh : '港鐵站'}</Text>
          <Text style={{ fontSize: 13, color: t.muted }}>港鐵</Text>
        </View>
      ) : (
        <Pressable
          onPressIn={() => warmRoute(co, f0.route, { dir: f0.dir })}
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: f0.route, dir: f0.dir } })}
          accessibilityRole="link"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.text, ...tabular }}>{routeCode(co, f0.route)}</Text>
          {/* 專線小巴：同一個號碼三個地區都可以有，標地區（號碼 → 地區 → 公司，同網頁一樣） */}
          <RegionTag co={co} route={f0.route} inline />
          {/* CompanyTag 自己 alignSelf flex-start：包一層先會同號碼、地區標籤置中對齊 */}
          <View>
            <CompanyTag companies={f0.companies} />
          </View>
          <View style={{ flex: 1 }} />
          <Icon name="chevron-right" size={18} color={t.muted} />
        </Pressable>
      )}
      {g.favs.map((f, i) => (
        <View key={`${f.co}/${f.route}/${f.dir}/${f.stopId ?? ''}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
          <FavItem f={f} groups={groups} onPickGroup={() => onPickGroup(f)} />
        </View>
      ))}
    </View>
  );
}

/** 路線卡入面一行：收藏咗嘅站（站名、往邊、下一班），成條路線，或者港鐵站（嗰條綫兩個方向下一班） */
export function FavItem({ f, groups = [], onPickGroup }: { f: Favorite; groups?: FavGroupDef[]; onPickGroup?: () => void }) {
  if (isMtrFav(f)) return <MtrFavItem f={f} groups={groups} onPickGroup={onPickGroup} />;
  if (isLrtFav(f)) return <LrtFavItem f={f} groups={groups} onPickGroup={onPickGroup} />;
  return <BusFavItem f={f} groups={groups} onPickGroup={onPickGroup} />;
}

/** 收藏咗嘅輕鐵站：站名同經過嘅路線，下面每條路線每個目的地下一班（最多 4 行，有月台）；撳入輕鐵路綫圖（同網頁 LrtFavItem 一樣） */
function LrtFavItem({ f, groups, onPickGroup }: { f: Favorite; groups: FavGroupDef[]; onPickGroup?: () => void }) {
  const t = useTheme();
  const sta = f.stopId!;
  const { etaFormat } = usePrefs();
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.lrt(sta);
        const now = Date.now();
        if (!cancelled) setState({ rows: lrtDepartureRows(sta, body.platforms, now, 4), now });
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
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable onPress={() => openLrt(sta)} accessibilityRole="link" style={{ flex: 1, gap: 8, paddingVertical: 12, paddingLeft: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Icon name="lrt" size={18} color={t.text} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{f.stopName}</Text>
            {lrtStopRoutes(sta).map((r) => (
              <View key={r} style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: lrtRoute(r)?.color }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: lrtRoute(r)?.ink }}>{r}</Text>
              </View>
            ))}
          </View>
          {state === null && <Text style={{ color: t.muted }}>…</Text>}
          {state?.rows.length === 0 && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
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
        <Pressable onPress={() => removeFavorite(f)} accessibilityLabel={`取消收藏輕鐵${f.stopName}站`} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginTop: 4 }}>
          <Icon name="star-fill" size={20} color={t.brand} />
        </Pressable>
      </View>
      <GroupPick f={f} groups={groups} label={`輕鐵${f.stopName}站`} onPickGroup={onPickGroup} />
    </View>
  );
}

function BusFavItem({ f, groups, onPickGroup }: { f: Favorite; groups: FavGroupDef[]; onPickGroup?: () => void }) {
  const t = useTheme();
  const co = f.co as Co;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPressIn={() => warmRoute(co, f.route, { dir: f.dir, stopId: f.stopId })}
          onPress={() => router.push({ pathname: '/[co]/[route]', params: { co, route: f.route, dir: f.dir, ...(f.stopId ? { stop: f.stopId } : {}) } })}
          accessibilityRole="link"
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4 }}>
          <View style={{ flex: 1, gap: 2, paddingVertical: 12, paddingLeft: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {f.stopName && <Icon name="pin" size={15} color={t.text} />}
              <Text numberOfLines={1} style={{ fontWeight: '700', color: t.text, fontSize: 16, flexShrink: 1 }}>
                {f.stopName ?? '成條路線'}
              </Text>
            </View>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>
              往 {f.dest}
            </Text>
          </View>
          {f.stopId ? <FavEtas f={f} /> : <Icon name="chevron-right" size={20} color={t.muted} />}
        </Pressable>
        <Pressable onPress={() => removeFavorite(f)} accessibilityLabel={`取消收藏 ${routeTitle(co, f.route)}${f.stopName ? ` ${f.stopName}` : ''}`} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
          <Icon name="star-fill" size={20} color={t.brand} />
        </Pressable>
      </View>
      <GroupPick f={f} groups={groups} label={routeTitle(co, f.route)} onPickGroup={onPickGroup} />
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

/** 收藏咗嘅港鐵站：站名，下面嗰條綫兩個方向下一班（舊版成個站收藏：所有綫，最多 4 行）；撳入路綫圖嗰個站（同網頁 MtrFavItem 一樣） */
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
        if (!cancelled) setState({ rows: mtrDepartureRows(sta, body.lines, 4, f.route ? [f.route] : undefined), now: Date.now() });
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
  }, [sta, f.route]);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable onPress={() => openMtr(sta)} accessibilityRole="link" style={{ flex: 1, gap: 8, paddingVertical: 12, paddingLeft: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Icon name="train" size={18} color={t.text} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{f.stopName}</Text>
            {!f.route && mtrStationLines(sta).map((l) => (
              <View key={l} style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: mtrLine(l)?.color }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: mtrLine(l)?.ink }}>{mtrLine(l)?.zh}</Text>
              </View>
            ))}
          </View>
          {state === null && <Text style={{ color: t.muted }}>…</Text>}
          {state?.rows.length === 0 && <Text style={{ color: t.muted }}>{sta === 'RAC' ? '只喺賽馬日開放' : '暫時冇班次'}</Text>}
          {state?.rows.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* 綫卡頂已經有綫色同綫名；舊版成個站收藏先要標籤分綫 */}
              {!f.route && (
                <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: r.badge.bg, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: r.badge.ink }}>{r.badge.text}</Text>
                </View>
              )}
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
        <Pressable onPress={() => removeFavorite(f)} accessibilityLabel={`取消收藏${f.stopName}站${f.route ? (mtrLine(f.route)?.zh ?? '') : ''}`} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4, marginTop: 4 }}>
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
