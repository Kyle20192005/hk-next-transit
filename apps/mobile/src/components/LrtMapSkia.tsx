import { useMemo } from 'react';
import { DashPathEffect, Group, RoundedRect, Skia, StrokeCap, StrokeJoin, createPicture, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { LRT_MAP_ARROWS, LRT_MAP_CAPS, LRT_MAP_LANES, LRT_MAP_LEGEND, LRT_MAP_SIZE as S, LRT_MAP_STATIONS, LRT_MAP_VIEW, lrtRoute, lrtStopEn, lrtStopName, type LrtMapStation } from '@hknt/core';
import { useTheme, type Theme } from '@/lib/theme';
import { alpha, drawText, makePaint } from '@/lib/skia-draw';
import { SchematicMap, type MapFocus, type MapInset } from './SchematicMap';

export { setMapFontProvider } from '@/lib/skia-draw';

const MIN_PX = 8;
const INK = '#1d1d1f';
/** 附近嘅站：同定位圖示一樣嘅藍 */
const NEAR = '#2f6fd6';
const color = (r: string) => lrtRoute(r)?.color ?? '#888';
const BY_ID = new Map(LRT_MAP_STATIONS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// 畫圖（同網頁 components/rail/LrtMap.tsx 一樣）：成幅圖錄一次做 SkPicture
// ---------------------------------------------------------------------------

/** 路線號碼：路線色膠囊（黑邊），入面白底黑字 */
function drawCap(c: SkCanvas, r: string, x: number, y: number) {
  const w = S.capW;
  const h = S.capH;
  const outer = Skia.RRectXY(Skia.XYWHRect(x - w / 2, y - h / 2, w, h), h / 2, h / 2);
  c.drawRRect(outer, makePaint(color(r)));
  c.drawRRect(outer, makePaint(INK, { stroke: S.casing }));
  c.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - w / 2 + 0.055, y - h / 2 + 0.05, w - 0.11, h - 0.1), (h - 0.1) / 2, (h - 0.1) / 2), makePaint('#ffffff'));
  drawText(c, [{ text: r, size: 0.165, weight: 800, color: '#111111' }], x, y + 0.058, 'middle');
}

/** 站：圓點（只得一條綫）、膠囊（橫跨所有色綫）、盡頭站白色膠囊（喺號碼後面） */
function drawMarker(c: SkCanvas, s: LrtMapStation, fill = '#ffffff') {
  const ring = makePaint(INK, { stroke: S.ring });
  if (s.k === 'dot') {
    c.drawCircle(s.x, s.y, s.r!, makePaint(fill));
    c.drawCircle(s.x, s.y, s.r!, ring);
    return;
  }
  const [w, h, a] = s.k === 'box' ? [s.w!, s.h!, 0] : [s.len!, s.th!, s.a!];
  const rr = Skia.RRectXY(Skia.XYWHRect(s.x - w / 2, s.y - h / 2, w, h), Math.min(w, h) / 2, Math.min(w, h) / 2);
  c.save();
  c.rotate(a, s.x, s.y);
  c.drawRRect(rr, makePaint(fill));
  c.drawRRect(rr, ring);
  c.restore();
}

function drawLegend(c: SkCanvas, t: Theme) {
  const L = LRT_MAP_LEGEND;
  c.save();
  c.translate(L.x, L.y);
  const box = Skia.RRectXY(Skia.XYWHRect(0, 0, L.w, L.h), 0.3, 0.3);
  c.drawRRect(box, makePaint(t.card));
  c.drawRRect(box, makePaint(t.line, { stroke: 0.04 }));
  drawText(
    c,
    [
      { text: '輕鐵路綫圖', size: 0.32, weight: 700, color: t.text },
      { text: 'Light Rail', size: 0.17, weight: 500, color: t.muted },
    ],
    0.4,
    0.68,
    'start',
    { gap: 0.15 },
  );
  L.rows.forEach(([r, zh], i) => {
    const x = 0.4 + (i % L.cols) * 5.4;
    const y = 1.3 + Math.floor(i / L.cols) * 0.62;
    drawCap(c, r, x + S.capW / 2, y);
    drawText(c, [{ text: zh, size: 0.26, weight: 600, color: t.text }], x + S.capW + 0.2, y + 0.09, 'start');
  });
  c.restore();
}

function recordMap(t: Theme): SkPicture {
  const { minX, minY, width, height } = LRT_MAP_VIEW;
  return createPicture(
    (c) => {
      drawLegend(c, t);
      const paths = LRT_MAP_LANES.map((l) => ({ ...l, p: Skia.Path.MakeFromSVGString(l.d) }));
      // 先畫晒黑邊，再畫色綫（色綫窄過一格，並排之間露出黑綫）；跨過其他綫嘅最後畫，有自己黑邊
      const under = paths.filter((l) => !l.o);
      for (const l of under) if (l.p) c.drawPath(l.p, makePaint(INK, { stroke: S.lane + 2 * S.casing, join: StrokeJoin.Round }));
      for (const l of under) if (l.p) c.drawPath(l.p, makePaint(color(l.r), { stroke: S.lane - S.sep, join: StrokeJoin.Round }));
      for (const l of paths.filter((x) => x.o)) {
        if (!l.p) continue;
        c.drawPath(l.p, makePaint(INK, { stroke: S.lane - S.sep + 2 * S.casing, join: StrokeJoin.Round }));
        c.drawPath(l.p, makePaint(color(l.r), { stroke: S.lane - S.sep, join: StrokeJoin.Round }));
      }
      // 單方向箭咀：白色 V 形
      const arrow = makePaint('#ffffff', { stroke: 0.026, cap: StrokeCap.Round, join: StrokeJoin.Round });
      for (const a of LRT_MAP_ARROWS) {
        c.save();
        c.translate(a.x, a.y);
        c.rotate(a.a, 0, 0);
        const p = Skia.Path.MakeFromSVGString('M-0.035 -0.042 L0.025 0 L-0.035 0.042');
        if (p) c.drawPath(p, arrow);
        c.restore();
      }
      for (const s of LRT_MAP_STATIONS) {
        drawMarker(c, s);
        for (const cap of LRT_MAP_CAPS) if (cap.sta === s.id) drawCap(c, cap.r, cap.x, cap.y);
        drawText(c, [{ text: lrtStopName(s.id), size: S.zh, weight: 700, color: t.text }], s.lx, s.zy, s.an, { halo: t.card });
        drawText(c, [{ text: lrtStopEn(s.id), size: S.en, weight: 500, color: t.muted }], s.lx, s.ey, s.an, { halo: t.card });
      }
    },
    Skia.XYWHRect(minX - 2, minY - 2, width + 4, height + 4),
  );
}

/** 錄好嘅圖（每個主題一份）：成個 App 開住期間只錄一次 */
const pictures = new Map<Theme, SkPicture>();
function mapPicture(t: Theme): SkPicture {
  let p = pictures.get(t);
  if (!p) {
    const t0 = Date.now();
    p = recordMap(t);
    if (__DEV__) console.log(`[LrtMap] 錄圖 ${Date.now() - t0}ms`);
    pictures.set(t, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// 地圖元件
// ---------------------------------------------------------------------------

const hit = (mx: number, my: number, pad: number) =>
  LRT_MAP_STATIONS.find((s) => mx >= s.hit[0] - pad && mx <= s.hit[0] + s.hit[2] + pad && my >= s.hit[1] - pad && my <= s.hit[1] + s.hit[3] + pad)?.id ?? null;
const locate = (sta: string) => {
  const s = BY_ID.get(sta);
  return s ? { x: s.hit[0] + s.hit[2] / 2, y: s.hit[1] + s.hit[3] / 2 } : null;
};
/** 開頁以兆康為中心（輕鐵中間） */
const START = (() => {
  const s = LRT_MAP_STATIONS.find((x) => lrtStopName(x.id) === '兆康');
  return s ? { x: s.x, y: s.y } : { x: LRT_MAP_VIEW.minX + LRT_MAP_VIEW.width / 2, y: LRT_MAP_VIEW.minY + LRT_MAP_VIEW.height / 2 };
})();

/** 揀咗／附近嘅站：圍住站（連號碼）嘅圓角框 */
function ringRect(s: LrtMapStation) {
  const [x, y, w, h] = s.hit;
  const p = 0.22;
  return { x: x - p, y: y - p, width: w + 2 * p, height: h + 2 * p, r: Math.min(w, h) / 2 + p };
}

/**
 * 輕鐵路綫圖（同網頁 components/rail/LrtMap.tsx 一樣嘅 core 資料同畫法）：一隻手指拖、兩隻手指縮放、撳站。
 * 成幅圖錄一次（mapPicture），拖拉縮放同港鐵路綫圖共用 SchematicMap。
 */
export function LrtMap({ selected, onStation, focus = null, inset, near }: { selected: string | null; onStation: (sta: string) => void; focus?: MapFocus | null; inset?: MapInset; near?: string[] }) {
  const t = useTheme();
  const picture = useMemo(() => mapPicture(t), [t]);
  const overlay = (sel: string | null, nearIds: string[]) => (
    <>
      {nearIds.map((id) => {
        const s = BY_ID.get(id);
        if (!s) return null;
        const r = ringRect(s);
        return (
          <Group key={id}>
            <RoundedRect x={r.x} y={r.y} width={r.width} height={r.height} r={r.r} color="rgba(47,111,214,0.16)" />
            <RoundedRect x={r.x} y={r.y} width={r.width} height={r.height} r={r.r} color={NEAR} style="stroke" strokeWidth={0.05}>
              <DashPathEffect intervals={[0.12, 0.06]} />
            </RoundedRect>
          </Group>
        );
      })}
      {(() => {
        const s = sel ? BY_ID.get(sel) : undefined;
        if (!s) return null;
        const r = ringRect(s);
        return (
          <Group>
            <RoundedRect x={r.x} y={r.y} width={r.width} height={r.height} r={r.r} color={alpha(t.accent, 0.16)} />
            <RoundedRect x={r.x} y={r.y} width={r.width} height={r.height} r={r.r} color={t.accent} style="stroke" strokeWidth={0.05} />
          </Group>
        );
      })()}
    </>
  );
  return <SchematicMap bounds={LRT_MAP_VIEW} start={START} minPx={MIN_PX} picture={picture} hit={hit} locate={locate} overlay={overlay} selected={selected} onStation={onStation} focus={focus} inset={inset} near={near} />;
}
