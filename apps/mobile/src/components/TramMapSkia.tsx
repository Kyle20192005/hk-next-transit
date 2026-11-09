import { useMemo } from 'react';
import { Circle, DashPathEffect, Group, RoundedRect, Skia, StrokeCap, StrokeJoin, createPicture, type SkPicture } from '@shopify/react-native-skia';
import { TRAM_MAP_ARROWS, TRAM_MAP_BOX, TRAM_MAP_LABELS, TRAM_MAP_LINES, TRAM_MAP_SIZE as S, TRAM_MAP_STOPS, TRAM_MAP_TERMS, tramStation, tramStationName } from '@hknt/core';
import { useTheme, type Theme } from '@/lib/theme';
import { alpha, drawText, makePaint } from '@/lib/skia-draw';
import { SchematicMap, type MapFocus, type MapInset } from './SchematicMap';

export { setMapFontProvider } from '@/lib/skia-draw';

const MIN_PX = 10;
const START_PX = 46;
const INK = '#1d1d1f';
const NEAR = '#2f6fd6';
const [BX, BY, BW, BH] = TRAM_MAP_BOX;
// 地圖好窄（打直）：橫向範圍最少當 20 個單位，闊螢幕唔會放到太大（同網頁一樣）
const VIEW_W = Math.max(BW, 20);
const BOUNDS = { minX: BX + BW / 2 - VIEW_W / 2, minY: BY, width: VIEW_W, height: BH };
const POS = new Map([...TRAM_MAP_STOPS, ...TRAM_MAP_TERMS].map((s) => [s.id, s]));
const TERMS = new Map(TRAM_MAP_TERMS.map((t) => [t.id, t]));

/** 站名闊高（地圖單位）：直排每字一行 */
function labelBox(l: (typeof TRAM_MAP_LABELS)[number]) {
  const n = [...tramStationName(l.id)].length;
  const sz = l.bold ? S.termZh : S.zh;
  if (l.v) {
    const h = n * sz * S.lineH;
    const y0 = l.flow === 'up' ? l.y - h : l.y;
    return { x0: l.x - sz / 2, y0, x1: l.x + sz / 2, y1: y0 + h };
  }
  const w = n * sz;
  const x0 = l.flow === 'end' ? l.x - w : l.flow === 'middle' ? l.x - w / 2 : l.x;
  return { x0, y0: l.y - sz / 2, x1: x0 + w, y1: l.y + sz / 2 };
}

/** 撳嘅範圍：站點（東行向右、西行向左，兩條軌好近唔好重疊）加埋站名 */
const HITS = TRAM_MAP_LABELS.flatMap((l) => {
  const s = POS.get(l.id);
  if (!s) return [];
  const t = TERMS.get(l.id);
  const dir = tramStation(l.id)?.dir;
  const dot = t
    ? { x0: s.x - 0.45, y0: s.y - t.h / 2 - 0.1, x1: s.x + 0.45, y1: s.y + t.h / 2 + 0.1 }
    : dir === 'W'
      ? { x0: s.x - 0.55, y0: s.y - 0.2, x1: s.x + 0.08, y1: s.y + 0.2 }
      : dir === 'E'
        ? { x0: s.x - 0.08, y0: s.y - 0.2, x1: s.x + 0.55, y1: s.y + 0.2 }
        : { x0: s.x - 0.3, y0: s.y - 0.3, x1: s.x + 0.3, y1: s.y + 0.3 };
  return [{ id: l.id, boxes: [dot, labelBox(l)] }];
});
const hit = (mx: number, my: number, pad: number) =>
  HITS.find((h) => h.boxes.some((b) => mx >= b.x0 - pad * 0.3 && mx <= b.x1 + pad * 0.3 && my >= b.y0 - pad * 0.3 && my <= b.y1 + pad * 0.3))?.id ?? null;
const locate = (sta: string) => {
  const s = POS.get(sta);
  return s ? { x: s.x, y: s.y } : null;
};

// ---------------------------------------------------------------------------
// 畫圖（同網頁 components/rail/TramMap.tsx 一樣）：成幅圖錄一次做 SkPicture
// ---------------------------------------------------------------------------
function recordMap(t: Theme): SkPicture {
  return createPicture(
    (c) => {
      for (const d of TRAM_MAP_LINES) {
        const p = Skia.Path.MakeFromSVGString(d);
        if (p) c.drawPath(p, makePaint(S.color, { stroke: S.lw, cap: StrokeCap.Round, join: StrokeJoin.Round }));
      }
      const arrow = makePaint('#ffffff', { stroke: 0.03, cap: StrokeCap.Round, join: StrokeJoin.Round });
      for (const a of TRAM_MAP_ARROWS) {
        c.save();
        c.translate(a.x, a.y);
        c.rotate(a.rot, 0, 0);
        const p = Skia.Path.MakeFromSVGString('M-0.05 -0.045 L0.04 0 L-0.05 0.045');
        if (p) c.drawPath(p, arrow);
        c.restore();
      }
      for (const tt of TRAM_MAP_TERMS) {
        const rr = Skia.RRectXY(Skia.XYWHRect(tt.x - tt.w / 2, tt.y - tt.h / 2, tt.w, tt.h), Math.min(tt.w, tt.h) / 2, Math.min(tt.w, tt.h) / 2);
        c.drawRRect(rr, makePaint('#ffffff'));
        c.drawRRect(rr, makePaint(INK, { stroke: 0.05 }));
      }
      for (const s of TRAM_MAP_STOPS) {
        c.drawCircle(s.x, s.y, S.dot, makePaint('#ffffff'));
        c.drawCircle(s.x, s.y, S.dot, makePaint(INK, { stroke: 0.035 }));
      }
      for (const l of TRAM_MAP_LABELS) {
        const zh = tramStationName(l.id);
        const sz = l.bold ? S.termZh : S.zh;
        const run = (text: string) => [{ text, size: sz, weight: l.bold ? 800 : 700, color: t.text }];
        if (!l.v) {
          drawText(c, run(zh), l.x, l.y + sz * 0.36, l.flow === 'end' ? 'end' : l.flow === 'middle' ? 'middle' : 'start', { halo: t.card });
          continue;
        }
        // 直排：一個字一行（括號轉直排符號）
        const chars = [...zh.replace('（', '︵').replace('）', '︶')];
        const step = sz * S.lineH;
        chars.forEach((ch, i) => {
          const y = l.flow === 'up' ? l.y - (chars.length - 1 - i) * step - sz * 0.12 : l.y + (i + 1) * step - sz * 0.14;
          drawText(c, run(ch), l.x, y, 'middle', { halo: t.card });
        });
      }
    },
    Skia.XYWHRect(BX - 2, BY - 2, BW + 4, BH + 4),
  );
}

const pictures = new Map<Theme, SkPicture>();
function mapPicture(t: Theme): SkPicture {
  let p = pictures.get(t);
  if (!p) {
    const t0 = Date.now();
    p = recordMap(t);
    if (__DEV__) console.log(`[TramMap] 錄圖 ${Date.now() - t0}ms`);
    pictures.set(t, p);
  }
  return p;
}

/**
 * 電車路綫圖（同網頁 components/rail/TramMap.tsx 一樣嘅 core 資料同畫法）：打直，堅尼地城喺頂、筲箕灣喺底；
 * 一隻手指拖、兩隻手指縮放、撳站（同港鐵、輕鐵路綫圖共用 SchematicMap）。
 */
export function TramMap({ selected, onStation, focus = null, inset, near, start }: { selected: string | null; onStation: (sta: string) => void; focus?: MapFocus | null; inset?: MapInset; near?: string[]; start?: string | null }) {
  const t = useTheme();
  const picture = useMemo(() => mapPicture(t), [t]);
  const startAt = useMemo(() => locate(start ?? '68W') ?? { x: BX + BW / 2, y: BY + BH / 2 }, [start]);
  const ring = (id: string, fill: string, stroke: string, dash: boolean) => {
    const s = POS.get(id);
    if (!s) return null;
    const term = TERMS.get(id);
    const body = term ? (
      <>
        <RoundedRect x={term.x - term.w / 2 - 0.12} y={term.y - term.h / 2 - 0.12} width={term.w + 0.24} height={term.h + 0.24} r={Math.min(term.w, term.h) / 2 + 0.12} color={fill} />
        <RoundedRect x={term.x - term.w / 2 - 0.12} y={term.y - term.h / 2 - 0.12} width={term.w + 0.24} height={term.h + 0.24} r={Math.min(term.w, term.h) / 2 + 0.12} color={stroke} style="stroke" strokeWidth={0.05}>
          {dash ? <DashPathEffect intervals={[0.12, 0.06]} /> : null}
        </RoundedRect>
      </>
    ) : (
      <>
        <Circle cx={s.x} cy={s.y} r={0.2} color={fill} />
        <Circle cx={s.x} cy={s.y} r={0.2} color={stroke} style="stroke" strokeWidth={0.05}>
          {dash ? <DashPathEffect intervals={[0.12, 0.06]} /> : null}
        </Circle>
      </>
    );
    return <Group key={`${dash ? 'n' : 's'}-${id}`}>{body}</Group>;
  };
  const overlay = (sel: string | null, nearIds: string[]) => (
    <>
      {nearIds.map((id) => ring(id, 'rgba(47,111,214,0.16)', NEAR, true))}
      {sel && ring(sel, alpha(t.accent, 0.18), t.accent, false)}
      {/* 揀咗嘅站：圓點填黃色（同網頁 .tram-sta.on 一樣） */}
      {sel && !TERMS.has(sel) && POS.get(sel) && <Circle cx={POS.get(sel)!.x} cy={POS.get(sel)!.y} r={S.dot - 0.018} color={t.brand} />}
    </>
  );
  return <SchematicMap bounds={BOUNDS} start={startAt} startPx={START_PX} minPx={MIN_PX} picture={picture} hit={hit} locate={locate} overlay={overlay} selected={selected} onStation={onStation} focus={focus} inset={inset} near={near} />;
}
