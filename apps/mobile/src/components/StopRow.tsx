import { Pressable, Text, View } from 'react-native';
import { shortName, type Eta } from '@hknt/core';
import { useTheme } from '@/lib/theme';
import { Badge } from './Badge';

type Props = {
  index: number;
  name: string;
  open: boolean;
  onToggle: () => void;
  /** 打開咗先有：到站時間 */
  etas: Eta[] | null;
  /** 每班車而家喺邊（同 etas 對應），例如「距離 3 個站」 */
  whereLabels: (string | null)[] | null;
  error: string | null;
  now: number;
  selectedVariantId: string | null;
  /** 由打開咗嘅站去呢個站要幾多秒（只有後面嘅站先有） */
  travelSeconds: number | null;
  /** 下一班車預計幾時到呢個站（毫秒） */
  nextArrival: number | null;
};

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });

/** 一個站。開定收、到站時間由路線頁控制，一次只開一個。 */
export function StopRow({
  index, name, open, onToggle, etas, whereLabels, error, now, selectedVariantId, travelSeconds, nextArrival,
}: Props) {
  const t = useTheme();
  return (
    <View style={{ borderBottomWidth: 1, borderColor: t.line, backgroundColor: open ? t.brandSoft : t.card }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ width: 28, color: t.muted }}>{index + 1}</Text>
        <Text style={{ flex: 1, color: t.text, fontSize: 16 }}>{name}</Text>
        {travelSeconds !== null && travelSeconds > 0 && (
          <Text style={{ color: t.brand, fontSize: 13 }}>
            +{Math.max(1, Math.round(travelSeconds / 60))} 分
            {nextArrival !== null && <Text style={{ color: t.muted }}> · 約 {hhmm(nextArrival)}</Text>}
          </Text>
        )}
      </Pressable>
      {open && (
        <View style={{ paddingLeft: 54, paddingRight: 14, paddingBottom: 10, gap: 4 }}>
          {error && <Text style={{ color: t.muted }}>載入失敗：{error}</Text>}
          {!error && etas === null && <Text style={{ color: t.muted }}>載入中…</Text>}
          {!error && etas?.length === 0 && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
          {etas?.map((e, i) => {
            const mins = Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
            const v = e.variant;
            const other = Boolean(selectedVariantId && v?.variantId && v.variantId !== selectedVariantId);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: other ? 0.5 : 1 }}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', minWidth: 56 }}>
                  {mins === 0 ? '即將' : `${mins} 分`}
                </Text>
                <Text style={{ color: t.muted }}>{e.eta!.slice(11, 16)}</Text>
                {v?.name && (
                  <Badge
                    label={`${v.special ? shortName({ name: v.name }) : '正常路線'}${v.confidence === 'likely' ? '（推斷）' : ''}`}
                    special={v.special}
                  />
                )}
                {whereLabels?.[i] && <Text style={{ color: t.muted, fontSize: 13 }}>{whereLabels[i]}</Text>}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
