/**
 * 港鐵路綫圖（自己畫嘅簡化示意圖，唔係港鐵官方圖）：格仔座標，綫只行橫、直、45°。
 * 網頁（SVG）同 App（react-native-svg）共用。1 格大約 44px。
 *
 * - paths：每條綫一段或幾段折綫（包轉角位）
 * - stations：每條綫喺每個站嘅點；同一個站幾條綫嘅點用一粒圓角長方（轉車站）包住
 * - labels：站名喺站嘅邊個方向（n s e w ne nw se sw），唔寫就 s
 */
export type Pt = readonly [number, number];
export type LabelSide = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface MtrMapLine {
  line: string;
  paths: readonly (readonly Pt[])[];
  stations: Readonly<Record<string, Pt>>;
}

export const MTR_MAP_VIEW = { minX: -0.4, minY: 0.9, width: 33.4, height: 25.6 } as const;

/** 背景：維多利亞港（簡化水域）同地區名（淺灰大字） */
export const MTR_MAP_WATER: readonly (readonly Pt[])[] = [
  [[20, 19.2], [32.8, 19.2], [32.8, 20.6], [6.8, 20.6], [6.8, 19.2], [20, 19.2]],
];
export const MTR_MAP_REGIONS: readonly { zh: string; en: string; at: Pt }[] = [
  { zh: '新界', en: 'New Territories', at: [9.5, 6.2] },
  { zh: '九龍', en: 'Kowloon', at: [19.8, 12.4] },
  { zh: '港島', en: 'Hong Kong Island', at: [21, 24.4] },
];

/** 並排行嘅綫之間嘅距離（格）= 綫闊：貼埋 */
export const MTR_MAP_GAP = 0.24;
/** 統一彎位（由轉角沿綫量幾多格開始彎）；所有轉彎都係 45°（90° 拆做兩個 45°） */
export const MTR_MAP_BEND = 0.45;

/**
 * 座標由 packages/core/tools/mtr-layout.py 計好再貼過嚟（檢查：45° 轉彎、彎位夠長、站離轉角 ≥ 0.6、轉車站直排／橫排、站名唔撞綫唔撞字）。
 * 並排：油麻地至太子（荃灣／觀塘）、中環金鐘（荃灣／港島／東鐵／南港島上下貼住）、北角鰂魚涌、油塘調景嶺、
 * 香港至青衣（東涌綫外、機場快綫內，過咗青衣機場快綫交叉去上面）、欣澳（迪士尼綫貼住東涌綫向下）。
 * 交叉嘅轉車站（美孚、南昌以外嘅九龍塘、鑽石山、何文田、紅磡）兩條綫嘅點錯開一格，變直排膠囊。
 */
export const MTR_MAP_LINES: readonly MtrMapLine[] = [
  { line: 'ISL', paths: [[[2.5, 22], [29.3, 22], [30.3, 23], [30.3, 25.6]]], stations: { KET: [2.5, 22], HKU: [4.4, 22], SYP: [6.2, 22], SHW: [8.0, 22], CEN: [10.2, 22], ADM: [12.4, 22], WAC: [14.6, 22], CAB: [16.6, 22], TIH: [18.6, 22], FOH: [20.6, 22], NOP: [22.6, 22], QUB: [24.6, 22], TAK: [26.6, 22], SWH: [28.6, 22], SKW: [30.3, 23.7], HFC: [30.3, 24.65], CHW: [30.3, 25.6] } },
  { line: 'TWL', paths: [[[10.2, 21.76], [13.0, 21.76], [15, 19.76], [15, 13.1], [14.2, 12.3], [1.5, 12.3]]], stations: { CEN: [10.2, 21.76], ADM: [12.4, 21.76], TST: [15, 17.9], JOR: [15, 17.0], YMT: [15, 15.8], MOK: [15, 14.8], PRE: [15, 13.8], SSP: [13.6, 12.3], CSW: [12.25, 12.3], LCK: [11.0, 12.3], MEF: [9.48, 12.3], LAK: [7.6, 12.3], KWF: [6.0, 12.3], KWH: [4.5, 12.3], TWH: [3.0, 12.3], TSW: [1.5, 12.3] } },
  { line: 'KTL', paths: [[[21.2, 17.2], [16.04, 17.2], [15.24, 16.4], [15.24, 10.6], [16.04, 9.8], [24.05, 9.8], [24.85, 10.6], [24.85, 14.6], [25.65, 15.4], [28.5, 15.4]]], stations: { WHA: [21.2, 17.2], HOM: [19.2, 17.2], YMT: [15.24, 15.8], MOK: [15.24, 14.8], PRE: [15.24, 13.8], SKM: [15.24, 11.7], KOT: [17.5, 9.8], LOF: [19.0, 9.8], WTS: [20.5, 9.8], DIH: [22.0, 9.8], CHH: [23.4, 9.8], KOB: [24.85, 11.3], NTK: [24.85, 12.2], KWT: [24.85, 13.1], LAT: [24.85, 14.0], YAT: [27.2, 15.4], TIK: [28.5, 15.4] } },
  { line: 'TKL', paths: [[[22.6, 21.76], [25.2, 21.76], [25.9, 21.06], [25.9, 16.34], [26.6, 15.64], [30.2, 15.64], [31.0, 14.84], [31.0, 12.4]], [[30.2, 15.64], [31.0, 16.44], [31.0, 17.6]]], stations: { NOP: [22.6, 21.76], QUB: [24.6, 21.76], YAT: [27.2, 15.64], TIK: [28.5, 15.64], TKO: [29.6, 15.64], HAH: [31.0, 13.6], POA: [31.0, 12.4], LHP: [31.0, 17.6] } },
  { line: 'TML', paths: [[[1, 7.0], [1, 2.9], [1.8, 2.1], [3.2, 2.1], [4, 2.9], [4, 8.0], [5.5, 9.5], [8.68, 9.5], [9.48, 10.3], [9.48, 15.5], [12.58, 18.6], [18.4, 18.6], [19.2, 17.8], [19.2, 16.3], [22.0, 13.5], [22.0, 9.0], [21.2, 8.2], [18.54, 8.2], [17.74, 7.4], [17.74, 6.2], [19.44, 4.5], [28.6, 4.5]]], stations: { TUM: [1, 7.0], SIH: [1, 4.6], TIS: [2.5, 2.1], LOP: [4, 3.7], YUL: [4, 5.2], KSR: [4, 6.7], TWW: [7.0, 9.5], MEF: [9.48, 12.06], NAC: [9.48, 14.9], AUS: [10.9, 16.92], ETS: [16.2, 18.6], HUH: [17.5, 18.6], HOM: [19.2, 16.96], TKW: [20.5, 15.0], SUW: [22, 12.8], KAT: [22, 11.4], DIH: [22, 10.04], HIK: [20.0, 8.2], TAW: [17.74, 6.8], CKT: [18.6, 5.34], STW: [20.2, 4.5], CIO: [21.6, 4.5], SHM: [23.0, 4.5], TSH: [24.4, 4.5], HEO: [25.8, 4.5], MOS: [27.2, 4.5], WKS: [28.6, 4.5] } },
  { line: 'EAL', paths: [[[12.4, 22.24], [13.0, 22.24], [13.94, 21.3], [16.3, 21.3], [17.5, 20.1], [17.5, 2.9], [16.7, 2.1], [10.2, 2.1]], [[12.2, 2.1], [11.4, 2.9], [10.2, 2.9]]], stations: { ADM: [12.4, 22.24], EXC: [15.4, 21.3], HUH: [17.5, 18.36], MKK: [17.5, 13.0], KOT: [17.5, 10.04], TAW: [17.5, 6.8], SHT: [17.5, 5.8], FOT: [17.5, 4.7], UNI: [17.5, 3.6], TAP: [16.0, 2.1], TWO: [14.75, 2.1], FAN: [13.5, 2.1], SHS: [12.2, 2.1], LOW: [10.2, 2.1], LMC: [10.2, 2.9] } },
  { line: 'SIL', paths: [[[12.4, 22.48], [13.0, 22.48], [13.8, 23.28], [13.8, 24.5], [13.0, 25.3], [9.0, 25.3]]], stations: { ADM: [12.4, 22.48], OCP: [13.8, 23.9], WCH: [12.4, 25.3], LET: [10.7, 25.3], SOH: [9.0, 25.3] } },
  { line: 'TCL', paths: [[[9.24, 21.3], [9.24, 13.4], [8.38, 12.54], [7.0, 12.54], [5.0, 14.54], [5.0, 18.3], [4.2, 19.1], [2.6, 19.1]]], stations: { HOK: [9.24, 21.3], KOW: [9.24, 17.9], OLY: [9.24, 16.3], NAC: [9.24, 14.9], LAK: [7.6, 12.54], TSY: [5.0, 15.4], SUN: [5.0, 17.6], TUC: [2.6, 19.1] } },
  { line: 'AEL', paths: [[[9.0, 21.3], [9.0, 13.499], [8.281, 12.78], [7.099, 12.78], [5.24, 14.639], [5.24, 16.2], [4.24, 17.2], [1.9, 17.2]]], stations: { HOK: [9.0, 21.3], KOW: [9.0, 17.9], TSY: [5.24, 15.4], AIR: [3.4, 17.2], AWE: [1.9, 17.2] } },
  { line: 'DRL', paths: [[[5.24, 17.6], [5.24, 19.6]]], stations: { SUN: [5.24, 17.6], DIS: [5.24, 19.6] } },
];

/** 站名位置（冇寫就喺下面） */
export const MTR_MAP_LABELS: Readonly<Record<string, LabelSide>> = {
  CEN: 's', ADM: 'sw', SKW: 'e', HFC: 'e', CHW: 'e', TST: 'w', JOR: 'w', YMT: 'w', MOK: 'w', PRE: 'w', SSP: 'n', CSW: 'n', LCK: 'n', MEF: 'ne', LAK: 'n', KWF: 'n', KWH: 'n', TWH: 'n', TSW: 'n', WHA: 'e', HOM: 'se', SKM: 'e', KOT: 'nw', LOF: 'n', WTS: 'n', DIH: 'se', CHH: 'n', KOB: 'e', NTK: 'e', KWT: 'e', LAT: 'e', YAT: 'n', TIK: 'n', NOP: 's', QUB: 's', TKO: 's', HAH: 'e', POA: 'e', LHP: 'e', TUM: 'e', SIH: 'e', TIS: 'n', LOP: 'e', YUL: 'e', KSR: 'e', TWW: 'n', NAC: 'e', AUS: 'ne', ETS: 'n', HUH: 'se', TKW: 'se', SUW: 'e', KAT: 'e', HIK: 'n', TAW: 'w', CKT: 'se', STW: 'n', CIO: 'n', SHM: 'n', TSH: 'n', HEO: 'n', MOS: 'n', WKS: 'n', EXC: 'n', MKK: 'e', SHT: 'w', FOT: 'w', UNI: 'w', TAP: 'n', TWO: 'n', FAN: 'n', SHS: 'n', LOW: 'w', LMC: 'w', OCP: 'e', WCH: 's', LET: 's', SOH: 's', HOK: 'nw', KOW: 'w', OLY: 'w', TSY: 'w', SUN: 'w', TUC: 's', AIR: 'n', AWE: 'n', DIS: 's',
};

/** 站名同站粒之間額外留位（例如奧運：左邊仲有機場快綫） */
export const MTR_MAP_LABEL_GAP: Readonly<Record<string, number>> = { OLY: 0.42 };

export interface MtrMapStation {
  code: string;
  /** 各綫嘅點 */
  pts: Pt[];
  lines: string[];
  /** 站粒嘅範圍（轉車站係包住所有點嘅圓角長方） */
  box: { x: number; y: number; w: number; h: number };
  label: LabelSide;
  /** 站名額外留位 */
  labelGap: number;
}

/** 由綫嘅資料整理出每個站（站粒範圍、經過嘅綫） */
export function mtrMapStations(pad = 0.15): MtrMapStation[] {
  const map = new Map<string, { pts: Pt[]; lines: string[] }>();
  for (const l of MTR_MAP_LINES) {
    for (const [code, p] of Object.entries(l.stations)) {
      const s = map.get(code) ?? { pts: [], lines: [] };
      s.pts.push(p);
      if (!s.lines.includes(l.line)) s.lines.push(l.line);
      map.set(code, s);
    }
  }
  return [...map.entries()].map(([code, s]) => {
    const xs = s.pts.map((p) => p[0]);
    const ys = s.pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    return { code, pts: s.pts, lines: s.lines, box: { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 }, label: MTR_MAP_LABELS[code] ?? 's', labelGap: MTR_MAP_LABEL_GAP[code] ?? 0 };
  });
}

/** 站名擺位：相對站粒範圍，回傳文字錨點（x、y）同對齊（start／middle／end） */
export function mtrLabelPos(box: MtrMapStation['box'], side: LabelSide, gap = 0.14): { x: number; y: number; anchor: 'start' | 'middle' | 'end'; baseline: 'top' | 'middle' | 'bottom' } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const right = box.x + box.w + gap;
  const left = box.x - gap;
  const top = box.y - gap;
  const bottom = box.y + box.h + gap;
  switch (side) {
    case 'n':
      return { x: cx, y: top, anchor: 'middle', baseline: 'bottom' };
    case 's':
      return { x: cx, y: bottom, anchor: 'middle', baseline: 'top' };
    case 'e':
      return { x: right, y: cy, anchor: 'start', baseline: 'middle' };
    case 'w':
      return { x: left, y: cy, anchor: 'end', baseline: 'middle' };
    case 'ne':
      return { x: right, y: top, anchor: 'start', baseline: 'bottom' };
    case 'nw':
      return { x: left, y: top, anchor: 'end', baseline: 'bottom' };
    case 'se':
      return { x: right, y: bottom, anchor: 'start', baseline: 'top' };
    case 'sw':
      return { x: left, y: bottom, anchor: 'end', baseline: 'top' };
  }
}

/** 折綫 → SVG path「M x y L x y …」（直角） */
export function mtrPathD(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** 點 p 喺唔喺線段 a–b 上（容差 0.01） */
const onSeg = (p: Pt, a: Pt, b: Pt) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < 0.01;

/**
 * 折綫 → 圓角 SVG path（似港鐵圖嘅彎位）：每個轉角用二次曲綫，一律由轉角起計 radius 格開始彎（統一）。
 * 座標已經保證段夠長、站離轉角夠遠；萬一唔夠先縮細（安全網）。
 */
export function mtrRoundPathD(pts: readonly Pt[], stations: readonly Pt[] = [], radius = MTR_MAP_BEND): string {
  if (pts.length < 3) return mtrPathD(pts);
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const p = pts[i]!;
    const b = pts[i + 1]!;
    let r = Math.min(radius, dist(a, p) / 2, dist(p, b) / 2);
    for (const s of stations) if (onSeg(s, a, p) || onSeg(s, p, b)) r = Math.min(r, dist(s, p) - 0.3);
    if (r <= 0.05) {
      d += ` L${p[0]} ${p[1]}`;
      continue;
    }
    const ka = r / dist(a, p);
    const kb = r / dist(p, b);
    const p1: Pt = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka];
    const p2: Pt = [p[0] + (b[0] - p[0]) * kb, p[1] + (b[1] - p[1]) * kb];
    d += ` L${+p1[0].toFixed(3)} ${+p1[1].toFixed(3)} Q${p[0]} ${p[1]} ${+p2[0].toFixed(3)} ${+p2[1].toFixed(3)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L${last[0]} ${last[1]}`;
}
