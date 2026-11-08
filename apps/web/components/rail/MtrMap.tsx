'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MTR_MAP_LINES, MTR_MAP_REGIONS, MTR_MAP_VIEW, MTR_MAP_WATER, mtrLabelPos, mtrLine, mtrMapStations, mtrRoundPathD, mtrStationEn, mtrStationName } from '@hknt/core';
import Icon from '../Icon';

type View = { x: number; y: number; w: number };
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px） */
const START_PX = 34;
const MIN_PX = 9;
const MAX_PX = 90;

/**
 * 港鐵路綫圖（core mtr-map.ts 嘅自畫示意圖）：拖動、兩隻手指或者滑鼠轆縮放、撳站。
 * 用 viewBox 做平移縮放（SVG 本身唔郁），站名喺任何大細都清楚。
 */
export default function MtrMap({ selected, onStation }: { selected: string | null; onStation: (sta: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const stations = useMemo(() => mtrMapStations(0.17), []);
  // 綫：轉角圓角（似港鐵圖），每條綫只避開自己嘅站
  const linePaths = useMemo(
    () => MTR_MAP_LINES.flatMap((l) => l.paths.map((p, i) => ({ key: `${l.line}-${i}`, color: mtrLine(l.line)?.color, d: mtrRoundPathD(p, Object.values(l.stations)) }))),
    [],
  );

  // 量容器大細；第一次以九龍為中心
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!size.w || view) return;
    const w = Math.min(MTR_MAP_VIEW.width, size.w / START_PX);
    const h = (w * size.h) / size.w;
    setView({ x: 16.5 - w / 2, y: 13 - h / 2, w });
  }, [size, view]);

  const aspect = size.w ? size.h / size.w : 1;
  const clamp = (v: View): View => {
    const w = Math.min(size.w / MIN_PX, Math.max(size.w / MAX_PX, v.w));
    const h = w * aspect;
    const { minX, minY, width, height } = MTR_MAP_VIEW;
    // 唔准拖到成幅圖離開畫面（留返一半）
    const x = Math.min(minX + width - w / 2, Math.max(minX - w / 2, v.x));
    const y = Math.min(minY + height - h / 2, Math.max(minY - h / 2, v.y));
    return { x, y, w };
  };
  /** 以畫面上 (px, py) 為中心縮放 factor 倍（> 1 放大） */
  const zoomAt = (v: View, factor: number, px: number, py: number): View => {
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
  const onDown = (e: React.PointerEvent) => {
    box.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0, sta: (e.target as Element).closest('[data-sta]')?.getAttribute('data-sta') ?? null, pinch: null };
  };
  const onMove = (e: React.PointerEvent) => {
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
  const onUp = (e: React.PointerEvent) => {
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
      const p = local(e);
      setView((v) => (v ? zoomAt(v, Math.exp(-e.deltaY * 0.0022), p.x, p.y) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const zoomBtn = (f: number) => view && setView(zoomAt(view, f, size.w / 2, size.h / 2));
  const fitAll = () => {
    const w = Math.max(MTR_MAP_VIEW.width, MTR_MAP_VIEW.height / aspect);
    setView(clamp({ x: MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width / 2 - w / 2, y: MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height / 2 - (w * aspect) / 2, w }));
  };

  return (
    <div className="mtr-map" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {view && (
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} role="img" aria-label="港鐵路綫圖">
          {MTR_MAP_WATER.map((w, i) => (
            <path key={`w${i}`} d={`${mtrRoundPathD(w, [], 0.5)} Z`} className="mtr-water" />
          ))}
          {MTR_MAP_REGIONS.map((r) => (
            <g key={r.zh} className="mtr-region">
              <text x={r.at[0]} y={r.at[1]} textAnchor="middle" className="mtr-region-zh">
                {r.zh}
              </text>
              <text x={r.at[0]} y={r.at[1] + 0.42} textAnchor="middle" className="mtr-region-en">
                {r.en}
              </text>
            </g>
          ))}
          {linePaths.map((l) => (
            <path key={l.key} d={l.d} className="mtr-line" stroke={l.color} />
          ))}
          {stations.map((s) => {
            const inter = s.lines.length > 1;
            const r = Math.min(s.box.w, s.box.h) / 2;
            const lp = mtrLabelPos(s.box, s.label);
            const zhY = lp.baseline === 'top' ? lp.y + 0.3 : lp.baseline === 'bottom' ? lp.y - 0.22 : lp.y - 0.02;
            const enY = zhY + 0.25;
            const on = selected === s.code;
            return (
              <g key={s.code} data-sta={s.code} className={`mtr-sta${on ? ' on' : ''}`} role="button" aria-label={`${mtrStationName(s.code)}站`}>
                {/* 撳得嘅範圍大過站粒 */}
                <rect x={s.box.x - 0.25} y={s.box.y - 0.25} width={s.box.w + 0.5} height={s.box.h + 0.5} className="mtr-hit" />
                <rect x={s.box.x} y={s.box.y} width={s.box.w} height={s.box.h} rx={r} className={inter ? 'mtr-dot inter' : 'mtr-dot'} stroke={inter ? undefined : mtrLine(s.lines[0]!)?.color} />
                <text x={lp.x} y={zhY} textAnchor={lp.anchor} className="mtr-zh">
                  {mtrStationName(s.code)}
                </text>
                <text x={lp.x} y={enY} textAnchor={lp.anchor} className="mtr-en">
                  {mtrStationEn(s.code)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div className="mtr-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomBtn(1.4)} aria-label="放大">
          <Icon name="plus" size={18} />
        </button>
        <button onClick={() => zoomBtn(1 / 1.4)} aria-label="縮細">
          <Icon name="minus" size={18} />
        </button>
        <button onClick={fitAll} aria-label="睇成幅圖" className="mtr-fit">
          全圖
        </button>
      </div>
    </div>
  );
}
