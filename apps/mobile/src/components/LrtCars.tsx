import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

/**
 * 單卡／孖卡圖示（輕鐵站面板，同網頁 components/rail/LrtCars.tsx 同一套路徑同顏色）：自己畫嘅輕鐵車卡側面，
 * 輕鐵列車顏色（銀白車身、車頂紅帶、深灰車窗、灰色車門同車底）；每卡頭尾各一個窗、中間兩個窗、兩道門，頂有集電弓，
 * 孖卡兩卡中間一條連接器。集電弓、車轆、連接器用 color（跟主題）。唔抄官方圖示。
 */
const H = 16;
const BODY = 'M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 L2.1 5.2 Q2.4 3.6 4 3.6 Z';
const C = { body: '#EEF0F2', edge: '#5F6670', red: '#C8102E', win: '#3B424B', door: '#8C939C', skirt: '#9AA1A9' };

function Car({ x, c }: { x: number; c: string }) {
  return (
    <G transform={`translate(${x} 0)`}>
      <Path d="M13 3.6 L15 1.2 L17 3.6" fill="none" stroke={c} strokeWidth={0.9} strokeLinejoin="round" />
      <Line x1={13.2} y1={1.1} x2={16.8} y2={1.1} stroke={c} strokeWidth={1} strokeLinecap="round" />
      <Path d={BODY} fill={C.body} />
      <Path d="M4 3.6 H26 Q27.6 3.6 27.9 5.2 L28 5.7 H2 L2.1 5.2 Q2.4 3.6 4 3.6 Z" fill={C.red} />
      <Path d="M1.5 10.6 H28.5 L28.8 11 Q29 12.4 27.6 12.4 H2.4 Q1 12.4 1.2 11 Z" fill={C.skirt} />
      <Path d="M2.85 6.6 H6.4 V9.4 H2.45 Z M27.15 6.6 H23.6 V9.4 H27.55 Z" fill={C.win} />
      <Rect x={11.2} y={6.6} width={3.4} height={2.8} rx={0.4} fill={C.win} />
      <Rect x={15.4} y={6.6} width={3.4} height={2.8} rx={0.4} fill={C.win} />
      <Rect x={7} y={6.4} width={3.2} height={6} rx={0.4} fill={C.door} />
      <Rect x={19.8} y={6.4} width={3.2} height={6} rx={0.4} fill={C.door} />
      <Path d="M8.6 6.4 V12.4 M21.4 6.4 V12.4" stroke={C.body} strokeWidth={0.5} />
      <Path d={BODY} fill="none" stroke={C.edge} strokeWidth={0.8} />
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
