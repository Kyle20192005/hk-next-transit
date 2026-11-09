'use client';
import { LRT_BRAND, lrtStopName, mtrLine, mtrStationName } from '@hknt/core';
import Icon from '../Icon';

/**
 * 站面板頂「轉乘 [輕鐵] ›」／「轉乘 [屯馬綫] ›」（core rail-xfer.ts）：撳咗轉去另一幅路綫圖、飛去嗰個站並打開。
 * 標記同路綫圖上嗰個一樣（港鐵圖：輕鐵金色；輕鐵圖：屯馬綫色）。
 */
export function XferButton({ to, sta, onPick }: { to: 'lrt' | 'mtr'; sta: string; onPick: (sta: string) => void }) {
  const tml = mtrLine('TML')!;
  const tag = to === 'lrt' ? { text: LRT_BRAND.zh, bg: LRT_BRAND.color, fg: LRT_BRAND.ink } : { text: tml.zh, bg: tml.color, fg: tml.ink };
  const label = to === 'lrt' ? `轉乘輕鐵${lrtStopName(sta)}站` : `轉乘港鐵${tml.zh}${mtrStationName(sta)}站`;
  return (
    <button className="rail-xfer" onClick={() => onPick(sta)} aria-label={label} title={label}>
      轉乘
      <span className="rail-xfer-tag" style={{ background: tag.bg, color: tag.fg }}>
        {tag.text}
      </span>
      <Icon name="chevron-right" size={14} />
    </button>
  );
}
