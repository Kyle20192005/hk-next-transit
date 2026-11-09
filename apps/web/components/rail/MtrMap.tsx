'use client';
import { useMemo } from 'react';
import { LRT_BRAND, MTR_LINES, MTR_MAP_DOT_R, MTR_MAP_GAP, MTR_MAP_LEGEND, MTR_MAP_LEGEND_SYMBOLS, MTR_MAP_LINES, MTR_MAP_LINKS, MTR_MAP_RING, MTR_MAP_TICK, MTR_MAP_REGIONS, MTR_MAP_VIEW, MTR_MAP_WATER, MTR_MAP_XFER, mtrLabelPos, mtrLine, mtrLinePathD, mtrMapStations, mtrRoundPathD, mtrStationEn, mtrStationName, mtrXferLink, type Pt } from '@hknt/core';
import Icon from '../Icon';
import { useMapView, type MapFocus, type MapInset } from './useMapView';

export type MtrFocus = MapFocus;
export type MtrInset = MapInset;
/** 一格幾多 px 先睇得清（開頁用）；縮放範圍（一格 px） */
const START_PX = 34;
const MIN_PX = 9;
const MAX_PX = 90;

/**
 * 港鐵路綫圖（core mtr-map.ts 嘅自畫示意圖，站位置同海參考真實地理）：拖動、兩隻手指或者滑鼠轆縮放、撳站。
 * 用 viewBox 做平移縮放（SVG 本身唔郁，useMapView），站名喺任何大細都清楚。
 */
export default function MtrMap({
  selected,
  onStation,
  focus = null,
  inset = { right: 0, bottom: 0 },
  near = [],
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  /** 要飛去嘅站（每次新 object 就做一次）：zoom = 搜尋（放大到睇得清再置中），否則只係睇唔到先移 */
  focus?: MtrFocus | null;
  /** 面板遮住咗嘅位（px）：置中同「睇唔睇到」只計淨低嘅地方 */
  inset?: MtrInset;
  /** 附近嘅站（藍色光圈，同揀咗嘅站嘅橙色分開） */
  near?: string[];
}) {
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

  // 拖、縮放、飛去個站（同輕鐵路綫圖共用）；第一次以九龍為中心
  const locate = (sta: string) => {
    const s = stations.find((x) => x.code === sta);
    return s ? { x: s.box.x + s.box.w / 2, y: s.box.y + s.box.h / 2 } : null;
  };
  const { box, size, view, aspect, handlers, zoomBtn, fitAll } = useMapView({ bounds: MTR_MAP_VIEW, start: { x: 16.5, y: 13 }, startPx: START_PX, minPx: MIN_PX, maxPx: MAX_PX, focus, inset, locate, onStation });

  return (
    <div className="mtr-map" ref={box} {...handlers}>
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
          {/* 附近嘅站：藍色光圈（同定位圖示一樣嘅藍） */}
          {near.map((code) => {
            const s = stations.find((x) => x.code === code);
            if (!s) return null;
            return <circle key={`near-${code}`} cx={s.box.x + s.box.w / 2} cy={s.box.y + s.box.h / 2} r={Math.max(s.box.w, s.box.h) / 2 + 0.22} className="mtr-near" aria-hidden="true" />;
          })}
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
                {/* 轉乘輕鐵（core rail-xfer.ts）：出閘虛綫 → 站圈 → 一小段輕鐵色綫 */}
                {(() => {
                  const x = mtrXferLink(s);
                  return x && <XferLink {...x} />;
                })()}
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
      {/* 面板遮到地圖剩好矮：縮放掣打橫排，唔好頂穿上面；拉板全開（剩一條）就收埋 */}
      <div className={size.h - inset.bottom < 110 ? 'mtr-zoom row hidden' : size.h - inset.bottom < 200 ? 'mtr-zoom row' : 'mtr-zoom'} style={{ bottom: 12 + inset.bottom, right: 12 + inset.right }} onPointerDown={(e) => e.stopPropagation()}>
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

/** 轉乘輕鐵：a → b 出閘虛綫（三節，兩頭貼住站圈），c 站圈，c → e 輕鐵色綫（喺站圈底），t =「輕鐵」字（圖例冇） */
function XferLink({ a, b, c, e, t }: { a: Pt; b: Pt; c: Pt; e: Pt; t?: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } }) {
  return (
    <g aria-hidden="true">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="mtr-link" strokeWidth={0.06} strokeDasharray={`${MTR_MAP_XFER.on} ${MTR_MAP_XFER.off}`} />
      <line x1={c[0]} y1={c[1]} x2={e[0]} y2={e[1]} stroke={LRT_BRAND.color} strokeWidth={MTR_MAP_GAP} strokeLinecap="round" />
      <circle cx={c[0]} cy={c[1]} r={MTR_MAP_DOT_R} className="mtr-ring" />
      <circle cx={c[0]} cy={c[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} className="mtr-fill" />
      {t && (
        <text x={t.x} y={t.y} textAnchor={t.anchor} className="rail-xfer-name" style={{ fontSize: MTR_MAP_XFER.font }}>
          {LRT_BRAND.zh}
        </text>
      )}
    </g>
  );
}

/** 圖例：左上角空位（core MTR_MAP_LEGEND，排版工具保證唔撞綫同站名）。綫兩欄，下面六個符號 */
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
        else if (sym.kind === 'lrt') icon = <XferLink a={[x, y]} b={[x + 0.26, y]} c={[x + 0.26 + R, y]} e={[x + 0.8 - MTR_MAP_GAP / 2, y]} />;
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
