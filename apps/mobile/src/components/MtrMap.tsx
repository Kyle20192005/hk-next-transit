import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
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
/** 要飛去嘅站（每次新 object 就做一次）：zoom = 搜尋（放大置中），否則只係睇唔到先移 */
export type MtrFocus = { sta: string; zoom: boolean };
/** 面板遮住咗嘅位（px） */
export type MtrInset = { right: number; bottom: number };
type Size = { w: number; h: number };
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px）。同網頁 MtrMap 一樣 */
const START_PX = 34;
const MIN_PX = 9;
const MAX_PX = 90;
const RING = '#23262b';
const STATIONS = mtrMapStations();
const NO_INSET: MtrInset = { right: 0, bottom: 0 };
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

/**
 * 變形：已畫好嘅 SVG 外面套住嘅 translate + scale（RN transform 以中心為原點）。
 * 拖、縮放、飛去個站嘅時候只改呢個（好似郁一張相，唔使重畫），放手先用新範圍重畫 SVG 一次。
 */
type Xf = { s: number; tx: number; ty: number };
const ID: Xf = { s: 1, tx: 0, ty: 0 };
/** 四邊畫多幾多出畫面外（拖嘅時候唔會即刻見到空白） */
const OVERSCAN = 0.3;
/** 拖緊嘅時候最多幾耐重畫一次（出咗已畫範圍、或者放大到矇） */
const REDRAW_MS = 250;
/** 一格細過幾多 px 就唔畫英文站名（字細過 4px 睇唔到，少畫一半字，重畫快啲） */
const EN_MIN_PX = 22;

/** 已畫好嘅範圍 V 加上變形 xf，畫面實際顯示緊嘅範圍 */
function effView(V: MapView, xf: Xf, s: Size): MapView {
  const k = s.w / V.w;
  const cx = s.w / 2;
  const cy = s.h / 2;
  return { x: V.x + (cx + (-cx - xf.tx) / xf.s) / k, y: V.y + (cy + (-cy - xf.ty) / xf.s) / k, w: V.w / xf.s };
}
/** 要顯示範圍 E，已畫好嘅係 V：要套幾多變形 */
function xfFor(V: MapView, E: MapView, s: Size): Xf {
  const k = s.w / V.w;
  const cx = s.w / 2;
  const cy = s.h / 2;
  const sc = V.w / E.w;
  return { s: sc, tx: -cx - sc * ((E.x - V.x) * k - cx), ty: -cy - sc * ((E.y - V.y) * k - cy) };
}

type AnimXf = { tx: Animated.Value; ty: Animated.Value; s: Animated.Value };
function pushXf(a: AnimXf, ref: RefObject<Xf>, n: Xf) {
  ref.current = n;
  a.tx.setValue(n.tx);
  a.ty.setValue(n.ty);
  a.s.setValue(n.s);
}

/** 手勢、動畫用嘅最新值同動作（PanResponder 只建一次） */
type Live = {
  size: Size;
  /** 而家畫面顯示緊嘅範圍 */
  eff: () => MapView | null;
  /** 即刻顯示範圍 E（只改變形）；redraw = 出咗已畫範圍或者放大到矇就安排重畫 */
  show: (E: MapView, redraw?: boolean) => void;
  /** 用而家嘅範圍重畫 SVG */
  commit: () => void;
  /** 動畫去範圍 E（以 (fx, fy) 為焦點），完咗重畫 */
  animateTo: (E: MapView, ms: number, fx: number, fy: number) => void;
  stopAnim: () => void;
  onStation: (sta: string) => void;
};

/**
 * 港鐵路綫圖（同網頁 components/rail/MtrMap.tsx 一樣嘅 core 資料同畫法）：一隻手指拖、兩隻手指放大縮細、撳站。
 * react-native-svg 每次改 viewBox 都要喺手機重畫成幅圖（百幾個站、幾百段字），逐格重畫會好卡：
 * 所以手勢同動畫期間只係郁已畫好嘅圖（Animated transform），放手先重畫一次（四邊多畫 30%，拖嘅時候唔會即刻見空白）。
 */
export function MtrMap({
  selected,
  onStation,
  focus = null,
  inset = NO_INSET,
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  focus?: MtrFocus | null;
  inset?: MtrInset;
}) {
  const t = useTheme();
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  /** SVG 畫緊嘅範圍（改佢 = 重畫） */
  const [view, setView] = useState<MapView | null>(null);
  const [anim] = useState<AnimXf>(() => ({ tx: new Animated.Value(0), ty: new Animated.Value(0), s: new Animated.Value(1) }));
  const xf = useRef<Xf>(ID);
  /** 同 xf 配對嘅已畫範圍（SVG 真係畫好咗先更新） */
  const base = useRef<{ view: MapView | null; size: Size }>({ view: null, size: { w: 0, h: 0 } });
  const lastDraw = useRef(0);
  const raf = useRef(0);

  // SVG 用新範圍畫好：將變形換算返相對新範圍（重畫期間手指郁咗都唔會跳）
  useLayoutEffect(() => {
    const b = base.current;
    if (view && b.view && b.size.w === size.w && b.size.h === size.h) pushXf(anim, xf, xfFor(view, effView(b.view, xf.current, size), size));
    else pushXf(anim, xf, ID);
    base.current = { view, size };
  }, [view, size, anim]);

  const eff = () => (base.current.view ? effView(base.current.view, xf.current, base.current.size) : null);
  const commit = () => {
    const E = eff();
    const V = base.current.view;
    if (!E || !V) return;
    lastDraw.current = Date.now();
    if (Math.abs(E.x - V.x) + Math.abs(E.y - V.y) + Math.abs(E.w - V.w) > 1e-4) setView(E);
  };
  const show = (E: MapView, redraw = true) => {
    const { view: V, size: S } = base.current;
    if (!V || !S.w) return;
    const c = clamp(E, S);
    pushXf(anim, xf, xfFor(V, c, S));
    if (!redraw || Date.now() - lastDraw.current < REDRAW_MS) return;
    const k = S.w / V.w;
    const mx = (S.w * OVERSCAN) / k;
    const my = (S.h * OVERSCAN) / k;
    const ch = (c.w * S.h) / S.w;
    const out = c.x < V.x - mx || c.y < V.y - my || c.x + c.w > V.x + V.w + mx || c.y + ch > V.y + (V.w * S.h) / S.w + my;
    // 放大到 1.6 倍以上，圖會開始矇
    if (out || c.w < V.w / 1.6) commit();
  };
  const stopAnim = () => cancelAnimationFrame(raf.current);
  const animateTo = (target: MapView, ms: number, fx: number, fy: number) => {
    const from = eff();
    const S = base.current.size;
    if (!from || !S.w) return;
    const to = clamp(target, S);
    // 插值「焦點」嘅世界座標同縮放（對數），焦點唔會飄
    const fc = { x: from.x + fx * (from.w / S.w), y: from.y + fy * (from.w / S.w) };
    const tc = { x: to.x + fx * (to.w / S.w), y: to.y + fy * (to.w / S.w) };
    const t0 = Date.now();
    stopAnim();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      const ww = from.w * (to.w / from.w) ** e;
      const c = { x: fc.x + (tc.x - fc.x) * e, y: fc.y + (tc.y - fc.y) * e };
      show({ x: c.x - fx * (ww / S.w), y: c.y - fy * (ww / S.w), w: ww }, false);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else commit();
    };
    raf.current = requestAnimationFrame(step);
  };

  const live = useRef<Live | null>(null);
  useLayoutEffect(() => {
    live.current = { size, eff, show, commit, animateTo, stopAnim, onStation };
  });

  // 飛去某個站（同網頁一樣）：搜尋就放大置中；撳站只喺俾面板遮住先移；面板高度變（載入完）只喺揀站 1.5 秒內跟
  const handled = useRef<{ focus: MtrFocus; at: number } | null>(null);
  const ready = view !== null;
  useEffect(() => {
    const L = live.current;
    const v = L?.eff();
    if (!L || !focus || !v || !size.w) return;
    const s = STATIONS.find((x) => x.code === focus.sta);
    if (!s) return;
    const first = handled.current?.focus !== focus;
    if (!first && Date.now() - handled.current!.at > 1500) return;
    if (first) handled.current = { focus, at: Date.now() };
    const cx = s.box.x + s.box.w / 2;
    const cy = s.box.y + s.box.h / 2;
    const visW = Math.max(80, size.w - inset.right);
    const visH = Math.max(80, size.h - inset.bottom);
    const w = focus.zoom ? Math.min(v.w, size.w / START_PX) : v.w;
    if (!focus.zoom) {
      const k = size.w / v.w;
      const sx = (cx - v.x) * k;
      const sy = (cy - v.y) * k;
      if (sx > 48 && sx < visW - 48 && sy > 48 && sy < visH - 48) return;
    }
    const k = w / size.w;
    L.animateTo({ x: cx - (visW / 2) * k, y: cy - (visH / 2) * k, w }, 380, visW / 2, visH / 2);
  }, [focus, inset.right, inset.bottom, size, ready]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

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
  const zoomBtn = (f: number) => {
    const v = eff();
    const fx = (size.w - inset.right) / 2;
    const fy = (size.h - inset.bottom) / 2;
    if (v) animateTo(zoomAt(v, size, f, fx, fy), 200, fx, fy);
  };
  const fitAll = () => {
    const w = Math.max(MTR_MAP_VIEW.width, MTR_MAP_VIEW.height / aspect);
    animateTo({ x: MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width / 2 - w / 2, y: MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height / 2 - (w * aspect) / 2, w }, 260, size.w / 2, size.h / 2);
  };
  const sel = selected ? STATIONS.find((s) => s.code === selected) : undefined;
  // 已畫範圍四邊各加 OVERSCAN
  const mx = Math.round(size.w * OVERSCAN);
  const my = Math.round(size.h * OVERSCAN);
  const k = view ? size.w / view.w : 1;

  return (
    <View onLayout={onLayout} style={{ flex: 1, overflow: 'hidden', backgroundColor: t.card }}>
      <GestureSurface live={live}>
        {view && size.w > 0 && (
          // pointerEvents none：觸點一律落喺外面嗰層（locationX 先係相對地圖）。外框中心 = 地圖中心（變形以中心為原點）
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', left: -mx, top: -my, width: size.w + 2 * mx, height: size.h + 2 * my, transform: [{ translateX: anim.tx }, { translateY: anim.ty }, { scale: anim.s }] }}
          >
            <Svg width={size.w + 2 * mx} height={size.h + 2 * my} viewBox={`${view.x - mx / k} ${view.y - my / k} ${(size.w + 2 * mx) / k} ${(size.h + 2 * my) / k}`}>
              <MapContent t={t} en={k >= EN_MIN_PX} />
              {/* 揀咗嘅站：重點色光圈 + 白心變黃 */}
              {sel && (
                <Circle
                  cx={sel.box.x + sel.box.w / 2}
                  cy={sel.box.y + sel.box.h / 2}
                  r={Math.max(sel.box.w, sel.box.h) / 2 + 0.22}
                  fill={t.accent}
                  fillOpacity={0.16}
                  stroke={t.accent}
                  strokeWidth={0.05}
                />
              )}
              {sel?.pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} fill={t.brand} />)}
            </Svg>
          </Animated.View>
        )}
      </GestureSurface>
      <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={{ position: 'absolute', left: 10, bottom: 8 + inset.bottom, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.card + 'cc' }}>
        <Text style={{ fontSize: 11, color: t.muted }}>© OpenStreetMap 貢獻者</Text>
      </Pressable>
      {/* 面板遮到地圖剩好矮：縮放掣打橫排，唔好頂穿上面；拉板全開（剩一條）就收埋 */}
      <View style={{ position: 'absolute', right: 12 + inset.right, bottom: 12 + inset.bottom, gap: 6, flexDirection: size.h - inset.bottom < 200 ? 'row' : 'column', display: size.h && size.h - inset.bottom < 110 ? 'none' : 'flex' }}>
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
function GestureSurface({ live, children }: { live: RefObject<Live | null>; children: React.ReactNode }) {
  const [responder] = useState(() => {
    let moved = 0;
    let last: { x: number; y: number } | null = null;
    let start: { x: number; y: number } | null = null;
    let pinch: number | null = null;
    const pt = (e: GestureResponderEvent, i = 0) => {
      const touch = e.nativeEvent.touches[i] ?? e.nativeEvent;
      return { x: touch.locationX, y: touch.locationY };
    };
    const end = () => {
      const L = live.current;
      if (!L) return;
      // 拖完：用新範圍重畫一次
      if (moved >= 8) return L.commit();
      const v = L.eff();
      if (!v || !start) return;
      // 撳：換算做地圖座標，搵撳中嘅站
      const k = v.w / L.size.w;
      const mx = v.x + start.x * k;
      const my = v.y + start.y * k;
      const pad = Math.max(0.25, 12 * k);
      const hit = STATIONS.find((s) => mx >= s.box.x - pad && mx <= s.box.x + s.box.w + pad && my >= s.box.y - pad && my <= s.box.y + s.box.h + pad);
      if (hit) L.onStation(hit.code);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current?.stopAnim();
        moved = 0;
        pinch = null;
        last = start = pt(e);
      },
      onPanResponderMove: (e) => {
        const L = live.current;
        const v = L?.eff();
        if (!L || !v || !L.size.w) return;
        if (e.nativeEvent.touches.length >= 2) {
          const a = pt(e, 0);
          const b = pt(e, 1);
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          moved += 100; // 兩隻手指唔當撳
          if (pinch) L.show(zoomAt(v, L.size, d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2));
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
        const k = v.w / L.size.w;
        L.show({ ...v, x: v.x - dx * k, y: v.y - dy * k });
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: () => {
        moved = Math.max(moved, 8);
        end();
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
const MapContent = memo(function MapContent({ t, en }: { t: Theme; en: boolean }) {
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
        <Station key={s.code} s={s} t={t} en={en} />
      ))}
    </G>
  );
});

function Station({ s, t, en }: { s: MtrMapStation; t: Theme; en: boolean }) {
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
      {en && (
        <>
          <SvgText x={lp.x} y={enY} textAnchor={lp.anchor} fontSize={0.18} fontWeight="500" fill={t.muted} stroke={t.card} strokeWidth={0.09} strokeLinejoin="round">
            {mtrStationEn(s.code)}
          </SvgText>
          <SvgText x={lp.x} y={enY} textAnchor={lp.anchor} fontSize={0.18} fontWeight="500" fill={t.muted}>
            {mtrStationEn(s.code)}
          </SvgText>
        </>
      )}
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
