'use client';
import { useMemo } from 'react';
import { LRT_MAP_ARROWS, LRT_MAP_CAPS, LRT_MAP_LANES, LRT_MAP_LEGEND, LRT_MAP_SIZE as S, LRT_MAP_STATIONS, LRT_MAP_VIEW, lrtRoute, lrtStopEn, lrtStopName, type LrtMapStation } from '@hknt/core';
import Icon from '../Icon';
import { useMapView, type MapFocus, type MapInset } from './useMapView';

const START_PX = 34;
const MIN_PX = 8;
const MAX_PX = 90;
const INK = '#1d1d1f';
const color = (r: string) => lrtRoute(r)?.color ?? '#888';

/**
 * 輕鐵路綫圖（core lrt-map.ts，tools/lrt-layout.py 排嘅自畫示意圖，打橫、唔跟地理位置）：
 * 色綫並排、每條有黑邊；喺度完嘅綫駁住路線號碼；單方向有白色箭咀。拖動、縮放、撳站（同港鐵路綫圖共用 useMapView）。
 */
export default function LrtMap({
  selected,
  onStation,
  focus = null,
  inset = { right: 0, bottom: 0 },
  near = [],
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  focus?: MapFocus | null;
  inset?: MapInset;
  /** 附近嘅站（藍色虛綫框） */
  near?: string[];
}) {
  const byId = useMemo(() => new Map(LRT_MAP_STATIONS.map((s) => [s.id, s])), []);
  const under = useMemo(() => LRT_MAP_LANES.filter((l) => !l.o), []);
  const over = useMemo(() => LRT_MAP_LANES.filter((l) => l.o), []);
  const locate = (sta: string) => {
    const s = byId.get(sta);
    return s ? { x: s.hit[0] + s.hit[2] / 2, y: s.hit[1] + s.hit[3] / 2 } : null;
  };
  // 開頁以兆康為中心（輕鐵中間）
  const start = useMemo(() => {
    const s = LRT_MAP_STATIONS.find((x) => lrtStopName(x.id) === '兆康');
    return s ? { x: s.x, y: s.y } : { x: LRT_MAP_VIEW.minX + LRT_MAP_VIEW.width / 2, y: LRT_MAP_VIEW.minY + LRT_MAP_VIEW.height / 2 };
  }, []);
  const { box, size, view, aspect, handlers, zoomBtn, fitAll } = useMapView({ bounds: LRT_MAP_VIEW, start, startPx: START_PX, minPx: MIN_PX, maxPx: MAX_PX, focus, inset, locate, onStation });

  return (
    <div className="mtr-map lrt-map" ref={box} {...handlers}>
      {view && (
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} role="img" aria-label="輕鐵路綫圖">
          <Legend />
          {/* 先畫晒黑邊，再畫色綫（色綫窄過一格，並排之間露出黑綫）；跨過其他綫嘅最後畫，有自己黑邊 */}
          {under.map((l, i) => (
            <path key={`c${i}`} d={l.d} className="lrt-lane" stroke={INK} strokeWidth={S.lane + 2 * S.casing} />
          ))}
          {under.map((l, i) => (
            <path key={`l${i}`} d={l.d} className="lrt-lane" stroke={color(l.r)} strokeWidth={S.lane - S.sep} />
          ))}
          {over.map((l, i) => (
            <g key={`o${i}`}>
              <path d={l.d} className="lrt-lane" stroke={INK} strokeWidth={S.lane - S.sep + 2 * S.casing} />
              <path d={l.d} className="lrt-lane" stroke={color(l.r)} strokeWidth={S.lane - S.sep} />
            </g>
          ))}
          {LRT_MAP_ARROWS.map((a, i) => (
            <path key={`a${i}`} d="M-0.035 -0.042 L0.025 0 L-0.035 0.042" className="lrt-arrow" transform={`translate(${a.x} ${a.y}) rotate(${a.a})`} />
          ))}
          {near.map((id) => {
            const s = byId.get(id);
            return s ? <Ring key={`near-${id}`} s={s} className="mtr-near" /> : null;
          })}
          {selected && byId.get(selected) && (
            <g key={selected} aria-hidden="true">
              <Ring s={byId.get(selected)!} className="mtr-focus" />
              <Ring s={byId.get(selected)!} className="mtr-focus-pulse" />
            </g>
          )}
          {LRT_MAP_STATIONS.map((s) => (
            <g key={s.id} data-sta={s.id} className={`mtr-sta lrt-sta${selected === s.id ? ' on' : ''}`} role="button" aria-label={`輕鐵${lrtStopName(s.id)}站`}>
              <rect x={s.hit[0] - 0.2} y={s.hit[1] - 0.2} width={s.hit[2] + 0.4} height={s.hit[3] + 0.4} className="mtr-hit" />
              <Marker s={s} />
              {LRT_MAP_CAPS.filter((c) => c.sta === s.id).map((c) => (
                <Cap key={c.r} r={c.r} x={c.x} y={c.y} />
              ))}
              <text x={s.lx} y={s.zy} textAnchor={s.an} className="mtr-zh">
                {lrtStopName(s.id)}
              </text>
              <text x={s.lx} y={s.ey} textAnchor={s.an} className="mtr-en">
                {lrtStopEn(s.id)}
              </text>
            </g>
          ))}
        </svg>
      )}
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

/** 站：圓點（只得一條綫）、膠囊（橫跨所有色綫）、盡頭站白色膠囊（喺號碼後面） */
function Marker({ s }: { s: LrtMapStation }) {
  if (s.k === 'dot') return <circle cx={s.x} cy={s.y} r={s.r} className="lrt-marker" strokeWidth={S.ring} />;
  if (s.k === 'box') return <rect x={s.x - s.w! / 2} y={s.y - s.h! / 2} width={s.w} height={s.h} rx={Math.min(s.w!, s.h!) / 2} className="lrt-marker" strokeWidth={S.ring} />;
  return (
    <rect x={s.x - s.len! / 2} y={s.y - s.th! / 2} width={s.len} height={s.th} rx={s.th! / 2} className="lrt-marker" strokeWidth={S.ring} transform={`rotate(${s.a} ${s.x} ${s.y})`} />
  );
}

/** 揀咗／附近嘅站：圍住站（連號碼）嘅圓角框 */
function Ring({ s, className }: { s: LrtMapStation; className: string }) {
  const [x, y, w, h] = s.hit;
  const p = 0.22;
  return <rect x={x - p} y={y - p} width={w + 2 * p} height={h + 2 * p} rx={Math.min(w, h) / 2 + p} className={className} />;
}

/** 路線號碼：路線色膠囊（黑邊），入面白底黑字 */
function Cap({ r, x, y }: { r: string; x: number; y: number }) {
  const w = S.capW;
  const h = S.capH;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={color(r)} stroke={INK} strokeWidth={S.casing} />
      <rect x={x - w / 2 + 0.055} y={y - h / 2 + 0.05} width={w - 0.11} height={h - 0.1} rx={(h - 0.1) / 2} className="lrt-cap-in" />
      <text x={x} y={y + 0.058} textAnchor="middle" className="lrt-cap-text">
        {r}
      </text>
    </g>
  );
}

/** 圖例：每條路線號碼同起訖站 */
function Legend() {
  const L = LRT_MAP_LEGEND;
  return (
    <g className="mtr-legend" transform={`translate(${L.x} ${L.y})`} aria-hidden="true">
      <rect width={L.w} height={L.h} rx={0.3} className="mtr-legend-box" />
      <text x={0.4} y={0.68} className="mtr-legend-title">
        輕鐵路綫圖<tspan className="mtr-legend-en" dx={0.15}>Light Rail</tspan>
      </text>
      {L.rows.map(([r, zh], i) => {
        const x = 0.4 + (i % L.cols) * 5.4;
        const y = 1.3 + Math.floor(i / L.cols) * 0.62;
        return (
          <g key={r}>
            <Cap r={r} x={x + S.capW / 2} y={y} />
            <text x={x + S.capW + 0.2} y={y + 0.09} className="mtr-legend-zh">
              {zh}
            </text>
          </g>
        );
      })}
    </g>
  );
}
