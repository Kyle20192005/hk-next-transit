import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Dir, Eta } from '@hknt/core';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { shortName } from '@/lib/variant';
import { Badge } from './Badge';

type Props = {
  seq: number; route: string; stopId: string; dir: Dir; name: string;
  onlyVariants: string[]; onlySpecial: boolean;
};

const REFRESH_MS = 30_000;

export function StopRow({ seq, route, stopId, dir, name, onlyVariants, onlySpecial }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const body = await api.eta(route, stopId);
      setEtas(body.etas.filter((e) => e.dir === dir && e.eta));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setNow(Date.now());
  }, [route, stopId, dir]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [open, load]);

  return (
    <View style={{ borderBottomWidth: 1, borderColor: t.line }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 14, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ width: 28, color: t.muted }}>{seq}</Text>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 16 }}>{name}</Text>
          {onlyVariants.length > 0 && <Badge label={`只限${onlyVariants.join('、')}`} special={onlySpecial} />}
        </View>
      </Pressable>
      {open && (
        <View style={{ paddingLeft: 54, paddingRight: 14, paddingBottom: 12, gap: 6 }}>
          {error && <Text style={{ color: t.muted }}>載入失敗：{error}</Text>}
          {!error && etas === null && <Text style={{ color: t.muted }}>載入中…</Text>}
          {!error && etas?.length === 0 && <Text style={{ color: t.muted }}>暫時冇班次</Text>}
          {etas?.map((e, i) => {
            const mins = Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
            const v = e.variant;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', minWidth: 64 }}>
                  {mins === 0 ? '即將' : `${mins} 分`}
                </Text>
                <Text style={{ color: t.muted }}>{e.eta!.slice(11, 16)}</Text>
                {v?.name && (
                  <Badge label={`${shortName({ name: v.name })}${v.confidence === 'likely' ? '（推斷）' : ''}`} special={v.special} />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
