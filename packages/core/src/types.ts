/** 城巴方向：O = outbound，I = inbound */
export type Dir = 'O' | 'I';

export interface Stop {
  nameTc: string;
  nameEn: string;
  lat: number;
  lng: number;
}

/** 政府走法（GTFS route_id + 方向），站點已換成城巴站 ID */
export interface Variant {
  id: string;
  govRouteId: string;
  govDir: string;
  name: string;
  /** 運輸署 specialType = 1，即特別班 */
  special: boolean;
  /** 城巴站 ID；null = 政府有但城巴冇呢個站 */
  stops: (string | null)[];
  /** 每個站屬城巴 O 定 I（循環線兩樣都有） */
  stopDirs: (Dir | null)[];
  /** 配對級別：A 同名近、B 同名遠、C 唔同名近、X 配唔到、M 人手 */
  stopMatch: string[];
  /** 由總站開出到每個站嘅估計秒數 */
  offsets: number[];
  /** 每個 serviceId 嘅開車時間（由午夜起計分鐘，可以 >1440 代表過咗午夜） */
  schedules: { serviceId: string; departures: number[] }[];
  /** 走線：第 i 段 = 第 i 站 → 第 i+1 站，[lng, lat] */
  line: [number, number][][] | null;
  /** 走線段數同站數係咪對得上 */
  lineAligned: boolean;
  /** `${dir}:${stopId}` -> 呢個走法經過呢個站時，城巴 ETA 應該出嘅 seq */
  expSeq: Record<string, number>;
  /**
   * 站到站行車時間（秒），對應 variantStops() 相鄰兩個站（長度 = 站數 - 1）。
   * 主要來自 hk-bus-time-between-stops 嘅實測平均；冇數據嘅段用距離估算。
   */
  segSeconds?: number[];
  /** segSeconds 每段係咪實測 */
  segMeasured?: boolean[];
}

export interface RouteData {
  company: 'CTB';
  route: string;
  origTc: string | null;
  destTc: string | null;
  origEn: string | null;
  destEn: string | null;
  stops: Record<string, Stop>;
  directions: Partial<Record<Dir, string[]>>;
  /** 城巴有、政府任何走法都冇嘅站，格式 `${dir}:${stopId}` */
  ctbOnlyStops: string[];
  variants: Variant[];
}

export interface RouteIndex {
  generatedAt: string;
  routes: {
    route: string;
    origTc: string;
    destTc: string;
    /** 有邊幾個方向（O = 由 orig 往 dest，I = 回程）；只有 O 即係單向 */
    dirs?: Dir[];
    variants: number;
    special: number;
  }[];
}

/** GTFS 服務日曆 */
export type Calendar = Record<
  string,
  { days: boolean[]; start: string; end: string; add: string[]; remove: string[] }
>;

export type Company = 'CTB' | 'KMB';

/** 統一格式嘅到站時間 */
export interface Eta {
  company: Company;
  route: string;
  dir: Dir;
  stopId: string;
  /** ISO 時間；null = 冇班次（例如尾班車已過） */
  eta: string | null;
  /** 營辦商回傳嘅站序（城巴：實際走法入面嘅站序） */
  seq: number;
  destTc: string;
  destEn: string;
  remarkTc: string;
  remarkEn: string;
  variant?: VariantGuess;
}

export interface VariantGuess {
  variantId: string | null;
  name: string | null;
  special: boolean;
  /**
   * certain：只有一個走法經過呢個站，或者只有一個走法嘅 seq 吻合
   * likely：靠時間表推斷
   * unknown：推斷唔到
   */
  confidence: 'certain' | 'likely' | 'unknown';
  reason: string;
}
