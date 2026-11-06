import { Text } from 'react-native';
import { etaParts, etaRest } from '@hknt/core';
import { usePrefs } from '@/lib/prefs';
import { tabular, useTheme } from '@/lib/theme';

/**
 * 一行內嘅到站時間（附近、收藏、喺度搭得；同網頁 components/EtaInline.tsx 一樣）：大字第一班 + 細字後面幾班，
 * 跟設定「到站時間顯示」（分鐘／鐘數）。ats = 到站時間（毫秒）。
 */
export function EtaInline({ ats, now, size = 20, color }: { ats: number[]; now: number; size?: number; color?: string }) {
  const t = useTheme();
  const { etaFormat } = usePrefs();
  const first = etaParts(ats[0]!, now, etaFormat);
  const rest = etaRest(ats.slice(1), now, etaFormat);
  return (
    <>
      <Text style={{ color: color ?? t.accent, ...tabular }}>
        <Text style={{ fontSize: size, fontWeight: '800' }}>{first.main}</Text>
        {first.unit ? <Text style={{ fontSize: 13, fontWeight: '700' }}> {first.unit}</Text> : null}
      </Text>
      {rest ? <Text style={{ color: t.muted, fontSize: 12, ...tabular }}>{rest}</Text> : null}
    </>
  );
}
