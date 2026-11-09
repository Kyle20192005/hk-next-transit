"""香港電車站同路線（src/tram-data.ts）：data.gov.hk 電車站開放數據 + 運輸署 GTFS（agency TRAM）。

用法：python3 packages/core/tools/tram-data.py [快取目錄，預設 pipeline/cache] [--write]
快取目錄要有 tram_stops_tc.csv、tram_stops_en.csv、gtfs/（pipeline/fetch.py 下載）。冇 --write 就印 TS。
站配對、總站代號、電車廠站嘅座標同 pipeline 每日生成 out/tram.json 用同一套（pipeline/tram.py）。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, os.path.join(REPO, 'pipeline'))
import tram  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
cache = args[0] if args else os.path.join(REPO, 'pipeline', 'cache')
stations, order = tram.load_stations(cache)
routes = tram.load_routes(os.path.join(cache, 'gtfs'), stations, order)

KEYS = ('zh', 'en', 'dir', 'codes', 'lat', 'lng', 'terminus', 'alightOnly')
st_out = []
seen = set()
for d in ('W', 'E', 'S', 'N'):
    for sid in order[d]:
        if sid in seen:
            continue
        seen.add(sid)
        s = stations[sid]
        st_out.append({'id': sid, **{k: s[k] for k in KEYS if k in s}})
r_out = []
for r in routes:
    dirs = {d: x['stops'] for d, x in r['dirs'].items()}
    first = dirs.get('1') or next(iter(dirs.values()))
    a, b = stations[first[0]], stations[first[-1]]
    r_out.append({'id': r['id'], 'zh': r['zh'], 'en': f"{a['en']} ↔ {b['en']}", 'dirs': dirs})

def rows(xs):
    return '[\n  ' + ',\n  '.join(json.dumps(x, ensure_ascii=False, separators=(', ', ': ')) for x in xs) + ',\n]'


ts = f"""// 由 tools/tram-data.py 生成（data.gov.hk 電車站 + 運輸署 GTFS），唔好人手改
/** 行駛方向：W 西行、E 東行、S／N 跑馬地環綫南行／北行、T 總站 */
export type TramDir = 'W' | 'E' | 'S' | 'N' | 'T';
export interface TramStation {{
  /** 站 ID：一般站 = 電車公司站代號（例如 02W、01E、105），總站 = 主要代號（例如 SKT、HVT） */
  id: string;
  zh: string;
  en: string;
  dir: TramDir;
  /** 電車公司「下一班電車」到站代號（總站可以有兩個，例如上環西行到站 WM、東行開出 WMT） */
  codes: string[];
  lat: number;
  lng: number;
  terminus?: true;
  /** 只落客（屈地街電車廠） */
  alightOnly?: true;
}}
export interface TramRoute {{
  /** 運輸署 GTFS route_id */
  id: string;
  zh: string;
  en: string;
  /** GTFS 方向（1／2）→ 站 ID（行車次序） */
  dirs: Record<string, string[]>;
}}

/** 所有站：西行（筲箕灣 → 堅尼地城）、東行（堅尼地城 → 筲箕灣）、跑馬地環綫南行、北行，各自按行車次序 */
export const TRAM_STATIONS: TramStation[] = {rows(st_out)};

/** 每個方向嘅站序（行車次序，包埋中途嘅總站） */
export const TRAM_ORDER: Record<'W' | 'E' | 'S' | 'N', string[]> = {json.dumps({d: order[d] for d in ('W', 'E', 'S', 'N')}, ensure_ascii=False)};

/** 路線（運輸署 GTFS） */
export const TRAM_ROUTES: TramRoute[] = {rows(r_out)};
"""
if '--write' in sys.argv:
    path = os.path.join(ROOT, 'src', 'tram-data.ts')
    open(path, 'w', encoding='utf-8').write(ts)
    print('寫咗', path, len(st_out), '個站', len(r_out), '條路線')
else:
    print(ts)
