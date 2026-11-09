'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MTR_LINES, MTR_MAP_DOT_R, MTR_MAP_GAP, MTR_MAP_LEGEND, MTR_MAP_LEGEND_SYMBOLS, MTR_MAP_LINES, MTR_MAP_LINKS, MTR_MAP_RING, MTR_MAP_TICK, MTR_MAP_REGIONS, MTR_MAP_VIEW, MTR_MAP_WATER, mtrLabelPos, mtrLine, mtrLinePathD, mtrMapStations, mtrRoundPathD, mtrStationEn, mtrStationName } from '@hknt/core';
import Icon from '../Icon';

type View = { x: number; y: number; w: number };
export type MtrFocus = { sta: string; zoom: boolean };
export type MtrInset = { right: number; bottom: number };
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px） */
const START_PX = 34;
const MIN_PX = 9;
const MAX_PX = 90;

/**
 * 港鐵路綫圖（core mtr-map.ts 嘅自畫示意圖，站位置同海參考真實地理）：拖動、兩隻手指或者滑鼠轆縮放、撳站。
 * 用 viewBox 做平移縮放（SVG 本身唔郁），站名喺任何大細都清楚。
 */
export default function MtrMap({
  selected,
  onStation,
  focus = null,
  inset = { right: 0, bottom: 0 },
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  /** 要飛去嘅站（每次新 object 就做一次）：zoom = 搜尋（放大到睇得清再置中），否則只係睇唔到先移 */
  focus?: MtrFocus | null;
  /** 面板遮住咗嘅位（px）：置中同「睇唔睇到」只計淨低嘅地方 */
  inset?: MtrInset;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const stations = useMemo(() => mtrMapStations(), []);
  // 海：所有環一條 path（evenodd：海入面嘅島係陸地）
  const waterD = useMemo(() => MTR_MAP_WATER.map((w) => `${mtrRoundPathD(w, [], 0.3)} Z`).join(' '), []);
  // 綫：轉角圓弧（並排綫同心）
  const linePaths = useMemo(
    () => MTR_MAP_LINES.flatMap((l) => l.paths.map((p, i) => ({ key: `${l.line}-${i}`, color: mtrLine(l.line)?.color, d: mtrLinePathD(p), dashed: l.dashed?.includes(i) ?? false }))),
    [],
  );
  // 香港 ↔ 中環（實綫）、尖沙咀 ↔ 尖東（步行虛綫）：兩個站最近嗰兩個圈之間一條細黑綫
  const links = useMemo(
    () =>
      MTR_MAP_LINKS.flatMap(({ a, b, dashed }) => {
        const sa = stations.find((s) => s.code === a);
        const sb = stations.find((s) => s.code === b);
        if (!sa || !sb) return [];
        let best: [readonly number[], readonly number[]] = [sa.pts[0]!, sb.pts[0]!];
        for (const p of sa.pts) for (const q of sb.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(best[0][0]! - best[1][0]!, best[0][1]! - best[1][1]!)) best = [p, q];
        return [{ key: `${a}-${b}`, p: best[0], q: best[1], dashed: !!dashed }];
      }),
    [stations],
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
    stopAnim();
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
      stopAnim();
      const p = local(e);
      setView((v) => (v ? zoomAt(v, Math.exp(-e.deltaY * 0.0022), p.x, p.y) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- 飛去某個站（搜尋、撳站之後面板遮住咗） ----------
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  const anim = useRef(0);
  const stopAnim = () => cancelAnimationFrame(anim.current);
  const handled = useRef<{ focus: MtrFocus; at: number } | null>(null);
  useEffect(() => {
    const v = viewRef.current;
    if (!focus || !v || !size.w) return;
    const s = stations.find((x) => x.code === focus.sta);
    if (!s) return;
    const cx = s.box.x + s.box.w / 2;
    const cy = s.box.y + s.box.h / 2;
    const visW = Math.max(80, size.w - inset.right);
    const visH = Math.max(80, size.h - inset.bottom);
    const first = handled.current?.focus !== focus;
    // 面板高度變（載入完）：只喺啱啱揀站嗰 1.5 秒內跟住調整，之後用戶自己拖開咗就唔好扯返轉頭
    if (!first && performance.now() - handled.current!.at > 1500) return;
    if (first) handled.current = { focus, at: performance.now() };
    // 搜尋：放大（最少開頁咁大）再置中
    const center = focus.zoom;
    const w = center ? Math.min(v.w, size.w / START_PX) : v.w;
    if (!center) {
      // 撳站：站仲喺睇得到嘅地方就唔郁
      const k = size.w / v.w;
      const sx = (cx - v.x) * k;
      const sy = (cy - v.y) * k;
      const m = 48;
      if (sx > m && sx < visW - m && sy > m && sy < visH - m) return;
    }
    const k = w / size.w;
    const target = clamp({ x: cx - (visW / 2) * k, y: cy - (visH / 2) * k, w });
    // 動畫：插值「可見範圍中心」嘅世界座標同縮放（對數），站唔會飄
    const from = v;
    const fc = { x: from.x + (visW / 2) * (from.w / size.w), y: from.y + (visH / 2) * (from.w / size.w) };
    const tc = { x: target.x + (visW / 2) * k, y: target.y + (visH / 2) * k };
    const t0 = performance.now();
    stopAnim();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 380);
      const e = 1 - (1 - p) ** 3;
      const ww = from.w * (target.w / from.w) ** e;
      const c = { x: fc.x + (tc.x - fc.x) * e, y: fc.y + (tc.y - fc.y) * e };
      setView({ x: c.x - (visW / 2) * (ww / size.w), y: c.y - (visH / 2) * (ww / size.w), w: ww });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    // clamp 每次 render 都係新 function，唔放入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, inset.right, inset.bottom, size.w, size.h, stations, view === null]);
  useEffect(() => stopAnim, []);

  const zoomBtn = (f: number) => {
    stopAnim();
    if (view) setView(zoomAt(view, f, (size.w - inset.right) / 2, (size.h - inset.bottom) / 2));
  };
  const fitAll = () => {
    stopAnim();
    const w = Math.max(MTR_MAP_VIEW.width, MTR_MAP_VIEW.height / aspect);
    setView(clamp({ x: MTR_MAP_VIEW.minX + MTR_MAP_VIEW.width / 2 - w / 2, y: MTR_MAP_VIEW.minY + MTR_MAP_VIEW.height / 2 - (w * aspect) / 2, w }));
  };

  return (
    <div className="mtr-map" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {view && (
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} role="img" aria-label="港鐵路綫圖">
          <path d={waterD} fillRule="evenodd" className="mtr-water" />
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
          <MapLegend />
          {linePaths.map((l) => (
            <path key={l.key} d={l.d} className={l.dashed ? 'mtr-line dashed' : 'mtr-line'} stroke={l.color} strokeWidth={MTR_MAP_GAP} />
          ))}
          {links.map((k) => (
            <line key={k.key} x1={k.p[0]} y1={k.p[1]} x2={k.q[0]} y2={k.q[1]} className={k.dashed ? 'mtr-link dashed' : 'mtr-link'} />
          ))}
          {/* 揀咗嘅站：綫色以外嘅重點色光圈（第一次閃三下） */}
          {selected &&
            (() => {
              const s = stations.find((x) => x.code === selected);
              if (!s) return null;
              const cx = s.box.x + s.box.w / 2;
              const cy = s.box.y + s.box.h / 2;
              const r = Math.max(s.box.w, s.box.h) / 2 + 0.22;
              return (
                <g key={selected} aria-hidden="true">
                  <circle cx={cx} cy={cy} r={r} className="mtr-focus" />
                  <circle cx={cx} cy={cy} r={r} className="mtr-focus-pulse" />
                </g>
              );
            })()}
          {stations.map((s) => {
            const lp = mtrLabelPos(s.box, s.label, 0.14 + s.labelGap);
            // 轉車站先有綫色短棒（分岔站雙圈但同一條綫，唔使）
            const inter = s.lines.length > 1;
            // 「8」字方向（由第一點去最遠嗰點）：短棒沿住呢個方向，每條長一個 G，相鄰兩條黐埋
            const far = s.pts.reduce((m, p) => (Math.hypot(p[0] - s.pts[0]![0], p[1] - s.pts[0]![1]) > Math.hypot(m[0] - s.pts[0]![0], m[1] - s.pts[0]![1]) ? p : m), s.pts[0]!);
            const len = Math.hypot(far[0] - s.pts[0]![0], far[1] - s.pts[0]![1]) || 1;
            const ux = ((far[0] - s.pts[0]![0]) / len) * (MTR_MAP_TICK.len / 2);
            const uy = ((far[1] - s.pts[0]![1]) / len) * (MTR_MAP_TICK.len / 2);
            const zhY = lp.baseline === 'top' ? lp.y + 0.3 : lp.baseline === 'bottom' ? lp.y - 0.22 : lp.y - 0.02;
            const enY = zhY + 0.25;
            const on = selected === s.code;
            return (
              <g key={s.code} data-sta={s.code} className={`mtr-sta${on ? ' on' : ''}`} role="button" aria-label={`${mtrStationName(s.code)}站`}>
                {/* 撳得嘅範圍大過站粒 */}
                <rect x={s.box.x - 0.25} y={s.box.y - 0.25} width={s.box.w + 0.5} height={s.box.h + 0.5} className="mtr-hit" />
                {/* 每條綫正中一個黑邊白圈；轉車站幾個圈重疊成「8」字：先畫晒黑圈，再畫白心，再畫綫色短棒 */}
                {s.pts.map((p, i) => (
                  <circle key={`r${i}`} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R} className="mtr-ring" />
                ))}
                {s.pts.map((p, i) => (
                  <circle key={`f${i}`} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} className="mtr-fill" />
                ))}
                {inter &&
                  s.pts.map((p, i) => (
                    <line key={`t${i}`} x1={p[0] - ux} y1={p[1] - uy} x2={p[0] + ux} y2={p[1] + uy} stroke={mtrLine(s.lines[i]!)?.color} strokeWidth={MTR_MAP_TICK.width} />
                  ))}
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
      {/* 站位置同海岸綫參考 OpenStreetMap（ODbL） */}
      <a className="mtr-attr" style={{ bottom: 8 + inset.bottom }} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}>
        © OpenStreetMap 貢獻者
      </a>
      {/* 面板遮到地圖剩好矮：縮放掣打橫排，唔好頂穿上面 */}
      <div className={size.h - inset.bottom < 200 ? 'mtr-zoom row' : 'mtr-zoom'} style={{ bottom: 12 + inset.bottom, right: 12 + inset.right }} onPointerDown={(e) => e.stopPropagation()}>
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

/** 圖例：左上角空位（core MTR_MAP_LEGEND，排版工具保證唔撞綫同站名）。綫兩欄，下面四個符號 */
function MapLegend() {
  const L = MTR_MAP_LEGEND;
  const col = (i: number) => 0.4 + i * 5.3;
  const rowY = (i: number) => 1.3 + i * 0.62;
  const symY = (i: number) => rowY(5) + 0.12 + i * 0.62;
  const R = MTR_MAP_DOT_R;
  const ring = (cx: number, cy: number, key: string) => [
    <circle key={`${key}r`} cx={cx} cy={cy} r={R} className="mtr-ring" />,
    <circle key={`${key}f`} cx={cx} cy={cy} r={R - MTR_MAP_RING} className="mtr-fill" />,
  ];
  return (
    <g className="mtr-legend" transform={`translate(${L.x} ${L.y})`} aria-hidden="true">
      <rect width={L.w} height={L.h} rx={0.3} className="mtr-legend-box" />
      <text x={0.4} y={0.68} className="mtr-legend-title">
        圖例<tspan className="mtr-legend-en" dx={0.15}>Legend</tspan>
      </text>
      {MTR_LINES.map((l, i) => {
        const x = col(Math.floor(i / 5));
        const y = rowY(i % 5);
        return (
          <g key={l.code}>
            <line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={l.color} strokeWidth={MTR_MAP_GAP} strokeLinecap="round" />
            <text x={x + 1.05} y={y + 0.1} className="mtr-legend-zh">
              {l.zh}
              <tspan className="mtr-legend-en" dx={0.15}>
                {l.en}
              </tspan>
            </text>
          </g>
        );
      })}
      {MTR_MAP_LEGEND_SYMBOLS.map((sym, i) => {
        const x = col(i % 2);
        const y = symY(Math.floor(i / 2));
        let icon;
        if (sym.kind === 'station') icon = ring(x + 0.4, y, 's');
        else if (sym.kind === 'interchange') {
          const a = x + 0.4 - MTR_MAP_GAP / 2;
          const b = x + 0.4 + MTR_MAP_GAP / 2;
          icon = [
            ...ring(a, y, 'a').slice(0, 1),
            ...ring(b, y, 'b').slice(0, 1),
            ...ring(a, y, 'a').slice(1),
            ...ring(b, y, 'b').slice(1),
            <line key="ta" x1={a - MTR_MAP_GAP / 2} y1={y} x2={a + MTR_MAP_GAP / 2} y2={y} stroke={MTR_LINES[0]!.color} strokeWidth={MTR_MAP_TICK.width} />,
            <line key="tb" x1={b - MTR_MAP_GAP / 2} y1={y} x2={b + MTR_MAP_GAP / 2} y2={y} stroke={MTR_LINES[1]!.color} strokeWidth={MTR_MAP_TICK.width} />,
          ];
        } else if (sym.kind === 'link') icon = <line x1={x} y1={y} x2={x + 0.8} y2={y} className="mtr-link" />;
        else if (sym.kind === 'walk') icon = <line x1={x} y1={y} x2={x + 0.8} y2={y} className="mtr-link dashed" />;
        else icon = <line x1={x} y1={y} x2={x + 0.8} y2={y} stroke={MTR_LINES.find((l) => l.code === 'EAL')!.color} strokeWidth={MTR_MAP_GAP} className="mtr-line dashed" />;
        return (
          <g key={sym.kind}>
            {icon}
            <text x={x + 1.05} y={y + 0.1} className="mtr-legend-zh">
              {sym.zh}
              <tspan className="mtr-legend-en" dx={0.15}>
                {sym.en}
              </tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}
