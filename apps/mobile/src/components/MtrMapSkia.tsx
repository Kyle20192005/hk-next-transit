import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  Circle,
  FillType,
  Group,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  createPicture,
  type SkCanvas,
  type SkPaint,
  type SkParagraph,
  type SkPicture,
  type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
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

// ---------------------------------------------------------------------------
// 畫圖：成幅圖開頁時記錄一次做 SkPicture（向量），之後只係用 GPU 以唔同位置、大細再畫，唔使重新排版
// ---------------------------------------------------------------------------

/** 字用 100 倍大小排版再縮返（地圖一格 = 1，站名 0.3 咁細，Skia 排版會四捨五入） */
const TS = 100;
/** 系統字（同 App 其他地方一樣唔指定字體檔）：iPhone 用蘋方-港；Android 由系統按 zh-HK 揀中文字型 */
const FAMILIES = Platform.OS === 'ios' ? ['PingFang HK'] : Platform.OS === 'web' ? ['Noto Sans TC'] : ['sans-serif'];
/** 網頁預覽（CanvasKit 冇系統字）：MtrMap.web.tsx 載入字型後設定 */
let fontProvider: SkTypefaceFontProvider | null = null;
export function setMapFontProvider(p: SkTypefaceFontProvider) {
  fontProvider = p;
}

function makePaint(color: string, o: { stroke?: number; cap?: StrokeCap; join?: StrokeJoin; dash?: number[] } = {}): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  if (o.stroke !== undefined) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(o.stroke);
    p.setStrokeCap(o.cap ?? StrokeCap.Butt);
    p.setStrokeJoin(o.join ?? StrokeJoin.Miter);
  }
  if (o.dash) p.setPathEffect(Skia.PathEffect.MakeDash(o.dash, 0));
  return p;
}

/** #rrggbb + 透明度 → rgba() */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

type Run = { text: string; size: number; weight: number; color: string; spacing?: number };

function paragraph(r: Run, halo?: SkPaint): SkParagraph {
  const b = fontProvider ? Skia.ParagraphBuilder.Make({}, fontProvider) : Skia.ParagraphBuilder.Make({});
  const style = {
    fontSize: r.size * TS,
    fontStyle: { weight: r.weight },
    fontFamilies: FAMILIES,
    locale: 'zh-HK',
    letterSpacing: (r.spacing ?? 0) * TS,
    color: Skia.Color(r.color),
  };
  if (halo) b.pushStyle(style, halo);
  else b.pushStyle(style);
  b.addText(r.text);
  b.pop();
  const p = b.build();
  p.layout(1e6);
  return p;
}

/**
 * 寫字（同 SVG <text> 一樣：x、y 係基線位置，anchor 對齊）。幾段字（例如中文 + 英文）之間隔 gap。
 * halo = 先用底色描邊畫一次，再畫字（似網頁 paint-order: stroke）。
 */
function drawText(c: SkCanvas, runs: Run[], x: number, y: number, anchor: 'start' | 'middle' | 'end', o: { gap?: number; halo?: string } = {}) {
  const gap = (o.gap ?? 0) * TS;
  const haloPaint = o.halo ? makePaint(o.halo, { stroke: 0.09 * TS, join: StrokeJoin.Round }) : undefined;
  const fills = runs.map((r) => paragraph(r));
  const halos = haloPaint ? runs.map((r) => paragraph(r, haloPaint)) : [];
  const widths = fills.map((p) => p.getLongestLine());
  const total = widths.reduce((a, b) => a + b, 0) + gap * (runs.length - 1);
  let left = x * TS - (anchor === 'middle' ? total / 2 : anchor === 'end' ? total : 0);
  c.save();
  c.scale(1 / TS, 1 / TS);
  fills.forEach((p, i) => {
    const top = y * TS - (p.getLineMetrics()[0]?.baseline ?? 0);
    halos[i]?.paint(c, left, top);
    p.paint(c, left, top);
    left += widths[i]! + gap;
  });
  c.restore();
}

function drawStation(c: SkCanvas, s: MtrMapStation, t: Theme) {
  const ring = makePaint(RING);
  const fill = makePaint('#ffffff');
  for (const p of s.pts) c.drawCircle(p[0], p[1], MTR_MAP_DOT_R, ring);
  for (const p of s.pts) c.drawCircle(p[0], p[1], MTR_MAP_DOT_R - MTR_MAP_RING, fill);
  // 轉車站先有綫色短棒（分岔站雙圈但同一條綫，唔使）；短棒沿住「8」字方向，每條長一個 G，相鄰黐埋
  if (s.lines.length > 1) {
    const a = s.pts[0]!;
    const far = s.pts.reduce((m, p) => (Math.hypot(p[0] - a[0], p[1] - a[1]) > Math.hypot(m[0] - a[0], m[1] - a[1]) ? p : m), a);
    const len = Math.hypot(far[0] - a[0], far[1] - a[1]) || 1;
    const ux = ((far[0] - a[0]) / len) * (MTR_MAP_TICK.len / 2);
    const uy = ((far[1] - a[1]) / len) * (MTR_MAP_TICK.len / 2);
    s.pts.forEach((p, i) => c.drawLine(p[0] - ux, p[1] - uy, p[0] + ux, p[1] + uy, makePaint(mtrLine(s.lines[i]!)?.color ?? RING, { stroke: MTR_MAP_TICK.width })));
  }
  const lp = mtrLabelPos(s.box, s.label, 0.14 + s.labelGap);
  const zhY = lp.baseline === 'top' ? lp.y + 0.3 : lp.baseline === 'bottom' ? lp.y - 0.22 : lp.y - 0.02;
  drawText(c, [{ text: mtrStationName(s.code), size: 0.3, weight: 700, color: t.text }], lp.x, zhY, lp.anchor, { halo: t.card });
  drawText(c, [{ text: mtrStationEn(s.code), size: 0.18, weight: 500, color: t.muted }], lp.x, zhY + 0.25, lp.anchor, { halo: t.card });
}

/** 圖例（同網頁 MapLegend 一樣）：綫兩欄，下面五個符號 */
function drawLegend(c: SkCanvas, t: Theme) {
  const L = MTR_MAP_LEGEND;
  const col = (i: number) => 0.4 + i * 5.3;
  const rowY = (i: number) => 1.3 + i * 0.62;
  const symY = (i: number) => rowY(5) + 0.12 + i * 0.62;
  const R = MTR_MAP_DOT_R;
  const label = (x: number, y: number, zh: string, en: string, size = 0.26, weight = 600) =>
    drawText(
      c,
      [
        { text: zh, size, weight, color: t.text },
        { text: en, size: 0.17, weight: 500, color: t.muted },
      ],
      x,
      y,
      'start',
      { gap: 0.15 },
    );
  const station = (cx: number, cy: number) => {
    c.drawCircle(cx, cy, R, makePaint(RING));
    c.drawCircle(cx, cy, R - MTR_MAP_RING, makePaint('#ffffff'));
  };
  c.save();
  c.translate(L.x, L.y);
  const box = Skia.RRectXY(Skia.XYWHRect(0, 0, L.w, L.h), 0.3, 0.3);
  c.drawRRect(box, makePaint(t.card));
  c.drawRRect(box, makePaint(t.line, { stroke: 0.04 }));
  label(0.4, 0.68, '圖例', 'Legend', 0.32, 700);
  MTR_LINES.forEach((l, i) => {
    const x = col(Math.floor(i / 5));
    const y = rowY(i % 5);
    c.drawLine(x, y, x + 0.8, y, makePaint(l.color, { stroke: MTR_MAP_GAP, cap: StrokeCap.Round }));
    label(x + 1.05, y + 0.1, l.zh, l.en);
  });
  MTR_MAP_LEGEND_SYMBOLS.forEach((sym, i) => {
    const x = col(i % 2);
    const y = symY(Math.floor(i / 2));
    if (sym.kind === 'station') station(x + 0.4, y);
    else if (sym.kind === 'interchange') {
      const a = x + 0.4 - MTR_MAP_GAP / 2;
      const b = x + 0.4 + MTR_MAP_GAP / 2;
      c.drawCircle(a, y, R, makePaint(RING));
      c.drawCircle(b, y, R, makePaint(RING));
      c.drawCircle(a, y, R - MTR_MAP_RING, makePaint('#ffffff'));
      c.drawCircle(b, y, R - MTR_MAP_RING, makePaint('#ffffff'));
      c.drawLine(a - MTR_MAP_GAP / 2, y, a + MTR_MAP_GAP / 2, y, makePaint(MTR_LINES[0]!.color, { stroke: MTR_MAP_TICK.width }));
      c.drawLine(b - MTR_MAP_GAP / 2, y, b + MTR_MAP_GAP / 2, y, makePaint(MTR_LINES[1]!.color, { stroke: MTR_MAP_TICK.width }));
    } else if (sym.kind === 'link') c.drawLine(x, y, x + 0.8, y, makePaint(RING, { stroke: 0.05 }));
    else if (sym.kind === 'walk') c.drawLine(x, y, x + 0.8, y, makePaint(RING, { stroke: 0.06, dash: [0.12, 0.08] }));
    else c.drawLine(x, y, x + 0.8, y, makePaint(MTR_LINES.find((l) => l.code === 'EAL')!.color, { stroke: MTR_MAP_GAP, dash: [0.22, 0.14] }));
    label(x + 1.05, y + 0.1, sym.zh, sym.en);
  });
  c.restore();
}

/** 錄好嘅圖（每個主題一份）：成個 App 開住期間只錄一次，轉分頁返嚟唔使再錄 */
const pictures = new Map<Theme, SkPicture>();
function mapPicture(t: Theme): SkPicture {
  let p = pictures.get(t);
  if (!p) {
    const t0 = Date.now();
    p = recordMap(t);
    if (__DEV__) console.log(`[MtrMap] 錄圖 ${Date.now() - t0}ms`);
    pictures.set(t, p);
  }
  return p;
}

/** 成幅路綫圖（海、地區名、圖例、綫、連接綫、站、站名），同網頁 MtrMap 一樣嘅畫法；只跟主題變 */
function recordMap(t: Theme): SkPicture {
  const { minX, minY, width, height } = MTR_MAP_VIEW;
  return createPicture(
    (c) => {
      // 海：所有環一條 path（evenodd：海入面嘅島係陸地；第一個環係外框）
      const rings = Skia.Path.MakeFromSVGString(MTR_MAP_WATER.map((w) => `${mtrRoundPathD(w, [], 0.3)} Z`).join(' '));
      if (rings) c.drawPath(Skia.PathBuilder.MakeFromPath(rings).setFillType(FillType.EvenOdd).detach(), makePaint(t.water));
      for (const r of MTR_MAP_REGIONS) {
        drawText(c, [{ text: r.zh, size: 0.62, weight: 700, color: alpha(t.muted, 0.32), spacing: 0.15 }], r.at[0], r.at[1], 'middle');
        drawText(c, [{ text: r.en, size: 0.26, weight: 400, color: alpha(t.muted, 0.4) }], r.at[0], r.at[1] + 0.42, 'middle');
      }
      drawLegend(c, t);
      for (const l of MTR_MAP_LINES) {
        l.paths.forEach((pts, i) => {
          const dashed = l.dashed?.includes(i);
          const path = Skia.Path.MakeFromSVGString(mtrLinePathD(pts));
          if (path) c.drawPath(path, makePaint(mtrLine(l.line)?.color ?? RING, { stroke: MTR_MAP_GAP, cap: dashed ? StrokeCap.Butt : StrokeCap.Round, join: StrokeJoin.Round, dash: dashed ? [0.22, 0.14] : undefined }));
        });
      }
      for (const { a, b, dashed } of MTR_MAP_LINKS) {
        const sa = STATIONS.find((s) => s.code === a);
        const sb = STATIONS.find((s) => s.code === b);
        if (!sa || !sb) continue;
        let best: [readonly number[], readonly number[]] = [sa.pts[0]!, sb.pts[0]!];
        for (const p of sa.pts) for (const q of sb.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(best[0][0]! - best[1][0]!, best[0][1]! - best[1][1]!)) best = [p, q];
        c.drawLine(best[0][0]!, best[0][1]!, best[1][0]!, best[1][1]!, makePaint(RING, { stroke: dashed ? 0.06 : 0.05, dash: dashed ? [0.12, 0.08] : undefined }));
      }
      for (const s of STATIONS) drawStation(c, s, t);
    },
    Skia.XYWHRect(minX - 4, minY - 4, width + 8, height + 8),
  );
}

// ---------------------------------------------------------------------------
// 地圖元件
// ---------------------------------------------------------------------------

/** 手勢、動畫用嘅最新值同動作（PanResponder 只建一次） */
type Live = {
  size: Size;
  /** 而家畫面顯示緊嘅範圍 */
  eff: () => MapView | null;
  /** 即刻顯示範圍 E */
  show: (E: MapView) => void;
  /** 動畫去範圍 E（以畫面 (fx, fy) 為焦點） */
  animateTo: (E: MapView, ms: number, fx: number, fy: number) => void;
  stopAnim: () => void;
  onStation: (sta: string) => void;
};

/**
 * 港鐵路綫圖（同網頁 components/rail/MtrMap.tsx 一樣嘅 core 資料同畫法）：一隻手指拖、兩隻手指放大縮細、撳站。
 * 用 Skia：成幅圖開頁時記錄一次（SkPicture），之後拖、縮放、飛去個站都只係改一個變形（Reanimated shared value），
 * GPU 每格照住新位置將份記錄再畫一次，唔使重新排版或者重畫 React；向量畫，放幾大都清楚。
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
  const picture = useMemo(() => mapPicture(t), [t]);
  // 畫面 = 地圖座標 × sc + (ox, oy)
  const sc = useSharedValue(1);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const transform = useDerivedValue(() => [{ translateX: ox.get() }, { translateY: oy.get() }, { scale: sc.get() }]);
  const cam = useRef<MapView | null>(null);
  const [ready, setReady] = useState(false);
  const raf = useRef(0);

  const setCam = (v: MapView, s: Size) => {
    cam.current = v;
    const k = s.w / v.w;
    sc.set(k);
    ox.set(-v.x * k);
    oy.set(-v.y * k);
  };
  const stopAnim = () => cancelAnimationFrame(raf.current);
  const show = (E: MapView) => setCam(clamp(E, size), size);
  const animateTo = (target: MapView, ms: number, fx: number, fy: number) => {
    const from = cam.current;
    if (!from || !size.w) return;
    const S = size;
    const to = clamp(target, S);
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
  useLayoutEffect(() => {
    live.current = { size, eff: () => cam.current, show, animateTo, stopAnim, onStation };
  });

  // 飛去某個站（同網頁一樣）：搜尋就放大置中；撳站只喺俾面板遮住先移；面板高度變（載入完）只喺揀站 1.5 秒內跟
  const handled = useRef<{ focus: MtrFocus; at: number } | null>(null);
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
    const s = { w: width, h: height };
    setSize(s);
    if (!width) return;
    if (cam.current) setCam(clamp(cam.current, s), s);
    else {
      // 第一次以九龍為中心
      const w = Math.min(MTR_MAP_VIEW.width, width / START_PX);
      const h = (w * height) / width;
      setCam({ x: 16.5 - w / 2, y: 13 - h / 2, w }, s);
      setReady(true);
    }
  };

  const aspect = size.w ? size.h / size.w : 1;
  const zoomBtn = (f: number) => {
    const v = cam.current;
    const fx = (size.w - inset.right) / 2;
    const fy = (size.h - inset.bottom) / 2;
    if (v) animateTo(zoomAt(v, size, f, fx, fy), 200, fx, fy);
  };
  const fitAll = () => {
    const w = Math.max(MTR_MAP_VIEW.width, MTR_MAP_VIEW.height / aspect);
    animateTo({ x: MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width / 2 - w / 2, y: MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height / 2 - (w * aspect) / 2, w }, 260, size.w / 2, size.h / 2);
  };
  const sel = selected ? STATIONS.find((s) => s.code === selected) : undefined;
  const visH = size.h - inset.bottom;

  return (
    <View onLayout={onLayout} style={{ flex: 1, overflow: 'hidden', backgroundColor: t.card }}>
      <GestureSurface live={live}>
        {ready && (
          // pointerEvents none：觸點一律落喺外面嗰層（locationX 先係相對地圖）
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Group transform={transform}>
              <Picture picture={picture} />
              {/* 揀咗嘅站：重點色光圈 + 白心變黃 */}
              {sel && (
                <Group>
                  <Circle cx={sel.box.x + sel.box.w / 2} cy={sel.box.y + sel.box.h / 2} r={Math.max(sel.box.w, sel.box.h) / 2 + 0.22} color={alpha(t.accent, 0.16)} />
                  <Circle cx={sel.box.x + sel.box.w / 2} cy={sel.box.y + sel.box.h / 2} r={Math.max(sel.box.w, sel.box.h) / 2 + 0.22} color={t.accent} style="stroke" strokeWidth={0.05} />
                  {sel.pts.map((p, i) => (
                    <Circle key={i} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} color={t.brand} />
                  ))}
                </Group>
              )}
            </Group>
          </Canvas>
        )}
      </GestureSurface>
      <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={{ position: 'absolute', left: 10, bottom: 8 + inset.bottom, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.card + 'cc' }}>
        <Text style={{ fontSize: 11, color: t.muted }}>© OpenStreetMap 貢獻者</Text>
      </Pressable>
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
      const v = L?.eff();
      if (!L || !v || !start || moved >= 8) return;
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
