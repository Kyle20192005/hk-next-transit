import { memo, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import {
  MTR_LINES,
  MTR_MAP_DOT_R,
  MTR_MAP_GAP,
  MTR_MAP_LEGEND,
  MTR_MAP_LEGEND_SYMBOLS,
  MTR_MAP_LINES,
  MTR_MAP_LINKS,
  MTR_MAP_REGIONS,
  MTR_MAP_RING,
  MTR_MAP_TICK,
  MTR_MAP_VIEW,
  MTR_MAP_WATER,
  mtrLabelPos,
  mtrLine,
  mtrLinePathD,
  mtrMapStations,
  mtrRoundPathD,
  mtrStationEn,
  mtrStationName,
  type MtrMapStation,
} from '@hknt/core';
import { radius, shadow, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';

type MapView = { x: number; y: number; w: number };
type Size = { w: number; h: number };
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px）。同網頁 MtrMap 一樣 */
const START_PX = 34;
const MIN_PX = 9;
const MAX_PX = 90;
const RING = '#23262b';
const STATIONS = mtrMapStations();
/** Expo web 預覽 SVG 字預設係襯線體；手機 App 唔設（用系統字） */
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "PingFang HK", sans-serif' : undefined;

/** 唔准拖到成幅圖離開畫面（留返一半）；縮放有上下限 */
function clamp(v: MapView, s: Size): MapView {
  const aspect = s.w ? s.h / s.w : 1;
  const w = Math.min(s.w / MIN_PX, Math.max(s.w / MAX_PX, v.w));
  const h = w * aspect;
  const { minX, minY, width, height } = MTR_MAP_VIEW;
  const x = Math.min(minX + width - w / 2, Math.max(minX - w / 2, v.x));
  const y = Math.min(minY + height - h / 2, Math.max(minY - h / 2, v.y));
  return { x, y, w };
}
/** 以畫面上 (px, py) 為中心縮放 factor 倍（> 1 放大） */
function zoomAt(v: MapView, s: Size, factor: number, px: number, py: number): MapView {
  const w = v.w / factor;
  const ux = v.x + (px / s.w) * v.w;
  const uy = v.y + (py / s.w) * v.w;
  return clamp({ x: ux - (px / s.w) * w, y: uy - (py / s.w) * w, w }, s);
}

/** 手勢 callback 用嘅最新值（PanResponder 只建一次） */
type Live = { view: MapView | null; size: Size; setView: (v: MapView) => void; onStation: (sta: string) => void };

/**
 * 港鐵路綫圖（同網頁 components/rail/MtrMap.tsx 一樣嘅 core 資料同畫法）：一隻手指拖、兩隻手指放大縮細、撳站。
 * 用 viewBox 做平移縮放（每次郁都重畫，站名喺任何大細都清楚）；地圖內容 memo 住，郁嘅時候 React 唔使再砌。
 */
export function MtrMap({ selected, onStation }: { selected: string | null; onStation: (sta: string) => void }) {
  const t = useTheme();
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<MapView | null>(null);
  const live = useRef<Live>({ view, size, setView, onStation });
  useLayoutEffect(() => {
    live.current = { view, size, setView, onStation };
  }, [view, size, onStation]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    if (!view && width) {
      // 第一次以九龍為中心
      const w = Math.min(MTR_MAP_VIEW.width, width / START_PX);
      const h = (w * height) / width;
      setView({ x: 16.5 - w / 2, y: 13 - h / 2, w });
    }
  };

  const aspect = size.w ? size.h / size.w : 1;
  const zoomBtn = (f: number) => view && setView(zoomAt(view, size, f, size.w / 2, size.h / 2));
  const fitAll = () => {
    const w = Math.max(MTR_MAP_VIEW.width, MTR_MAP_VIEW.height / aspect);
    setView(clamp({ x: MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width / 2 - w / 2, y: MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height / 2 - (w * aspect) / 2, w }, size));
  };
  const sel = selected ? STATIONS.find((s) => s.code === selected) : undefined;

  return (
    <View onLayout={onLayout} style={{ flex: 1, overflow: 'hidden', backgroundColor: t.card }}>
      <GestureSurface live={live}>
        {view && size.w > 0 && (
          // pointerEvents none：觸點一律落喺外面嗰層（locationX 先係相對地圖）
          <Svg width={size.w} height={size.h} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} pointerEvents="none">
            <MapContent t={t} />
            {/* 揀咗嘅站：白心變黃 */}
            {sel?.pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} fill={t.brand} />)}
          </Svg>
        )}
      </GestureSurface>
      <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={{ position: 'absolute', left: 10, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.card + 'cc' }}>
        <Text style={{ fontSize: 11, color: t.muted }}>© OpenStreetMap 貢獻者</Text>
      </Pressable>
      <View style={{ position: 'absolute', right: 12, bottom: 12, gap: 6 }}>
        <ZoomButton t={t} onPress={() => zoomBtn(1.4)} label="放大">
          <Icon name="plus" size={18} color={t.text} />
        </ZoomButton>
        <ZoomButton t={t} onPress={() => zoomBtn(1 / 1.4)} label="縮細">
          <Icon name="minus" size={18} color={t.text} />
        </ZoomButton>
        <ZoomButton t={t} onPress={fitAll} label="睇成幅圖">
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.text }}>全圖</Text>
        </ZoomButton>
      </View>
    </View>
  );
}

/** 手勢層：一隻手指拖、兩隻手指縮放、輕撳揀站（撳中嘅範圍大過站圈少少） */
function GestureSurface({ live, children }: { live: RefObject<Live>; children: React.ReactNode }) {
  const [responder] = useState(() => {
    let moved = 0;
    let last: { x: number; y: number } | null = null;
    let start: { x: number; y: number } | null = null;
    let pinch: number | null = null;
    const pt = (e: GestureResponderEvent, i = 0) => {
      const touch = e.nativeEvent.touches[i] ?? e.nativeEvent;
      return { x: touch.locationX, y: touch.locationY };
    };
    const apply = (v: MapView) => {
      live.current.view = v;
      live.current.setView(v);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        moved = 0;
        pinch = null;
        last = start = pt(e);
      },
      onPanResponderMove: (e) => {
        const { view: v, size } = live.current;
        if (!v || !size.w) return;
        if (e.nativeEvent.touches.length >= 2) {
          const a = pt(e, 0);
          const b = pt(e, 1);
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          moved += 100; // 兩隻手指唔當撳
          if (pinch) apply(zoomAt(v, size, d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2));
          pinch = d;
          last = null;
          return;
        }
        const p = pt(e);
        const prev = last;
        pinch = null;
        last = p;
        if (!prev) return;
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        const k = v.w / size.w;
        apply(clamp({ ...v, x: v.x - dx * k, y: v.y - dy * k }, size));
      },
      onPanResponderRelease: () => {
        const { view: v, size, onStation } = live.current;
        if (!v || !start || moved >= 8) return;
        // 撳：換算做地圖座標，搵撳中嘅站
        const k = v.w / size.w;
        const mx = v.x + start.x * k;
        const my = v.y + start.y * k;
        const pad = Math.max(0.25, 12 * k);
        const hit = STATIONS.find((s) => mx >= s.box.x - pad && mx <= s.box.x + s.box.w + pad && my >= s.box.y - pad && my <= s.box.y + s.box.h + pad);
        if (hit) onStation(hit.code);
      },
    });
  });
  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      {children}
    </View>
  );
}

function ZoomButton({ t, onPress, label, children }: { t: Theme; onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 40, height: 40, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', backgroundColor: t.card, ...shadow }}>
      {children}
    </Pressable>
  );
}

/** 地圖內容（海、地區名、圖例、綫、連接綫、站、站名）：只跟主題變，郁地圖唔使再砌 */
const MapContent = memo(function MapContent({ t }: { t: Theme }) {
  const waterD = MTR_MAP_WATER.map((w) => `${mtrRoundPathD(w, [], 0.3)} Z`).join(' ');
  return (
    <G fontFamily={FONT}>
      <Path d={waterD} fill={t.water} fillRule="evenodd" />
      {MTR_MAP_REGIONS.map((r) => (
        <G key={r.zh}>
          <SvgText x={r.at[0]} y={r.at[1]} textAnchor="middle" fontSize={0.62} fontWeight="700" letterSpacing={0.15} fill={t.muted} opacity={0.32}>
            {r.zh}
          </SvgText>
          <SvgText x={r.at[0]} y={r.at[1] + 0.42} textAnchor="middle" fontSize={0.26} fill={t.muted} opacity={0.4}>
            {r.en}
          </SvgText>
        </G>
      ))}
      <Legend t={t} />
      {MTR_MAP_LINES.flatMap((l) =>
        l.paths.map((p, i) => {
          const dashed = l.dashed?.includes(i);
          return (
            <Path
              key={`${l.line}-${i}`}
              d={mtrLinePathD(p)}
              fill="none"
              stroke={mtrLine(l.line)?.color}
              strokeWidth={MTR_MAP_GAP}
              strokeLinecap={dashed ? 'butt' : 'round'}
              strokeLinejoin="round"
              strokeDasharray={dashed ? [0.22, 0.14] : undefined}
            />
          );
        }),
      )}
      {MTR_MAP_LINKS.map(({ a, b, dashed }) => {
        const sa = STATIONS.find((s) => s.code === a);
        const sb = STATIONS.find((s) => s.code === b);
        if (!sa || !sb) return null;
        let best: [readonly number[], readonly number[]] = [sa.pts[0]!, sb.pts[0]!];
        for (const p of sa.pts) for (const q of sb.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(best[0][0]! - best[1][0]!, best[0][1]! - best[1][1]!)) best = [p, q];
        return <Line key={`${a}-${b}`} x1={best[0][0]} y1={best[0][1]} x2={best[1][0]} y2={best[1][1]} stroke={RING} strokeWidth={dashed ? 0.06 : 0.05} strokeDasharray={dashed ? [0.12, 0.08] : undefined} />;
      })}
      {STATIONS.map((s) => (
        <Station key={s.code} s={s} t={t} />
      ))}
    </G>
  );
});

function Station({ s, t }: { s: MtrMapStation; t: Theme }) {
  const lp = mtrLabelPos(s.box, s.label, 0.14 + s.labelGap);
  const zhY = lp.baseline === 'top' ? lp.y + 0.3 : lp.baseline === 'bottom' ? lp.y - 0.22 : lp.y - 0.02;
  const enY = zhY + 0.25;
  // 轉車站先有綫色短棒（分岔站雙圈但同一條綫，唔使）；短棒沿住「8」字方向，每條長一個 G，相鄰黐埋
  const inter = s.lines.length > 1;
  const a = s.pts[0]!;
  const far = s.pts.reduce((m, p) => (Math.hypot(p[0] - a[0], p[1] - a[1]) > Math.hypot(m[0] - a[0], m[1] - a[1]) ? p : m), a);
  const len = Math.hypot(far[0] - a[0], far[1] - a[1]) || 1;
  const ux = ((far[0] - a[0]) / len) * (MTR_MAP_TICK.len / 2);
  const uy = ((far[1] - a[1]) / len) * (MTR_MAP_TICK.len / 2);
  return (
    <G>
      {s.pts.map((p, i) => (
        <Circle key={`r${i}`} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R} fill={RING} />
      ))}
      {s.pts.map((p, i) => (
        <Circle key={`f${i}`} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} fill="#fff" />
      ))}
      {inter && s.pts.map((p, i) => <Line key={`t${i}`} x1={p[0] - ux} y1={p[1] - uy} x2={p[0] + ux} y2={p[1] + uy} stroke={mtrLine(s.lines[i]!)?.color} strokeWidth={MTR_MAP_TICK.width} />)}
      {/* 站名：先畫一層底色描邊（似網頁 paint-order: stroke），再畫字 */}
      <SvgText x={lp.x} y={zhY} textAnchor={lp.anchor} fontSize={0.3} fontWeight="700" fill={t.text} stroke={t.card} strokeWidth={0.09} strokeLinejoin="round">
        {mtrStationName(s.code)}
      </SvgText>
      <SvgText x={lp.x} y={zhY} textAnchor={lp.anchor} fontSize={0.3} fontWeight="700" fill={t.text}>
        {mtrStationName(s.code)}
      </SvgText>
      <SvgText x={lp.x} y={enY} textAnchor={lp.anchor} fontSize={0.18} fontWeight="500" fill={t.muted} stroke={t.card} strokeWidth={0.09} strokeLinejoin="round">
        {mtrStationEn(s.code)}
      </SvgText>
      <SvgText x={lp.x} y={enY} textAnchor={lp.anchor} fontSize={0.18} fontWeight="500" fill={t.muted}>
        {mtrStationEn(s.code)}
      </SvgText>
    </G>
  );
}

/** 圖例（同網頁 MapLegend 一樣）：綫兩欄，下面五個符號 */
function Legend({ t }: { t: Theme }) {
  const L = MTR_MAP_LEGEND;
  const col = (i: number) => 0.4 + i * 5.3;
  const rowY = (i: number) => 1.3 + i * 0.62;
  const symY = (i: number) => rowY(5) + 0.12 + i * 0.62;
  const R = MTR_MAP_DOT_R;
  const label = (x: number, y: number, zh: string, en: string) => (
    <SvgText x={x + 1.05} y={y + 0.1} fontSize={0.26} fontWeight="600" fill={t.text}>
      {zh}
      <TSpan dx={0.15} fontSize={0.17} fontWeight="500" fill={t.muted}>
        {en}
      </TSpan>
    </SvgText>
  );
  return (
    <G transform={`translate(${L.x} ${L.y})`}>
      <Rect width={L.w} height={L.h} rx={0.3} fill={t.card} stroke={t.line} strokeWidth={0.04} />
      <SvgText x={0.4} y={0.68} fontSize={0.32} fontWeight="700" fill={t.text}>
        圖例
        <TSpan dx={0.15} fontSize={0.17} fontWeight="500" fill={t.muted}>
          Legend
        </TSpan>
      </SvgText>
      {MTR_LINES.map((l, i) => {
        const x = col(Math.floor(i / 5));
        const y = rowY(i % 5);
        return (
          <G key={l.code}>
            <Line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={l.color} strokeWidth={MTR_MAP_GAP} strokeLinecap="round" />
            {label(x, y, l.zh, l.en)}
          </G>
        );
      })}
      {MTR_MAP_LEGEND_SYMBOLS.map((sym, i) => {
        const x = col(i % 2);
        const y = symY(Math.floor(i / 2));
        let icon: React.ReactNode;
        if (sym.kind === 'station')
          icon = (
            <>
              <Circle cx={x + 0.4} cy={y} r={R} fill={RING} />
              <Circle cx={x + 0.4} cy={y} r={R - MTR_MAP_RING} fill="#fff" />
            </>
          );
        else if (sym.kind === 'interchange') {
          const a = x + 0.4 - MTR_MAP_GAP / 2;
          const b = x + 0.4 + MTR_MAP_GAP / 2;
          icon = (
            <>
              <Circle cx={a} cy={y} r={R} fill={RING} />
              <Circle cx={b} cy={y} r={R} fill={RING} />
              <Circle cx={a} cy={y} r={R - MTR_MAP_RING} fill="#fff" />
              <Circle cx={b} cy={y} r={R - MTR_MAP_RING} fill="#fff" />
              <Line x1={a - MTR_MAP_GAP / 2} y1={y} x2={a + MTR_MAP_GAP / 2} y2={y} stroke={MTR_LINES[0]!.color} strokeWidth={MTR_MAP_TICK.width} />
              <Line x1={b - MTR_MAP_GAP / 2} y1={y} x2={b + MTR_MAP_GAP / 2} y2={y} stroke={MTR_LINES[1]!.color} strokeWidth={MTR_MAP_TICK.width} />
            </>
          );
        } else if (sym.kind === 'link') icon = <Line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={RING} strokeWidth={0.05} />;
        else if (sym.kind === 'walk') icon = <Line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={RING} strokeWidth={0.06} strokeDasharray={[0.12, 0.08]} />;
        else icon = <Line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={MTR_LINES.find((l) => l.code === 'EAL')!.color} strokeWidth={MTR_MAP_GAP} strokeDasharray={[0.22, 0.14]} />;
        return (
          <G key={sym.kind}>
            {icon}
            {label(x, y, sym.zh, sym.en)}
          </G>
        );
      })}
    </G>
  );
}
