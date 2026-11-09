import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

/**
 * 單卡／孖卡圖示（輕鐵站面板，同網頁 components/rail/LrtCars.tsx 同一套路徑）：自己畫嘅輕鐵車卡側面
 * （頂有集電弓、車頭車尾斜身、車窗、中間車門、車轆），孖卡 = 兩卡中間一條連接器。唔抄官方圖示。
 */
const H = 16;
function Car({ x, c }: { x: number; c: string }) {
  return (
    <G transform={`translate(${x} 0)`}>
      <Path d="M13 3.6 L15 1.2 L17 3.6" fill="none" stroke={c} strokeWidth={0.9} strokeLinejoin="round" />
      <Line x1={13.2} y1={1.1} x2={16.8} y2={1.1} stroke={c} strokeWidth={1} strokeLinecap="round" />
      <Path d="M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 L2.1 5.2 Q2.4 3.6 4 3.6 Z" fill={c} fillOpacity={0.18} stroke={c} strokeWidth={1} />
      <Path d="M2.9 5.4 H6.4 V8.6 H2.5 Z M27.1 5.4 H23.6 V8.6 H27.5 Z" fill={c} fillOpacity={0.8} />
      <Rect x={8} y={5.4} width={3.6} height={3.2} rx={0.5} fill={c} fillOpacity={0.8} />
      <Rect x={18.4} y={5.4} width={3.6} height={3.2} rx={0.5} fill={c} fillOpacity={0.8} />
      <Rect x={13.2} y={5.4} width={3.6} height={7} rx={0.5} fill={c} fillOpacity={0.45} />
      <Line x1={15} y1={5.4} x2={15} y2={12.4} stroke={c} strokeWidth={0.6} />
      <Circle cx={7.5} cy={13.9} r={1.4} fill={c} />
      <Circle cx={22.5} cy={13.9} r={1.4} fill={c} />
    </G>
  );
}

export function LrtCars({ n, color, size = 18 }: { n: number; color: string; size?: number }) {
  const two = n >= 2;
  const w = two ? 61 : 30;
  return (
    // 固定闊度（孖卡咁闊），單卡靠右，時間欄先對齊
    <View accessible accessibilityRole="image" accessibilityLabel={two ? '孖卡' : '單卡'} style={{ width: (61 / H) * size, alignItems: 'flex-end' }}>
      <Svg viewBox={`0 0 ${w} ${H}`} width={(w / H) * size} height={size}>
        <Car x={0} c={color} />
        {two && (
          <>
            <Line x1={28.8} y1={10} x2={32.2} y2={10} stroke={color} strokeWidth={1.2} />
            <Car x={31} c={color} />
          </>
        )}
      </Svg>
    </View>
  );
}
