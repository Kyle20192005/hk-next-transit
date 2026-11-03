'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dir } from '@hknt/core';
import { FOCUS_STOP_EVENT, OPEN_STOP_EVENT } from '@/lib/events';
import StopRow from './StopRow';

type Props = {
  route: string;
  stops: { dir: Dir; stopId: string; name: string }[];
  selectedVariantId: string | null;
};

/** 站點列表：一次只開一個站；打開時地圖放大去嗰個站；地圖撳站時打開對應嘅站 */
export default function StopList({ route, stops, selectedVariantId }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const openStop = (i: number | null) => {
    setOpenIndex(i);
    if (i === null) return;
    window.dispatchEvent(new CustomEvent(FOCUS_STOP_EVENT, { detail: i }));
    // 等展開後先捲，等成個站（連到站時間）都睇到
    requestAnimationFrame(() => rows.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  useEffect(() => {
    const onOpen = (e: Event) => openStop((e as CustomEvent<number>).detail);
    window.addEventListener(OPEN_STOP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STOP_EVENT, onOpen);
  }, []);

  return (
    <ol className="stops">
      {stops.map((s, i) => (
        <StopRow
          key={`${s.dir}-${s.stopId}-${i}`}
          ref={(el) => {
            rows.current[i] = el;
          }}
          index={i}
          route={route}
          stopId={s.stopId}
          dir={s.dir}
          name={s.name}
          selectedVariantId={selectedVariantId}
          open={openIndex === i}
          onToggle={() => openStop(openIndex === i ? null : i)}
        />
      ))}
    </ol>
  );
}
