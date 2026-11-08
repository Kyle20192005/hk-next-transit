'use client';
import { useState } from 'react';
import MtrMap from './MtrMap';
import MtrStationSheet from './MtrStationSheet';

/** 「路線」分頁 → 港鐵・輕鐵：路綫圖，撳站睇到站時間（輕鐵之後加） */
export default function RailView() {
  const [sta, setSta] = useState<string | null>(null);
  return (
    <div className="mtr-wrap">
      <MtrMap selected={sta} onStation={setSta} />
      {sta && <MtrStationSheet sta={sta} onClose={() => setSta(null)} />}
    </div>
  );
}
