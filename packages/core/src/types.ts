/** 方向：O = outbound，I = inbound（城巴同九巴各自定義，聯營線兩邊可以相反） */
export type Dir = 'O' | 'I';

export interface Stop {
  nameTc: string;
  nameEn: string;
  lat: number;
  lng: number;
  /** 聯營線（城巴路線檔）：同一個位置嘅九巴站 ID */
  kmb?: string;
  /** 聯營線（九巴路線檔，例如 101R）：同一個位置嘅城巴站 ID */
  ctb?: string;
}

/**
 * 走法。城巴路線檔：政府走法（GTFS route_id + 方向），站點係城巴站 ID。
 * 九巴路線檔：九巴 bound + service_type，站點係九巴站 ID，再配對政府走法攞時間表同走線。
 */
export interface Variant {
  id: string;
  /** 對應嘅政府走法；九巴走法配唔到政府就係 null（冇時間表同走線） */
  govRouteId: string | null;
  govDir: string | null;
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
  /** 九巴 ETA 查詢參數（九巴路線同聯營線先有）：bound 係九巴嘅方向，同城巴可以相反 */
  kmb?: { bound: Dir; serviceType: string };
  /** 城巴 ETA 查詢方向（九巴做主幹嘅聯營線先有） */
  ctb?: { dir: Dir };
}

export interface RouteData {
  /** 路線檔屬邊間公司嘅數據（決定站 ID 係城巴定九巴） */
  company: 'CTB' | 'KMB';
  /** 實際營辦嘅公司；聯營線係 ['CTB', 'KMB'] */
  companies?: Company[];
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
    /** 路線檔喺邊：ctb/<路線> 或 kmb/<路線>（舊數據冇呢欄，當 ctb） */
    co?: 'ctb' | 'kmb';
    /** 營辦公司；聯營線兩間 */
    companies?: Company[];
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

export type Company = 'CTB' | 'KMB' | 'LWB';

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
  /** 九巴「原定班次」：時間表時間，唔係實時；唔用嚟推算巴士位置 */
  scheduled?: boolean;
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
