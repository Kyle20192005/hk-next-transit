'use client';
import { etaParts, etaRest } from '@hknt/core';
import { usePrefs } from '@/lib/prefs';

/**
 * 一行內嘅到站時間（附近、收藏、喺度搭得）：大字第一班 + 細字後面幾班，跟設定「到站時間顯示」（分鐘／鐘數）。
 * ats = 到站時間（毫秒）。
 */
export default function EtaInline({ ats, now, restClass = 'muted', sep = ' · ' }: { ats: number[]; now: number; restClass?: string; sep?: string }) {
  const { etaFormat } = usePrefs();
  const first = etaParts(ats[0]!, now, etaFormat);
  const rest = etaRest(ats.slice(1), now, etaFormat);
  return (
    <>
      <b>{first.main}</b>
      {first.unit && <small> {first.unit}</small>}
      {rest && (
        <small className={restClass}>
          {sep}
          {rest}
        </small>
      )}
    </>
  );
}
