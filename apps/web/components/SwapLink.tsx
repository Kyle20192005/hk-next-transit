'use client';
import { useRouter } from 'next/navigation';
import { nearestStopIndex } from '@hknt/core';
import Icon from './Icon';
import { openStopIndex } from '@/lib/events';

type Pt = { lat?: number; lng?: number };

/**
 * 轉方向（⇅）：打開咗站嘅話，自動打開對面方向最近（500 米內）嘅站，搭回程唔使再搵過。
 * 冇打開站就同以前一樣，只係轉方向。
 */
export default function SwapLink({ other, label, stops, otherStops }: { other: 'O' | 'I'; label: string; stops: Pt[]; otherStops: (Pt & { stopId: string })[] }) {
  const router = useRouter();
  const go = () => {
    const i = openStopIndex();
    const k = i === null ? -1 : nearestStopIndex(stops[i], otherStops);
    router.replace(`?dir=${other}${k >= 0 ? `&stop=${otherStops[k]!.stopId}` : ''}`, { scroll: false });
  };
  return (
    <button className="swap" onClick={go} aria-label={label}>
      <Icon name="swap" />
    </button>
  );
}
