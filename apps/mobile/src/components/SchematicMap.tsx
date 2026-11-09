import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Linking, PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Canvas, Group, Picture, type SkPicture } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { radius, shadow, useTheme, type Theme } from '@/lib/theme';
import { Icon } from './Icon';

type MapView = { x: number; y: number; w: number };
/** 要飛去嘅站（每次新 object 就做一次）：zoom = 搜尋（放大置中），否則只係睇唔到先移 */
export type MapFocus = { sta: string; zoom: boolean };
/** 面板遮住咗嘅位（px） */
export type MapInset = { right: number; bottom: number };
export type MapBounds = { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };
/** 浮喺站上面嘅 RN 元件（車費起點／終點標記、揀起點終點嘅彈出選單）：x、y = 站頂中間（地圖座標）；interactive = 撳得（否則手勢照落地圖） */
export type MapPinAt = { key: string; x: number; y: number; node: ReactNode; interactive?: boolean };
type Size = { w: number; h: number };
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px）。同網頁 useMapView 一樣 */
const START_PX = 34;
const MAX_PX = 90;
const NO_INSET: MapInset = { right: 0, bottom: 0 };
const NO_NEAR: string[] = [];
const NO_PINS: MapPinAt[] = [];

type Cfg = { bounds: MapBounds; minPx: number; inset: MapInset };
/** 唔准拖到成幅圖離開畫面（留返一半；面板遮住咗嘅位唔計）；縮放有上下限 */
function clamp(v: MapView, s: Size, c: Cfg): MapView {
  const aspect = s.w ? s.h / s.w : 1;
  const w = Math.min(s.w / c.minPx, Math.max(s.w / MAX_PX, v.w));
  const h = w * aspect;
  const k = s.w ? w / s.w : 0;
  const wv = Math.max(80, s.w - c.inset.right) * k;
  const hv = Math.max(80, s.h - c.inset.bottom) * k;
  const { minX, minY, width, height } = c.bounds;
  const x = Math.min(minX + width - wv / 2, Math.max(minX - w / 2, v.x));
  const y = Math.min(minY + height - hv / 2, Math.max(minY - h / 2, v.y));
  return { x, y, w };
}
/** 以畫面上 (px, py) 為中心縮放 factor 倍（> 1 放大） */
function zoomAt(v: MapView, s: Size, c: Cfg, factor: number, px: number, py: number): MapView {
  const w = v.w / factor;
  const ux = v.x + (px / s.w) * v.w;
  const uy = v.y + (py / s.w) * v.w;
  return clamp({ x: ux - (px / s.w) * w, y: uy - (py / s.w) * w, w }, s, c);
}

/** 手勢、動畫用嘅最新值同動作（PanResponder 只建一次） */
type Live = {
  size: Size;
  cfg: Cfg;
  /** 而家畫面顯示緊嘅範圍 */
  eff: () => MapView | null;
  /** 即刻顯示範圍 E */
  show: (E: MapView) => void;
  stopAnim: () => void;
  onStation: (sta: string) => void;
  /** 地圖座標 (mx, my) 撳中邊個站（pad = 撳中範圍大過站幾多） */
  hit: (mx: number, my: number, pad: number) => string | null;
};

/**
 * 示意圖（港鐵、輕鐵路綫圖）共用：一隻手指拖、兩隻手指放大縮細、撳站、飛去個站、縮放掣、全圖。
 * 用 Skia：成幅圖開頁時記錄一次（picture，SkPicture），之後拖、縮放、飛去個站都只係改一個變形（Reanimated shared value），
 * GPU 每格照住新位置將份記錄再畫一次，唔使重新排版或者重畫 React；向量畫，放幾大都清楚。
 * overlay：揀咗、附近嘅站（Skia 元素，同地圖一齊變形）。
 */
export function SchematicMap({
  bounds,
  start,
  minPx,
  picture,
  hit,
  locate,
  overlay,
  attribution = false,
  selected,
  onStation,
  focus = null,
  inset = NO_INSET,
  near = NO_NEAR,
  pins = NO_PINS,
}: {
  bounds: MapBounds;
  /** 開頁中心（地圖座標） */
  start: { x: number; y: number };
  minPx: number;
  picture: SkPicture;
  hit: (mx: number, my: number, pad: number) => string | null;
  locate: (sta: string) => { x: number; y: number } | null;
  overlay: (selected: string | null, near: string[]) => ReactNode;
  /** 左下角「© OpenStreetMap 貢獻者」（站位置、海岸綫參考 OSM） */
  attribution?: boolean;
  selected: string | null;
  onStation: (sta: string) => void;
  focus?: MapFocus | null;
  inset?: MapInset;
  near?: string[];
  pins?: MapPinAt[];
}) {
  const t = useTheme();
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  // 畫面 = 地圖座標 × sc + (ox, oy)
  const sc = useSharedValue(1);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const transform = useDerivedValue(() => [{ translateX: ox.get() }, { translateY: oy.get() }, { scale: sc.get() }]);
  const cam = useRef<MapView | null>(null);
  const [ready, setReady] = useState(false);
  const raf = useRef(0);
  const cfg: Cfg = { bounds, minPx, inset };

  const setCam = (v: MapView, s: Size) => {
    cam.current = v;
    const k = s.w / v.w;
    sc.set(k);
    ox.set(-v.x * k);
    oy.set(-v.y * k);
  };
  const stopAnim = () => cancelAnimationFrame(raf.current);
  const show = (E: MapView) => setCam(clamp(E, size, cfg), size);
  const animateTo = (target: MapView, ms: number, fx: number, fy: number) => {
    const from = cam.current;
    if (!from || !size.w) return;
    const S = size;
    const to = clamp(target, S, cfg);
    // 插值「焦點」嘅地圖座標同縮放（對數），焦點唔會飄
    const fc = { x: from.x + fx * (from.w / S.w), y: from.y + fy * (from.w / S.w) };
    const tc = { x: to.x + fx * (to.w / S.w), y: to.y + fy * (to.w / S.w) };
    const t0 = Date.now();
    stopAnim();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      const ww = from.w * (to.w / from.w) ** e;
      const c = { x: fc.x + (tc.x - fc.x) * e, y: fc.y + (tc.y - fc.y) * e };
      setCam({ x: c.x - fx * (ww / S.w), y: c.y - fy * (ww / S.w), w: ww }, S);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const live = useRef<Live | null>(null);
  const animRef = useRef(animateTo);
  const locateRef = useRef(locate);
  useLayoutEffect(() => {
    live.current = { size, cfg, eff: () => cam.current, show, stopAnim, onStation, hit };
    animRef.current = animateTo;
    locateRef.current = locate;
  });

  // 飛去某個站（同網頁一樣）：搜尋就放大置中；撳站只喺俾面板遮住先移；面板高度變（載入完）只喺揀站 3 秒內跟
  const handled = useRef<{ focus: MapFocus; at: number } | null>(null);
  useEffect(() => {
    const v = cam.current;
    if (!focus || !v || !size.w) return;
    const c = locateRef.current(focus.sta);
    if (!c) return;
    const first = handled.current?.focus !== focus;
    if (!first && Date.now() - handled.current!.at > 3000) return;
    if (first) handled.current = { focus, at: Date.now() };
    const visW = Math.max(80, size.w - inset.right);
    const visH = Math.max(80, size.h - inset.bottom);
    const w = focus.zoom ? Math.min(v.w, size.w / START_PX) : v.w;
    if (!focus.zoom) {
      const k = size.w / v.w;
      const sx = (c.x - v.x) * k;
      const sy = (c.y - v.y) * k;
      if (sx > 48 && sx < visW - 48 && sy > 48 && sy < visH - 48) return;
    }
    const k = w / size.w;
    animRef.current({ x: c.x - (visW / 2) * k, y: c.y - (visH / 2) * k, w }, 380, visW / 2, visH / 2);
  }, [focus, inset.right, inset.bottom, size, ready]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const s = { w: width, h: height };
    setSize(s);
    if (!width) return;
    if (cam.current) setCam(clamp(cam.current, s, cfg), s);
    else {
      const w = Math.min(bounds.width, width / START_PX);
      const h = (w * height) / width;
      setCam({ x: start.x - w / 2, y: start.y - h / 2, w }, s);
      setReady(true);
    }
  };

  const aspect = size.w ? size.h / size.w : 1;
  const zoomBtn = (f: number) => {
    const v = cam.current;
    const fx = (size.w - inset.right) / 2;
    const fy = (size.h - inset.bottom) / 2;
    if (v) animateTo(zoomAt(v, size, cfg, f, fx, fy), 200, fx, fy);
  };
  const fitAll = () => {
    const w = Math.max(bounds.width, bounds.height / aspect);
    animateTo({ x: bounds.minX + bounds.width / 2 - w / 2, y: bounds.minY + bounds.height / 2 - (w * aspect) / 2, w }, 260, size.w / 2, size.h / 2);
  };
  const visH = size.h - inset.bottom;

  return (
    <View onLayout={onLayout} style={{ flex: 1, overflow: 'hidden', backgroundColor: t.card }}>
      <GestureSurface live={live}>
        {ready && (
          // pointerEvents none：觸點一律落喺外面嗰層（locationX 先係相對地圖）
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Group transform={transform}>
              <Picture picture={picture} />
              {overlay(selected, near)}
            </Group>
          </Canvas>
        )}
      </GestureSurface>
      {ready &&
        pins.map((p) => (
          <MapPin key={p.key} x={p.x} y={p.y} sc={sc} ox={ox} oy={oy} interactive={!!p.interactive}>
            {p.node}
          </MapPin>
        ))}
      {attribution && (
        <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={{ position: 'absolute', left: 10, bottom: 8 + inset.bottom, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.card + 'cc' }}>
          <Text style={{ fontSize: 11, color: t.muted }}>© OpenStreetMap 貢獻者</Text>
        </Pressable>
      )}
      {/* 面板遮到地圖剩好矮：縮放掣打橫排，唔好頂穿上面；拉板全開（剩一條）就收埋 */}
      <View style={{ position: 'absolute', right: 12 + inset.right, bottom: 12 + inset.bottom, gap: 6, flexDirection: visH < 200 ? 'row' : 'column', display: size.h && visH < 110 ? 'none' : 'flex' }}>
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

/** 浮喺站上面（站頂中間、向上擺）：位置跟地圖變形（UI thread 計，拖、縮放都唔使 React 重畫） */
function MapPin({ x, y, sc, ox, oy, interactive, children }: { x: number; y: number; sc: SharedValue<number>; ox: SharedValue<number>; oy: SharedValue<number>; interactive: boolean; children: ReactNode }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x * sc.get() + ox.get() - sz.w / 2 }, { translateY: y * sc.get() + oy.get() - sz.h - 6 }],
  }));
  return (
    <Animated.View
      pointerEvents={interactive ? 'box-none' : 'none'}
      onLayout={(e) => setSz({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[{ position: 'absolute', left: 0, top: 0, opacity: sz.w ? 1 : 0, zIndex: interactive ? 5 : 3 }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** 手勢層：一隻手指拖、兩隻手指縮放、輕撳揀站（撳中嘅範圍大過站少少） */
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
      const v = L?.eff();
      if (!L || !v || !start || moved >= 8) return;
      // 撳：換算做地圖座標，搵撳中嘅站
      const k = v.w / L.size.w;
      const id = L.hit(v.x + start.x * k, v.y + start.y * k, Math.max(0.25, 12 * k));
      if (id) L.onStation(id);
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
          if (pinch) L.show(zoomAt(v, L.size, L.cfg, d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2));
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
