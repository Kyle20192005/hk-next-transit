/**
 * 單卡／孖卡圖示（輕鐵站面板）：自己畫嘅輕鐵車卡側面，用輕鐵列車嘅顏色（銀白車身、車頂紅帶、深灰車窗、灰色車門同車底）；
 * 每卡頭尾各一個窗、中間兩個窗、兩道門，頂有集電弓，孖卡兩卡中間一條連接器。唔抄官方圖示。
 * 集電弓、車轆、連接器用 currentColor（跟主題，深色模式唔會睇唔到）。同 App src/components/LrtCars.tsx 同一套路徑同顏色。
 */
const H = 16;
const BODY = 'M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 L2.1 5.2 Q2.4 3.6 4 3.6 Z';
const C = { body: '#EEF0F2', edge: '#5F6670', red: '#C8102E', win: '#3B424B', door: '#8C939C', skirt: '#9AA1A9' };

/** 一卡闊 30；兩卡 61（中間隔 1，連接器 28.8–32.2） */
function Car({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M13 3.6 L15 1.2 L17 3.6" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      <line x1={13.2} y1={1.1} x2={16.8} y2={1.1} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <path d={BODY} fill={C.body} />
      <path d="M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28 5.7 H2 L2.1 5.2 Q2.4 3.6 4 3.6 Z" fill={C.red} />
      <path d="M1.5 10.6 H28.5 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 Z" fill={C.skirt} />
      <path d="M2.85 6.6 H6.4 V9.4 H2.45 Z M27.15 6.6 H23.6 V9.4 H27.55 Z" fill={C.win} />
      <rect x={11.2} y={6.6} width={3.4} height={2.8} rx={0.4} fill={C.win} />
      <rect x={15.4} y={6.6} width={3.4} height={2.8} rx={0.4} fill={C.win} />
      <rect x={7} y={6.4} width={3.2} height={6} rx={0.4} fill={C.door} />
      <rect x={19.8} y={6.4} width={3.2} height={6} rx={0.4} fill={C.door} />
      <path d="M8.6 6.4 V12.4 M21.4 6.4 V12.4" stroke={C.body} strokeWidth={0.5} />
      <path d={BODY} fill="none" stroke={C.edge} strokeWidth={0.8} />
      <circle cx={7.5} cy={13.9} r={1.4} fill="currentColor" />
      <circle cx={22.5} cy={13.9} r={1.4} fill="currentColor" />
    </g>
  );
}

export default function LrtCars({ n, size = 18 }: { n: number; size?: number }) {
  const two = n >= 2;
  const w = two ? 61 : 30;
  const label = two ? '孖卡' : '單卡';
  return (
    // 固定闊度（孖卡咁闊），單卡靠右，時間欄先對齊
    <span className="lrt-cars" style={{ width: (61 / H) * size }} title={label}>
      <svg viewBox={`0 0 ${w} ${H}`} height={size} width={(w / H) * size} role="img" aria-label={label}>
        <Car x={0} />
        {two && (
          <>
            <line x1={28.8} y1={10} x2={32.2} y2={10} stroke="currentColor" strokeWidth={1.2} />
            <Car x={31} />
          </>
        )}
      </svg>
    </span>
  );
}
