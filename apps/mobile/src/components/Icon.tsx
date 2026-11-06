import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** 統一線條圖示（同網頁版 components/Icon.tsx 同一套路徑） */
export type IconName =
  | 'back'
  | 'chevron-right'
  | 'chevron-down'
  | 'swap'
  | 'clock'
  | 'pin'
  | 'locate'
  | 'star'
  | 'star-fill'
  | 'search'
  | 'backspace'
  | 'close'
  | 'info'
  | 'route'
  | 'bus'
  | 'warning'
  | 'navigate'
  | 'settings';

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const dot = { fill: color, stroke: 'none' };
  const star = 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z';
  const body = (() => {
    switch (name) {
      case 'back':
        return <Path {...p} d="M15 18l-6-6 6-6" />;
      case 'chevron-right':
        return <Path {...p} d="M9 6l6 6-6 6" />;
      case 'chevron-down':
        return <Path {...p} d="M6 9l6 6 6-6" />;
      case 'swap':
        return (
          <>
            <Path {...p} d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5" />
            <Path {...p} d="M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5" />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle {...p} cx={12} cy={12} r={8.5} />
            <Path {...p} d="M12 7.5V12l3 2" />
          </>
        );
      case 'navigate':
        return <Path {...p} d="M4.5 11.2 19.5 4.5l-6.7 15-1.9-6.4-6.4-1.9Z" />;
      case 'settings':
        return (
          <>
            <Path {...p} d="M4 7h9M17 7h3M4 17h3M11 17h9" />
            <Circle {...p} cx={15} cy={7} r={2.2} />
            <Circle {...p} cx={9} cy={17} r={2.2} />
          </>
        );
      case 'pin':
        return (
          <>
            <Path {...p} d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
            <Circle {...p} cx={12} cy={10} r={2.3} />
          </>
        );
      case 'locate':
        return (
          <>
            <Circle {...p} cx={12} cy={12} r={6.5} />
            <Circle {...dot} cx={12} cy={12} r={2} />
            <Path {...p} d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          </>
        );
      case 'star':
        return <Path {...p} d={star} />;
      case 'star-fill':
        return <Path {...p} fill={color} d={star} />;
      case 'search':
        return (
          <>
            <Circle {...p} cx={11} cy={11} r={6.5} />
            <Path {...p} d="M16 16l4.5 4.5" />
          </>
        );
      case 'backspace':
        return (
          <>
            <Path {...p} d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7 6-7Z" />
            <Path {...p} d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
          </>
        );
      case 'close':
        return <Path {...p} d="M6 6l12 12M18 6L6 18" />;
      case 'info':
        return (
          <>
            <Circle {...p} cx={12} cy={12} r={8.5} />
            <Path {...p} d="M12 11v5" />
            <Circle {...dot} cx={12} cy={8} r={1} />
          </>
        );
      case 'route':
        return (
          <>
            <Circle {...p} cx={6} cy={18} r={2.2} />
            <Circle {...p} cx={18} cy={6} r={2.2} />
            <Path {...p} d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
          </>
        );
      case 'bus':
        return (
          <>
            <Rect {...p} x={5} y={3.5} width={14} height={14} rx={3} />
            <Path {...p} d="M5 11h14M8 17.5V20M16 17.5V20" />
            <Circle {...dot} cx={8.5} cy={14.3} r={0.9} />
            <Circle {...dot} cx={15.5} cy={14.3} r={0.9} />
          </>
        );
      case 'warning':
        return (
          <>
            <Path {...p} d="M12 4l9 16H3l9-16Z" />
            <Path {...p} d="M12 10v4.5" />
            <Circle {...dot} cx={12} cy={17.3} r={1} />
          </>
        );
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

/** 實心巴士（公司標籤、時間線同地圖上嘅巴士，同網頁 BusIcon 一樣） */
export function BusGlyph({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10Zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM18 11H6V6h12v5Z"
      />
    </Svg>
  );
}
