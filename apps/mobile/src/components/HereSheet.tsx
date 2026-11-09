import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistance, routeCode } from '@hknt/core';
import { api, type Co, type HereRoute } from '@/lib/api';
import { radius, shadowLg, tabular, useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { CompanyTag, RegionTag, ScheduledTag } from './ui';
import { warmRoute } from '@/lib/prefetch';
import { EtaInline } from './EtaInline';

const REFRESH_MS = 30_000;

export interface HereTarget {
  lat: number;
  lng: number;
  name: string;
  current: { co: Co; route: string; dir: 'O' | 'I' };
}

/** 「喺度搭得」掣：撳開由下面彈上嘅面板（同網頁 HereDrawer 一樣嘅內容） */
export function HereButton({ target }: { target: HereTarget }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: t.brand, transform: [{ scale: pressed ? 0.97 : 1 }] })}
      >
        {/* 圖示跟而家睇緊嘅路線：專線小巴用小巴 */}
        <Icon name={target.current.co === 'gmb' ? 'minibus' : 'bus'} size={18} color={t.onBrand} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.onBrand }}>喺度搭得</Text>
      </Pressable>
      {open && <HereSheet target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function HereSheet({ target, onClose }: { target: HereTarget; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ routes: HereRoute[]; radius: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.here(target.lat, target.lng);
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [target.lat, target.lng]);

  const cur = target.current;
  const isCurrent = (r: HereRoute) => r.co === cur.co && r.route === cur.route && r.dir === cur.dir;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} accessibilityLabel="關閉喺度搭得" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', minHeight: '50%', backgroundColor: t.card, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingBottom: insets.bottom, ...shadowLg }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.line, marginTop: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingBottom: 12, paddingLeft: 20, paddingRight: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>喺度搭得</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: t.muted }}>
              {target.name}
              {data ? ` · 包括 ${data.radius} 米內嘅站` : ''}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="關閉" style={{ width: 36, height: 36, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Icon name="close" size={20} color={t.muted} />
          </Pressable>
        </View>
        {error && <Text style={{ margin: 20, color: t.special }}>載入失敗：{error}</Text>}
        {!data && !error && <ActivityIndicator style={{ margin: 24 }} />}
        {data && (
          <FlatList
            // 而家睇緊嘅線固定排第一，其餘照 API 次序（下一班先後）
            data={[...data.routes].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)))}
            keyExtractor={(r) => `${r.co}-${r.route}-${r.dir}`}
            ListEmptyComponent={<Text style={{ margin: 20, color: t.muted }}>搵唔到其他路線</Text>}
            renderItem={({ item: r }) => {
              return (
                <Pressable
                  onPressIn={() => warmRoute(r.co, r.route, { dir: r.dir, stopId: r.stopId })}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/[co]/[route]', params: { co: r.co, route: r.route, dir: r.dir, stop: r.stopId } });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: isCurrent(r) ? t.brandSoft : 'transparent' }}
                >
                  <View style={{ width: 96, gap: 3 }}>
                    {/* 專線小巴：號碼（NT-2 → 2）旁邊標地區 */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, ...tabular }}>{routeCode(r.co, r.route)}</Text>
                      <RegionTag co={r.co} route={r.route} inline />
                    </View>
                    <CompanyTag companies={r.companies} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>
                      <Text style={{ color: t.muted, fontWeight: '500', fontSize: 13 }}>往 </Text>
                      {r.dest}
                    </Text>
                    {isCurrent(r) ? (
                      <Text style={{ fontSize: 12, color: t.muted }}>而家睇緊</Text>
                    ) : (
                      r.distance > 0 && (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: t.muted }}>
                          {r.stopName} · {formatDistance(r.distance)}
                        </Text>
                      )
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {r.etas.length ? (
                      <>
                        <EtaInline ats={r.etas.map((e) => Date.parse(e.eta))} now={now} />
                        {r.etas[0]?.scheduled && <ScheduledTag />}
                      </>
                    ) : (
                      <Text style={{ color: t.muted }}>冇班次</Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
