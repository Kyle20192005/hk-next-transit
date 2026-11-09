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
  | 'plus'
  | 'folder'
 | 'share'
 | 'refresh'
  | 'minus'
  | 'info'
  | 'route'
  | 'bus'
  | 'warning'
  | 'navigate'
  | 'settings'
  | 'home'
  | 'train'
  | 'minibus'
  | 'ferry'
  | 'tram'
  | 'lrt';

/** duo：雙色（線條實色 + 同色淺填色），常用工具等大圖示用 */
export function Icon({ name, size = 22, color, duo = false }: { name: IconName; size?: number; color: string; duo?: boolean }) {
  const p = { stroke: color, strokeWidth: duo ? 1.9 : 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: duo ? color : 'none', fillOpacity: duo ? 0.2 : 1 };
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
      case 'home':
        return <Path {...p} d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />;
      case 'train':
        return (
          <>
            <Rect {...p} x={5.5} y={3.5} width={13} height={13} rx={3} />
            <Path {...p} d="M5.5 10.5h13M8.5 20.5l1.5-4M15.5 20.5l-1.5-4" />
            <Circle {...dot} cx={9} cy={13.5} r={0.9} />
            <Circle {...dot} cx={15} cy={13.5} r={0.9} />
          </>
        );
      case 'minibus':
        return (
          <>
            <Path {...p} d="M5.5 17.5H4.5a1 1 0 0 1-1-1V9a3 3 0 0 1 3-3h9.3a2 2 0 0 1 1.6.8l3.1 4.2v5.5a1 1 0 0 1-1 1h-1M9.5 17.5h5" />
            <Path {...p} d="M3.5 11h17M10 6v5" />
            <Circle {...p} cx={7.5} cy={17.5} r={1.8} />
            <Circle {...p} cx={16.5} cy={17.5} r={1.8} />
          </>
        );
      case 'ferry':
        return (
          <>
            <Path {...p} d="M3.5 13.5h17l-2.3 5H5.8l-2.3-5Z" />
            <Path {...p} d="M7 13.5V9.5h10v4M12 9.5V6M9 6h6" />
          </>
        );
      case 'tram':
        return (
          <>
            <Rect {...p} x={6} y={6.5} width={12} height={12} rx={2} />
            <Path {...p} d="M6 12.5h12M12 6.5V3.5M9 3.5h6M9 21l1-2.5M15 21l-1-2.5" />
          </>
        );
      case 'lrt':
        // 輕鐵：港鐵列車正面 + 人字形集電弓（同網頁一樣）
        return (
          <>
            <Path {...p} d="M9.5 3h5M12 3l-2.4 3.8M12 3l2.4 3.8" />
            <Rect {...p} x={5.5} y={6.8} width={13} height={11.7} rx={3} />
            <Path {...p} d="M5.5 12.2h13M8.5 21l1.2-2.5M15.5 21l-1.2-2.5" />
            <Circle {...dot} cx={9} cy={15.3} r={0.9} />
            <Circle {...dot} cx={15} cy={15.3} r={0.9} />
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
      case 'plus':
        return <Path {...p} d="M12 5v14M5 12h14" />;
      case 'share':
        return <Path {...p} d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />;
      case 'refresh':
        return <Path {...p} d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />;
      case 'folder':
        return <Path {...p} d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />;
      case 'minus':
        return <Path {...p} d="M5 12h14" />;
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
