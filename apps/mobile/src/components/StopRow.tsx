import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { shortName, type Dir, type Eta } from '@hknt/core';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Badge } from './Badge';

type Props = {
  index: number;
  route: string;
  stopId: string;
  dir: Dir;
  name: string;
  /** 用戶揀咗嘅走法；其他走法嘅班次會淡色顯示 */
  selectedVariantId: string | null;
  /** 由外面（地圖）要求打開：每次變就打開一次 */
  openSignal: number;
  onOpen: (index: number) => void;
};

const REFRESH_MS = 30_000;

export function StopRow({ index, route, stopId, dir, name, selectedVariantId, openSignal, onOpen }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 地圖要求打開：signal 變咗就打開（喺 render 入面調整 state，唔使 effect）
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const body = await api.eta(route, stopId);
        if (cancelled) return;
        setEtas(body.etas.filter((e) => e.dir === dir && e.eta));
        setError(null);
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
  }, [open, route, stopId, dir]);

  return (
    <View style={{ borderBottomWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
      <Pressable
        onPress={() => {
          if (!open) onOpen(index);
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 14, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ width: 28, color: t.muted }}>{index + 1}</Text>
        <Text style={{ flex: 1, color: t.text, fontSize: 16 }}>{name}</Text>
      </Pressable>
      {open && (
        <View style={{ paddingLeft: 54, paddingRight: 14, paddingBottom: 12, gap: 6 }}>
          {error && <Text style={{ color: t.muted }}>載入失敗：{error}</Text>}
          {!error && etas === null && <Text style={{ color: t.muted }}>載入中…</Text>}
          {!error && etas?.length === 0 && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
          {etas?.map((e, i) => {
            const mins = Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
            const v = e.variant;
            const other = Boolean(selectedVariantId && v?.variantId && v.variantId !== selectedVariantId);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: other ? 0.5 : 1 }}>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', minWidth: 64 }}>
                  {mins === 0 ? '即將' : `${mins} 分`}
                </Text>
                <Text style={{ color: t.muted }}>{e.eta!.slice(11, 16)}</Text>
                {v?.name && (
                  <Badge
                    label={`${v.special ? shortName({ name: v.name }) : '正常路線'}${v.confidence === 'likely' ? '（推斷）' : ''}`}
                    special={v.special}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
