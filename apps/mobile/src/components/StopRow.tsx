import { memo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COMPANIES, formatDistance, shortName, type Company, type Eta } from '@hknt/core';
import { tabular, useTheme } from '@/lib/theme';
import { useFavorite, type Favorite } from '@/lib/favorites';
import { BusGlyph, Icon } from './Icon';
import { CompanyTag, Pill, ScheduledTag } from './ui';
import { HereButton, type HereTarget } from './HereSheet';

/** 時間線上嘅巴士：half = below 由圓點去到呢行底，above 由呢行頂去到圓點（同網頁版一樣） */
export interface RowBus {
  key: number;
  half: 'below' | 'above';
  t: number;
  color: string;
  ink: string;
  schedule?: boolean;
}

type Props = {
  index: number;
  name: string;
  terminus: boolean;
  first: boolean;
  last: boolean;
  lineColor: string;
  multiCompany: boolean;
  open: boolean;
  onToggle: () => void;
  etas: Eta[] | null;
  whereLabels: (string | null)[] | null;
  error: string | null;
  failed: string[];
  now: number;
  selectedVariantId: string | null;
  fare: { adult: string; joyYou: string | null } | null;
  nearestMetres: number | null;
  travelSeconds: number | null;
  travelMetres: number | null;
  nextArrival: number | null;
  buses: RowBus[];
  fav: Omit<Favorite, 'at'> | null;
  /** 「喺度搭得」：呢個站嘅位置同而家睇緊嘅路線 */
  here: HereTarget | null;
};

const SEQ_W = 34;
const TL_W = 36;
const TL_X = SEQ_W + TL_W / 2;
const DOT_Y = 27;

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });

/** 一個站（時間線一行），開定收由路線頁控制 */
export const StopRow = memo(function StopRow(p: Props) {
  const t = useTheme();
  const [height, setHeight] = useState(54);
  const list = p.etas?.map((e, i) => ({ e, where: p.whereLabels?.[i] ?? null })) ?? null;
  const isMine = (e: Eta) => !p.selectedVariantId || !e.variant?.variantId || e.variant.variantId === p.selectedVariantId;
  const next = list?.find((x) => isMine(x.e)) ?? null;
  const rest = list?.filter((x) => x !== next) ?? [];
  const minsOf = (e: Eta) => Math.max(0, Math.round((Date.parse(e.eta!) - p.now) / 60000));

  return (
    <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={{ backgroundColor: p.open ? t.brandSoft : 'transparent' }}>
      {/* 豎線：畫喺成個站嘅高度（連打開咗嘅到站時間），行與行之間唔會斷 */}
      <View
        style={{
          position: 'absolute',
          left: TL_X - 3,
          width: 6,
          // 中間唔好圓角（站與站之間會凹一個位），只喺頭尾圓
          borderTopLeftRadius: p.first ? 3 : 0,
          borderTopRightRadius: p.first ? 3 : 0,
          borderBottomLeftRadius: p.last ? 3 : 0,
          borderBottomRightRadius: p.last ? 3 : 0,
          backgroundColor: p.lineColor,
          top: p.first ? DOT_Y : 0,
          ...(p.last ? { height: DOT_Y } : { bottom: 0 }),
        }}
      />
      {p.buses.map((b) => (
        <View
          key={b.key}
          pointerEvents="none"
          style={{
            position: 'absolute',
            zIndex: 2,
            left: TL_X - 13,
            top: (b.half === 'below' ? DOT_Y + (height - DOT_Y) * b.t : DOT_Y * b.t) - 13,
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: t.card,
            backgroundColor: b.color,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: b.schedule ? 0.5 : 1,
          }}
        >
          <BusGlyph size={14} color={b.ink} />
        </View>
      ))}
      <Pressable onPress={p.onToggle} accessibilityRole="button" accessibilityState={{ expanded: p.open }} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingVertical: 6, paddingRight: 16 }}>
        <Text style={{ width: SEQ_W, textAlign: 'right', fontSize: 12, color: t.muted, ...tabular }}>{p.index + 1}</Text>
        <View style={{ width: TL_W, alignSelf: 'stretch' }}>
          <View
            style={{
              position: 'absolute',
              left: TL_W / 2 - (p.terminus ? 9 : 7),
              top: DOT_Y - 6 - (p.terminus ? 9 : 7),
              width: p.terminus ? 18 : 14,
              height: p.terminus ? 18 : 14,
              borderRadius: 9,
              backgroundColor: t.card,
              borderWidth: p.terminus ? 5 : 3,
              borderColor: p.terminus ? t.text : p.lineColor,
            }}
          />
        </View>
        <View style={{ flex: 1, paddingLeft: 6 }}>
          {/* 「最近」係獨立膠囊：放唔落就成粒落下一行，唔會好似一段字咁斷開兩截 */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 3 }}>
            <Text style={{ fontSize: 16, color: t.text, fontWeight: p.open ? '700' : '400' }}>{p.name}</Text>
            {p.nearestMetres !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 6, paddingRight: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: t.brand }}>
                <Icon name="pin" size={12} color={t.onBrand} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.onBrand, ...tabular }}>最近 · {formatDistance(p.nearestMetres)}</Text>
              </View>
            )}
          </View>
          {p.travelSeconds !== null && p.travelSeconds > 0 && (
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.accent, ...tabular }}>
              +{Math.max(1, Math.round(p.travelSeconds / 60))} 分
              <Text style={{ fontWeight: '400', color: t.muted }}>
                {p.travelMetres !== null && p.travelMetres > 0 ? ` · ${formatDistance(p.travelMetres)}` : ''}
                {p.nextArrival !== null ? ` · 約 ${hhmm(p.nextArrival)}` : ''}
              </Text>
            </Text>
          )}
        </View>
        {p.fare && (
          <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.text, ...tabular }}>{p.fare.adult}</Text>
            {p.fare.joyYou && <Text style={{ fontSize: 11, fontWeight: '700', color: t.ok }}>樂悠 {p.fare.joyYou}</Text>}
          </View>
        )}
      </Pressable>

      {p.open && (
        <View style={{ paddingLeft: SEQ_W + TL_W + 6, paddingRight: 16, paddingBottom: 16 }}>
          {p.error && <Text style={{ color: t.muted }}>載入失敗：{p.error}</Text>}
          {!p.error && list === null && <Text style={{ color: t.muted }}>載入中…</Text>}
          {!p.error && list?.length === 0 && p.failed.length === 0 && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
          {next && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <Text style={{ color: t.accent, ...tabular }}>
                  {minsOf(next.e) === 0 ? (
                    <Text style={{ fontSize: 32, fontWeight: '800' }}>即將到站</Text>
                  ) : (
                    <>
                      <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.8 }}>{minsOf(next.e)}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700' }}> 分鐘</Text>
                    </>
                  )}
                </Text>
                <Text style={{ color: t.muted, fontSize: 15, ...tabular }}>{next.e.eta!.slice(11, 16)}</Text>
                <EtaTags e={next.e} multiCompany={p.multiCompany} />
              </View>
            </View>
          )}
          {next?.where && <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>{next.where}</Text>}
          {rest.length > 0 && (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.line, gap: 6 }}>
              {rest.map(({ e, where }, i) => {
                const v = e.variant;
                const other = !isMine(e);
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: other ? 0.5 : 1 }}>
                    <Text style={{ width: 52, fontSize: 17, fontWeight: '700', color: t.text, ...tabular }}>{minsOf(e) === 0 ? '即將' : `${minsOf(e)} 分`}</Text>
                    <Text style={{ width: 44, fontSize: 13, color: t.muted, ...tabular }}>{e.eta!.slice(11, 16)}</Text>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <EtaTags e={e} multiCompany={p.multiCompany} />
                      {other && v?.name && <Pill label={`${v.special ? shortName({ name: v.name }) : '正常路線'}${v.confidence === 'likely' ? '（推斷）' : ''}`} special={v.special} />}
                      {where && (
                        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: t.muted }}>
                          {where.replace(/^距離 /, '')}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {p.failed.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, borderRadius: 10, backgroundColor: t.specialSoft }}>
              <Icon name="warning" size={16} color={t.special} />
              <Text style={{ flex: 1, color: t.special, fontSize: 13 }}>
                {p.failed.map((c) => COMPANIES[c as Company]?.name ?? c).join('、')}資料暫時攞唔到，可能少咗班次，稍後會自動再試
              </Text>
            </View>
          )}
          {/* 動作列：喺到站時間下面（同網頁一樣） */}
          {(p.here || p.fav) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {p.here && <HereButton target={p.here} />}
              {p.fav && <FavStop target={p.fav} />}
            </View>
          )}
        </View>
      )}
    </View>
  );
});

function EtaTags({ e, multiCompany }: { e: Eta; multiCompany: boolean }) {
  return (
    <>
      {multiCompany && <CompanyTag companies={[e.company]} compact />}
      {e.scheduled && <ScheduledTag />}
    </>
  );
}

function FavStop({ target }: { target: Omit<Favorite, 'at'> }) {
  const t = useTheme();
  const [on, toggle] = useFavorite(target);
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brand : t.card }}
    >
      <Icon name={on ? 'star-fill' : 'star'} size={16} color={on ? t.onBrand : t.accent} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? t.onBrand : t.accent }}>{on ? '已收藏呢個站' : '收藏呢個站'}</Text>
    </Pressable>
  );
}
