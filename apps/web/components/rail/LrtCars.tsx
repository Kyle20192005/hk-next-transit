/**
 * 單卡／孖卡圖示（輕鐵站面板）：自己畫嘅輕鐵車卡側面（頂有集電弓、車頭車尾斜身、車窗、中間車門、車轆），
 * 孖卡 = 兩卡中間一條連接器。用 currentColor（線條實色 + 淡色車身，同其他雙色圖示一樣），唔抄官方圖示。
 * 同 App src/components/LrtCars.tsx 同一套路徑。
 */
const H = 16;
/** 一卡闊 30；兩卡 61（中間隔 1，連接器 28.8–32.2） */
function Car({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M13 3.6 L15 1.2 L17 3.6" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinejoin="round" />
      <line x1={13.2} y1={1.1} x2={16.8} y2={1.1} stroke="currentColor" strokeWidth={1} strokeLinecap="round" />
      <path d="M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 L2.1 5.2 Q2.4 3.6 4 3.6 Z" fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1} />
      <path d="M2.9 5.4 H6.4 V8.6 H2.5 Z M27.1 5.4 H23.6 V8.6 H27.5 Z" fill="currentColor" fillOpacity={0.8} />
      <rect x={8} y={5.4} width={3.6} height={3.2} rx={0.5} fill="currentColor" fillOpacity={0.8} />
      <rect x={18.4} y={5.4} width={3.6} height={3.2} rx={0.5} fill="currentColor" fillOpacity={0.8} />
      <rect x={13.2} y={5.4} width={3.6} height={7} rx={0.5} fill="currentColor" fillOpacity={0.45} />
      <line x1={15} y1={5.4} x2={15} y2={12.4} stroke="currentColor" strokeWidth={0.6} />
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
