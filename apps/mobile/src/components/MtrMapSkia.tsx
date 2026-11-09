import { useMemo } from 'react';
import { Circle, DashPathEffect, FillType, Group, Skia, StrokeCap, StrokeJoin, createPicture, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import {
  LRT_BRAND,
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
  MTR_MAP_XFER,
  mtrLabelPos,
  mtrLine,
  mtrLinePathD,
  mtrMapStations,
  mtrRoundPathD,
  mtrStationEn,
  mtrStationName,
  mtrXferLink,
  type MtrMapStation,
  type Pt,
} from '@hknt/core';
import { useTheme, type Theme } from '@/lib/theme';
import { alpha, drawText, makePaint } from '@/lib/skia-draw';
import { SchematicMap, type MapFocus, type MapInset, type MapPinAt } from './SchematicMap';
import type { RailPin } from './Fare';

export { setMapFontProvider } from '@/lib/skia-draw';
/** 要飛去嘅站、面板遮住咗嘅位（同輕鐵共用 SchematicMap） */
export type MtrFocus = MapFocus;
export type MtrInset = MapInset;
const MIN_PX = 9;
const RING = '#23262b';
const STATIONS = mtrMapStations();
/** 附近嘅站：同定位圖示一樣嘅藍 */
const NEAR = '#2f6fd6';

// ---------------------------------------------------------------------------
// 畫圖：成幅圖開頁時記錄一次做 SkPicture（向量），之後只係用 GPU 以唔同位置、大細再畫，唔使重新排版
// ---------------------------------------------------------------------------

function drawStation(c: SkCanvas, s: MtrMapStation, t: Theme) {
  // 轉乘輕鐵（core rail-xfer.ts）：先畫，站圈喺上面
  const x = mtrXferLink(s);
  if (x) drawXfer(c, x.a, x.b, x.c, x.e, { ...x.t, t });
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

/** 轉乘輕鐵（同網頁 XferLink 一樣）：a → b 出閘虛綫（三節），c 站圈，c → e 輕鐵色綫（喺站圈底），label =「輕鐵」字（圖例冇） */
function drawXfer(c: SkCanvas, a: Pt, b: Pt, o: Pt, e: Pt, label?: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; t: Theme }) {
  c.drawLine(a[0], a[1], b[0], b[1], makePaint(RING, { stroke: 0.06, dash: [MTR_MAP_XFER.on, MTR_MAP_XFER.off] }));
  c.drawLine(o[0], o[1], e[0], e[1], makePaint(LRT_BRAND.color, { stroke: MTR_MAP_GAP, cap: StrokeCap.Round }));
  c.drawCircle(o[0], o[1], MTR_MAP_DOT_R, makePaint(RING));
  c.drawCircle(o[0], o[1], MTR_MAP_DOT_R - MTR_MAP_RING, makePaint('#ffffff'));
  if (label) drawText(c, [{ text: LRT_BRAND.zh, size: MTR_MAP_XFER.font, weight: 700, color: label.t.text }], label.x, label.y, label.anchor, { halo: label.t.card });
}

/** 圖例（同網頁 MapLegend 一樣）：綫兩欄，下面六個符號 */
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
    else if (sym.kind === 'lrt') drawXfer(c, [x, y], [x + 0.26, y], [x + 0.26 + R, y], [x + 0.8 - MTR_MAP_GAP / 2, y]);
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

const hit = (mx: number, my: number, pad: number) => STATIONS.find((s) => mx >= s.box.x - pad && mx <= s.box.x + s.box.w + pad && my >= s.box.y - pad && my <= s.box.y + s.box.h + pad)?.code ?? null;
const locate = (sta: string) => {
  const s = STATIONS.find((x) => x.code === sta);
  return s ? { x: s.box.x + s.box.w / 2, y: s.box.y + s.box.h / 2 } : null;
};

/** 站頂中間（車費標記、彈出選單指住呢點） */
const top = (sta: string) => {
  const s = STATIONS.find((x) => x.code === sta);
  return s ? { x: s.box.x + s.box.w / 2, y: s.box.y } : null;
};

/**
 * 港鐵路綫圖（同網頁 components/rail/MtrMap.tsx 一樣嘅 core 資料同畫法）：一隻手指拖、兩隻手指放大縮細、撳站。
 * 成幅圖錄一次（mapPicture），拖拉縮放同輕鐵路綫圖共用 SchematicMap。
 */
export function MtrMap({
  selected,
  onStation,
  focus = null,
  inset,
  near,
  pins,
}: {
  selected: string | null;
  onStation: (sta: string) => void;
  focus?: MtrFocus | null;
  inset?: MtrInset;
  /** 附近嘅站（藍色虛線光圈，同揀咗嘅站嘅橙色分開；同網頁一樣） */
  near?: string[];
  /** 浮喺站上面嘅元件（車費起點／終點、彈出選單） */
  pins?: RailPin[];
}) {
  const t = useTheme();
  const picture = useMemo(() => mapPicture(t), [t]);
  const overlay = (sel: string | null, nearIds: string[]) => (
    <>
      {nearIds.map((code) => {
        const s = STATIONS.find((x) => x.code === code);
        if (!s) return null;
        const cx = s.box.x + s.box.w / 2;
        const cy = s.box.y + s.box.h / 2;
        const r = Math.max(s.box.w, s.box.h) / 2 + 0.22;
        return (
          <Group key={code}>
            <Circle cx={cx} cy={cy} r={r} color="rgba(47,111,214,0.16)" />
            <Circle cx={cx} cy={cy} r={r} color={NEAR} style="stroke" strokeWidth={0.05}>
              <DashPathEffect intervals={[0.12, 0.06]} />
            </Circle>
          </Group>
        );
      })}
      {/* 揀咗嘅站：重點色光圈 + 白心變黃 */}
      {(() => {
        const s = sel ? STATIONS.find((x) => x.code === sel) : undefined;
        if (!s) return null;
        const cx = s.box.x + s.box.w / 2;
        const cy = s.box.y + s.box.h / 2;
        const r = Math.max(s.box.w, s.box.h) / 2 + 0.22;
        return (
          <Group>
            <Circle cx={cx} cy={cy} r={r} color={alpha(t.accent, 0.16)} />
            <Circle cx={cx} cy={cy} r={r} color={t.accent} style="stroke" strokeWidth={0.05} />
            {s.pts.map((p, i) => (
              <Circle key={i} cx={p[0]} cy={p[1]} r={MTR_MAP_DOT_R - MTR_MAP_RING} color={t.brand} />
            ))}
          </Group>
        );
      })()}
    </>
  );
  return (
    <SchematicMap
      pins={toPins(pins)}
      bounds={MTR_MAP_VIEW}
      start={{ x: 16.5, y: 13 }}
      minPx={MIN_PX}
      picture={picture}
      hit={hit}
      locate={locate}
      overlay={overlay}
      attribution
      selected={selected}
      onStation={onStation}
      focus={focus}
      inset={inset}
      near={near}
    />
  );
}

/** 站代號 → 站頂座標（搵唔到嘅站唔出） */
function toPins(pins: RailPin[] | undefined): MapPinAt[] {
  return (pins ?? []).flatMap((p) => {
    const a = top(p.sta);
    return a ? [{ key: p.key, x: a.x, y: a.y, node: p.node, interactive: p.interactive }] : [];
  });
}

