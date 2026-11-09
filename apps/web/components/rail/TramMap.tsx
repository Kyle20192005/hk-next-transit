'use client';
import { useMemo } from 'react';
import { TRAM_MAP_ARROWS, TRAM_MAP_BOX, TRAM_MAP_LABELS, TRAM_MAP_LINES, TRAM_MAP_SIZE as S, TRAM_MAP_STOPS, TRAM_MAP_TERMS, tramStationName, TRAM_DIR_ZH, tramStation, type TramMapLabel } from '@hknt/core';
import Icon from '../Icon';
import { useMapView, type MapFocus, type MapInset } from './useMapView';

const START_PX = 46;
const MIN_PX = 10;
const MAX_PX = 130;
const [BX, BY, BW, BH] = TRAM_MAP_BOX;
// 地圖好窄（打直）：闊螢幕都唔好放到成幅圖咁闊，橫向範圍最少當 20 個單位（兩邊留白）
const VIEW_W = Math.max(BW, 20);
const BOUNDS = { minX: BX + BW / 2 - VIEW_W / 2, minY: BY, width: VIEW_W, height: BH };

/**
 * 電車路綫圖（core tram-map.ts，tools/tram-layout.py 排）：打直，堅尼地城喺頂、筲箕灣喺底；右邊東行站、左邊西行站；
 * 跑馬地環綫喺左邊（單向，白色箭咀）；總站係膠囊。拖動、縮放、撳站（同港鐵、輕鐵路綫圖共用 useMapView）。
 */
export default function TramMap({
  selected,
  onStation,
  focus = null,
  inset = { right: 0, bottom: 0 },
  near = [],
  start: startSta = null,
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  focus?: MapFocus | null;
  inset?: MapInset;
  /** 附近嘅站（藍色虛綫圈） */
  near?: string[];
  /** 開頁置中邊個站（冇就中環銀行街） */
  start?: string | null;
}) {
  const pos = useMemo(() => new Map([...TRAM_MAP_STOPS, ...TRAM_MAP_TERMS].map((s) => [s.id, s])), []);
  const locate = (sta: string) => {
    const s = pos.get(sta);
    return s ? { x: s.x, y: s.y } : null;
  };
  const start = useMemo(() => locate(startSta ?? '68W') ?? { x: BX + BW / 2, y: BY + BH / 2 }, [startSta]); // eslint-disable-line react-hooks/exhaustive-deps
  const { box, size, view, aspect, handlers, zoomBtn, fitAll } = useMapView({ bounds: BOUNDS, start, startPx: START_PX, minPx: MIN_PX, maxPx: MAX_PX, focus, inset, locate, onStation });
  const terms = useMemo(() => new Map(TRAM_MAP_TERMS.map((t) => [t.id, t])), []);

  return (
    <div className="mtr-map tram-map" ref={box} {...handlers}>
      {view && (
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} role="img" aria-label="電車路綫圖">
          {TRAM_MAP_LINES.map((d, i) => (
            <path key={i} d={d} className="tram-line" stroke={S.color} strokeWidth={S.lw} />
          ))}
          {TRAM_MAP_ARROWS.map((a, i) => (
            <path key={`a${i}`} d="M-0.05 -0.045 L0.04 0 L-0.05 0.045" className="lrt-arrow" transform={`translate(${a.x} ${a.y}) rotate(${a.rot})`} />
          ))}
          {near.map((id) => {
            const s = pos.get(id);
            return s ? <Ring key={`near-${id}`} id={id} s={s} term={terms.get(id)} className="mtr-near" /> : null;
          })}
          {selected && pos.get(selected) && (
            <g key={selected} aria-hidden="true">
              <Ring id={selected} s={pos.get(selected)!} term={terms.get(selected)} className="mtr-focus" />
              <Ring id={selected} s={pos.get(selected)!} term={terms.get(selected)} className="mtr-focus-pulse" />
            </g>
          )}
          {TRAM_MAP_LABELS.map((l) => {
            const s = pos.get(l.id);
            if (!s) return null;
            const t = terms.get(l.id);
            const st = tramStation(l.id);
            return (
              <g key={l.id} data-sta={l.id} className={`mtr-sta tram-sta${selected === l.id ? ' on' : ''}`} role="button" aria-label={`電車${tramStationName(l.id)}站${st ? `（${TRAM_DIR_ZH[st.dir]}）` : ''}`}>
                {/* 撳嘅範圍：東行站向右、西行站向左（兩條軌好近，唔好重疊）；總站兩邊都得 */}
                <rect x={t ? s.x - 0.45 : st?.dir === 'W' ? s.x - 0.55 : st?.dir === 'E' ? s.x - 0.08 : s.x - 0.3} y={s.y - 0.2} width={t ? 0.9 : st?.dir === 'W' || st?.dir === 'E' ? 0.63 : 0.6} height={0.4} className="mtr-hit" />
                {t ? (
                  <rect x={t.x - t.w / 2} y={t.y - t.h / 2} width={t.w} height={t.h} rx={Math.min(t.w, t.h) / 2} className="tram-term" strokeWidth={0.05} />
                ) : (
                  <circle cx={s.x} cy={s.y} r={S.dot} className="tram-stop" strokeWidth={0.035} />
                )}
                <Label l={l} />
              </g>
            );
          })}
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

/** 站名：打橫（start／end／middle）或者直排（一個字一行，up 向上、down 向下）；總站粗體大字 */
function Label({ l }: { l: TramMapLabel }) {
  const zh = tramStationName(l.id);
  const sz = l.bold ? S.termZh : S.zh;
  const cls = l.bold ? 'tram-label bold' : 'tram-label';
  if (!l.v) {
    return (
      <text x={l.x} y={l.y + sz * 0.36} textAnchor={l.flow === 'end' ? 'end' : l.flow === 'middle' ? 'middle' : 'start'} className={cls} style={{ fontSize: sz }}>
        {zh}
      </text>
    );
  }
  const chars = [...zh.replace('（', '︵').replace('）', '︶')];
  const step = sz * S.lineH;
  return (
    <text className={cls} style={{ fontSize: sz }} textAnchor="middle">
      {chars.map((ch, i) => (
        <tspan key={i} x={l.x} y={l.flow === 'up' ? l.y - (chars.length - 1 - i) * step - sz * 0.12 : l.y + (i + 1) * step - sz * 0.14}>
          {ch}
        </tspan>
      ))}
    </text>
  );
}

/** 揀咗／附近嘅站：圓點外面一個圈，總站就圍住膠囊 */
function Ring({ s, term, className }: { id: string; s: { x: number; y: number }; term?: { x: number; y: number; w: number; h: number }; className: string }) {
  if (term) {
    const p = 0.12;
    return <rect x={term.x - term.w / 2 - p} y={term.y - term.h / 2 - p} width={term.w + 2 * p} height={term.h + 2 * p} rx={Math.min(term.w, term.h) / 2 + p} className={className} />;
  }
  return <circle cx={s.x} cy={s.y} r={0.2} className={className} />;
}
