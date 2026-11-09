"""輕鐵路線同站（src/lrt-data.ts）：由港鐵開放數據 light_rail_routes_and_stops.csv 生成。

用法：python3 packages/core/tools/lrt-data.py [CSV 路徑] [--write]
冇 CSV 路徑就由 opendata.mtr.com.hk 下載。冇 --write 就印 TS。只用標準庫。
同一個站連續出現兩次（總站掉頭，例如 507 田景）只留一次。
"""
import csv, io, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://opendata.mtr.com.hk/data/light_rail_routes_and_stops.csv'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
raw = open(args[0], encoding='utf-8-sig').read() if args else urllib.request.urlopen(URL, timeout=60).read().decode('utf-8-sig')
rows = list(csv.DictReader(io.StringIO(raw)))

stops = {}
routes = {}
for r in rows:
    sid = r['Stop ID'].strip()
    stops[sid] = (r['Chinese Name'].strip().replace('茘', '荔'), r['English Name'].strip(), r['Stop Code'].strip())
    routes.setdefault(r['Line Code'].strip(), {}).setdefault(r['Direction'].strip(), []).append((float(r['Sequence']), sid))

order = lambda k: (int(''.join(c for c in k if c.isdigit())), k)
out_routes = {}
for line in sorted(routes, key=order):
    out_routes[line] = {}
    for d in sorted(routes[line]):
        seq = [s for _, s in sorted(routes[line][d])]
        seq = [s for i, s in enumerate(seq) if i == 0 or s != seq[i - 1]]
        out_routes[line][d] = seq

lines = [
    '// 由 tools/lrt-data.py 生成（港鐵開放數據 light_rail_routes_and_stops.csv），唔好人手改。',
    '/** 輕鐵站：站 ID（到站 API 嘅 station_id）→ [中文名, 英文名, 站代號] */',
    'export const LRT_STOPS: Record<string, readonly [zh: string, en: string, code: string]> = {',
    *[f'  "{k}": {json.dumps(list(v), ensure_ascii=False)},' for k, v in sorted(stops.items(), key=lambda kv: int(kv[0]))],
    '};',
    '',
    '/** 輕鐵路線：路線號碼 → 方向（"1"／"2"）→ 站 ID 次序 */',
    'export const LRT_ROUTE_STOPS: Record<string, Record<string, readonly string[]>> = {',
    *[f'  "{k}": {json.dumps(v, ensure_ascii=False)},' for k, v in out_routes.items()],
    '};',
    '',
]
ts = '\n'.join(lines)
if '--write' in sys.argv:
    open(os.path.join(ROOT, 'src/lrt-data.ts'), 'w').write(ts)
    print(f'寫咗 {len(stops)} 個站、{len(out_routes)} 條路線', file=sys.stderr)
else:
    print(ts)
