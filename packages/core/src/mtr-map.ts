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

export const MTR_MAP_VIEW = { minX: -0.6, minY: 0.2, width: 33.2, height: 26.4 } as const;

/** 背景：維多利亞港（簡化水域）同地區名（淺灰大字） */
export const MTR_MAP_WATER: readonly (readonly Pt[])[] = [
  [[7.2, 19.25], [7.85, 18.6], [32.6, 18.6], [32.6, 19.85], [7.85, 19.85], [7.2, 19.25]],
];
export const MTR_MAP_REGIONS: readonly { zh: string; en: string; at: Pt }[] = [
  { zh: '新界', en: 'New Territories', at: [9, 6] },
  { zh: '九龍', en: 'Kowloon', at: [20.6, 11.4] },
  { zh: '港島', en: 'Hong Kong Island', at: [21, 23.6] },
];

export const MTR_MAP_LINES: readonly MtrMapLine[] = [
  {
    line: 'ISL',
    paths: [[[3, 21], [29.6, 21], [30.6, 22], [30.6, 25]]],
    stations: {
      KET: [3, 21], HKU: [5, 21], SYP: [7, 21], SHW: [9, 21], CEN: [11, 21], ADM: [13, 21], WAC: [15, 21], CAB: [17, 21],
      TIH: [19, 21], FOH: [21, 21], NOP: [23, 21], QUB: [25, 21], TAK: [27, 21], SWH: [29, 21], SKW: [30.6, 22.4], HFC: [30.6, 23.7], CHW: [30.6, 25],
    },
  },
  {
    line: 'TWL',
    paths: [[[11, 20.4], [13, 20.4], [15, 18.4], [15, 12], [1.5, 12]]],
    stations: {
      CEN: [11, 20.4], ADM: [13, 20.4], TST: [15, 17], JOR: [15, 16], YMT: [15, 15], MOK: [15, 14], PRE: [15, 13],
      SSP: [13.5, 12], CSW: [12, 12], LCK: [10.5, 12], MEF: [9, 12], LAK: [7.5, 12], KWF: [6, 12], KWH: [4.5, 12], TWH: [3, 12], TSW: [1.5, 12],
    },
  },
  {
    line: 'KTL',
    paths: [[[21, 16], [16.6, 16], [15.6, 15], [15.6, 10], [16.6, 9], [24, 9], [25, 10], [25, 14], [26, 15], [28, 15]]],
    stations: {
      WHA: [21, 16], HOM: [19.5, 16], YMT: [15.6, 15], MOK: [15.6, 14], PRE: [15.6, 13], SKM: [15.6, 11.3], KOT: [17.5, 9], LOF: [19, 9],
      WTS: [20.5, 9], DIH: [22, 9], CHH: [23.5, 9], KOB: [25, 10.3], NTK: [25, 11.5], KWT: [25, 12.7], LAT: [25, 13.8], YAT: [26.6, 15], TIK: [28, 15],
    },
  },
  {
    line: 'TKL',
    paths: [
      [[23, 20.4], [25.6, 20.4], [26.6, 19.4], [26.6, 15.6], [29.5, 15.6], [30.5, 14.6], [30.5, 12]],
      [[29.5, 15.6], [30.5, 16.6], [30.5, 17.6]],
    ],
    stations: { NOP: [23, 20.4], QUB: [25, 20.4], YAT: [26.6, 15.6], TIK: [28, 15.6], TKO: [29.5, 15.6], HAH: [30.5, 13.6], POA: [30.5, 12], LHP: [30.5, 17.6] },
  },
  {
    line: 'TML',
    paths: [
      [
        [1, 6.5], [1, 2], [3, 2], [3, 7.5], [4.5, 9], [8, 9], [9, 10], [9, 13], [14, 18], [18.5, 18], [19.5, 17], [19.5, 15.5],
        [22, 13], [22, 8], [21, 7], [18.1, 7], [18.1, 5], [19.1, 4], [29, 4],
      ],
    ],
    stations: {
      TUM: [1, 6.5], SIH: [1, 4.5], TIS: [2, 2], LOP: [3, 3.5], YUL: [3, 5], KSR: [3, 6.5], TWW: [5.5, 9], MEF: [9, 12], NAC: [10.6, 14.6], AUS: [12.6, 16.6],
      ETS: [15.8, 18], HUH: [17.5, 18], HOM: [19.5, 16], TKW: [20.5, 14.5], SUW: [22, 12], KAT: [22, 10.5], DIH: [22, 9], HIK: [19.6, 7], TAW: [18.1, 7],
      CKT: [18.1, 5.8], STW: [20.2, 4], CIO: [21.7, 4], SHM: [23.2, 4], TSH: [24.7, 4], HEO: [26.2, 4], MOS: [27.6, 4], WKS: [29, 4],
    },
  },
  {
    line: 'EAL',
    paths: [
      [[13.5, 20.4], [16.5, 20.4], [17.5, 19.4], [17.5, 2.3], [16.7, 1.5], [10.5, 1.5]],
      [[12.5, 1.5], [11.5, 2.5], [10.5, 2.5]],
    ],
    stations: {
      ADM: [13.5, 20.4], EXC: [15.6, 20.4], HUH: [17.5, 18], MKK: [17.5, 12], KOT: [17.5, 9], TAW: [17.5, 7], SHT: [17.5, 5.5], FOT: [17.5, 4.2], UNI: [17.5, 3],
      TAP: [16.2, 1.5], TWO: [15, 1.5], FAN: [13.8, 1.5], SHS: [12.5, 1.5], LOW: [10.5, 1.5], LMC: [10.5, 2.5],
    },
  },
  {
    line: 'SIL',
    paths: [[[13, 21], [13, 23], [12, 24], [7.8, 24]]],
    stations: { ADM: [13, 21], OCP: [13, 22.5], WCH: [11.1, 24], LET: [9.7, 24], SOH: [7.8, 24] },
  },
  {
    line: 'TCL',
    paths: [[[10, 20.3], [10, 14.8], [8.2, 13], [7, 13], [1.5, 18.5]]],
    stations: { HOK: [10, 20.3], KOW: [10, 17.6], OLY: [10, 16.2], NAC: [10, 14.8], LAK: [7.5, 13], TSY: [5, 15], SUN: [3.8, 16.2], TUC: [1.5, 18.5] },
  },
  {
    line: 'AEL',
    paths: [[[10.6, 20.3], [10.6, 17.6], [7.4, 17.6], [5.4, 15.6], [1.6, 19.4]]],
    stations: { HOK: [10.6, 20.3], KOW: [10.6, 17.6], TSY: [5.4, 15.6], AIR: [2.8, 18.2], AWE: [1.6, 19.4] },
  },
  {
    line: 'DRL',
    paths: [[[3.8, 16.2], [4.8, 17.2], [4.8, 18.4]]],
    stations: { SUN: [3.8, 16.2], DIS: [4.8, 18.4] },
  },
];

/** 站名位置（冇寫就喺下面） */
export const MTR_MAP_LABELS: Readonly<Record<string, LabelSide>> = {
  // 港島綫
  CEN: 's', ADM: 'sw', SKW: 'e', HFC: 'e', CHW: 'e',
  // 荃灣綫（西邊一行字喺上面）
  TST: 'w', JOR: 'w', YMT: 'w', MOK: 'w', PRE: 'w', SSP: 'n', CSW: 'n', LCK: 'n', MEF: 'se', LAK: 'n', KWF: 'n', KWH: 'n', TWH: 'n', TSW: 'n',
  // 觀塘綫
  WHA: 'e', HOM: 'se', SKM: 'e', KOT: 'nw', LOF: 'n', WTS: 'n', DIH: 'se', CHH: 'n', KOB: 'e', NTK: 'e', KWT: 'e', LAT: 'e', YAT: 'sw', TIK: 'n',
  // 將軍澳綫
  NOP: 's', QUB: 's', TKO: 'sw', HAH: 'e', POA: 'e', LHP: 'e',
  // 屯馬綫
  TUM: 'e', SIH: 'e', TIS: 'n', LOP: 'e', YUL: 'e', KSR: 'e', TWW: 's', NAC: 'ne', AUS: 'w', ETS: 'ne', HUH: 'se', TKW: 'se', SUW: 'e', KAT: 'e',
  HIK: 's', TAW: 'w', CKT: 'e', STW: 'n', CIO: 'n', SHM: 'n', TSH: 'n', HEO: 'n', MOS: 'n', WKS: 'n',
  // 東鐵綫
  EXC: 'n', MKK: 'e', SHT: 'w', FOT: 'w', UNI: 'w', TAP: 'n', TWO: 'n', FAN: 'n', SHS: 'n', LOW: 'w', LMC: 'w',
  // 南港島綫
  OCP: 'e', WCH: 's', LET: 's', SOH: 's',
  // 東涌綫、機場快綫、迪士尼綫
  HOK: 'w', KOW: 'e', OLY: 'w', TSY: 'nw', SUN: 'nw', TUC: 'w', AIR: 'se', AWE: 'w', DIS: 's',
};

export interface MtrMapStation {
  code: string;
  /** 各綫嘅點 */
  pts: Pt[];
  lines: string[];
  /** 站粒嘅範圍（轉車站係包住所有點嘅圓角長方） */
  box: { x: number; y: number; w: number; h: number };
  label: LabelSide;
}

/** 由綫嘅資料整理出每個站（站粒範圍、經過嘅綫） */
export function mtrMapStations(pad = 0.24): MtrMapStation[] {
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
    return { code, pts: s.pts, lines: s.lines, box: { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 }, label: MTR_MAP_LABELS[code] ?? 's' };
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
 * 折綫 → 圓角 SVG path（似港鐵圖嘅彎位）：每個轉角用二次曲綫，半徑最多 radius 格，
 * 唔超過兩邊線段嘅一半，亦唔會彎到附近嘅站（站要留喺直綫上，距離少過 0.3 格就唔彎）。
 */
export function mtrRoundPathD(pts: readonly Pt[], stations: readonly Pt[] = [], radius = 0.9): string {
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
