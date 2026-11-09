import { Platform } from 'react-native';
import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkPaint, type SkParagraph, type SkTypefaceFontProvider } from '@shopify/react-native-skia';

/**
 * 路綫圖（港鐵、輕鐵）Skia 畫圖共用：筆、字。成幅圖錄做 SkPicture（MtrMapSkia、LrtMapSkia）。
 */

/** 字用 100 倍大小排版再縮返（地圖一格 = 1，站名 0.3 咁細，Skia 排版會四捨五入） */
export const TS = 100;
/** 系統字（同 App 其他地方一樣唔指定字體檔）：iPhone 用蘋方-港；Android 由系統按 zh-HK 揀中文字型 */
const FAMILIES = Platform.OS === 'ios' ? ['PingFang HK'] : Platform.OS === 'web' ? ['Noto Sans TC'] : ['sans-serif'];
/** 網頁預覽（CanvasKit 冇系統字）：MtrMap.web.tsx／LrtMap.web.tsx 載入字型後設定 */
let fontProvider: SkTypefaceFontProvider | null = null;
export function setMapFontProvider(p: SkTypefaceFontProvider) {
  fontProvider = p;
}

export function makePaint(color: string, o: { stroke?: number; cap?: StrokeCap; join?: StrokeJoin; dash?: number[] } = {}): SkPaint {
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
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export type Run = { text: string; size: number; weight: number; color: string; spacing?: number };

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
export function drawText(c: SkCanvas, runs: Run[], x: number, y: number, anchor: 'start' | 'middle' | 'end', o: { gap?: number; halo?: string } = {}) {
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
