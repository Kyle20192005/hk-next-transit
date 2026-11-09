'use client';
import { useEffect, useRef, useState } from 'react';

export type MapView = { x: number; y: number; w: number };
export type MapFocus = { sta: string; zoom: boolean };
export type MapInset = { right: number; bottom: number };
export type MapBounds = { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };
/** 浮喺站上面嘅 HTML（站頂中間，向上擺） */
export type MapPin = { key: string; sta: string; node: React.ReactNode };

/**
 * 示意圖（港鐵、輕鐵路綫圖）共用：viewBox 平移縮放（拖、兩隻手指、滑鼠轆）、撳站、飛去某個站、縮放掣、全圖。
 * SVG 本身唔郁，只改 viewBox，站名喺任何大細都清楚。
 * - startPx：開頁一格幾多 px；minPx／maxPx：縮放範圍
 * - locate(sta)：站中心（地圖座標），飛去用
 * - focus：每次新 object 就做一次；zoom = 搜尋（放大到睇得清再置中），否則只係睇唔到先移
 * - inset：面板遮住咗嘅位（px），置中同「睇唔睇到」只計淨低嘅地方
 */
export function useMapView({
  bounds,
  start,
  startPx,
  minPx,
  maxPx,
  focus,
  inset,
  locate,
  onStation,
}: {
  bounds: MapBounds;
  start: { x: number; y: number };
  startPx: number;
  minPx: number;
  maxPx: number;
  focus: MapFocus | null;
  inset: MapInset;
  locate: (sta: string) => { x: number; y: number } | null;
  onStation: (sta: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<MapView | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!size.w || view) return;
    const w = Math.min(bounds.width, size.w / startPx);
    const h = (w * size.h) / size.w;
    setView({ x: start.x - w / 2, y: start.y - h / 2, w });
  }, [size, view, bounds.width, start.x, start.y, startPx]);

  const aspect = size.w ? size.h / size.w : 1;
  const clamp = (v: MapView): MapView => {
    const w = Math.min(size.w / minPx, Math.max(size.w / maxPx, v.w));
    const h = w * aspect;
    const { minX, minY, width, height } = bounds;
    // 唔准拖到成幅圖離開畫面（留返一半）；面板遮住咗嘅位唔計（地圖邊嘅站都可以移到面板上面正中）
    const k = size.w ? w / size.w : 0;
    const wv = Math.max(80, size.w - inset.right) * k;
    const hv = Math.max(80, size.h - inset.bottom) * k;
    const x = Math.min(minX + width - wv / 2, Math.max(minX - w / 2, v.x));
    const y = Math.min(minY + height - hv / 2, Math.max(minY - h / 2, v.y));
    return { x, y, w };
  };
  /** 以畫面上 (px, py) 為中心縮放 factor 倍（> 1 放大） */
  const zoomAt = (v: MapView, factor: number, px: number, py: number): MapView => {
    const w = v.w / factor;
    const ux = v.x + (px / size.w) * v.w;
    const uy = v.y + (py / size.w) * v.w;
    return clamp({ x: ux - (px / size.w) * w, y: uy - (py / size.w) * w, w });
  };

  // ---------- 手勢 ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; sta: string | null; pinch: number | null }>({ moved: 0, sta: null, pinch: null });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const anim = useRef(0);
  const stopAnim = () => cancelAnimationFrame(anim.current);
  const onPointerDown = (e: React.PointerEvent) => {
    stopAnim();
    box.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0, sta: (e.target as Element).closest('[data-sta]')?.getAttribute('data-sta') ?? null, pinch: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      const k = view.w / size.w;
      setView(clamp({ ...view, x: view.x - dx * k, y: view.y - dy * k }));
    } else if (pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      g.moved += 100; // 兩隻手指唔當撳
      if (g.pinch) setView(zoomAt(view, d / g.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2));
      g.pinch = d;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinch = null;
    if (pointers.current.size === 0 && gesture.current.moved < 8 && gesture.current.sta) onStation(gesture.current.sta);
  };
  // 滑鼠轆：要 passive: false 先可以 preventDefault（唔好捲成頁）
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const p = local(e);
      setView((v) => (v ? zoomAt(v, Math.exp(-e.deltaY * 0.0022), p.x, p.y) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- 飛去某個站（搜尋、撳站之後面板遮住咗） ----------
  const viewRef = useRef(view);
  const locateRef = useRef(locate);
  useEffect(() => {
    viewRef.current = view;
    locateRef.current = locate;
  });
  const handled = useRef<{ focus: MapFocus; at: number } | null>(null);
  useEffect(() => {
    const v = viewRef.current;
    if (!focus || !v || !size.w) return;
    const c = locateRef.current(focus.sta);
    if (!c) return;
    const visW = Math.max(80, size.w - inset.right);
    const visH = Math.max(80, size.h - inset.bottom);
    const first = handled.current?.focus !== focus;
    // 面板高度變（載入完）：只喺啱啱揀站嗰 3 秒內跟住調整（tracker 慢就要等後備），之後用戶自己拖開咗就唔好扯返轉頭
    if (!first && performance.now() - handled.current!.at > 3000) return;
    if (first) handled.current = { focus, at: performance.now() };
    const center = focus.zoom;
    const w = center ? Math.min(v.w, size.w / startPx) : v.w;
    if (!center) {
      // 撳站：站仲喺睇得到嘅地方就唔郁
      const k = size.w / v.w;
      const sx = (c.x - v.x) * k;
      const sy = (c.y - v.y) * k;
      const m = 48;
      if (sx > m && sx < visW - m && sy > m && sy < visH - m) return;
    }
    const k = w / size.w;
    const target = clamp({ x: c.x - (visW / 2) * k, y: c.y - (visH / 2) * k, w });
    // 動畫：插值「可見範圍中心」嘅世界座標同縮放（對數），站唔會飄
    const from = v;
    const fc = { x: from.x + (visW / 2) * (from.w / size.w), y: from.y + (visH / 2) * (from.w / size.w) };
    const tc = { x: target.x + (visW / 2) * k, y: target.y + (visH / 2) * k };
    const t0 = performance.now();
    stopAnim();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 380);
      const ease = 1 - (1 - p) ** 3;
      const ww = from.w * (target.w / from.w) ** ease;
      const cc = { x: fc.x + (tc.x - fc.x) * ease, y: fc.y + (tc.y - fc.y) * ease };
      setView({ x: cc.x - (visW / 2) * (ww / size.w), y: cc.y - (visH / 2) * (ww / size.w), w: ww });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    // clamp 每次 render 都係新 function，唔放入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, inset.right, inset.bottom, size.w, size.h, view === null]);
  useEffect(() => stopAnim, []);

  const zoomBtn = (f: number) => {
    stopAnim();
    if (view) setView(zoomAt(view, f, (size.w - inset.right) / 2, (size.h - inset.bottom) / 2));
  };
  const fitAll = () => {
    stopAnim();
    const w = Math.max(bounds.width, bounds.height / aspect);
    setView(clamp({ x: bounds.minX + bounds.width / 2 - w / 2, y: bounds.minY + bounds.height / 2 - (w * aspect) / 2, w }));
  };

  /** 地圖座標 → 地圖框入面嘅 px（浮喺站上面嘅 HTML，例如車費起點／終點） */
  const toScreen = (x: number, y: number) => (view && size.w ? { left: ((x - view.x) / view.w) * size.w, top: ((y - view.y) / view.w) * size.w } : null);

  return { box, size, view, aspect, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }, zoomBtn, fitAll, toScreen };
}
