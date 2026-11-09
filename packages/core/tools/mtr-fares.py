"""港鐵車費（apps/web/lib/mtr-fares.json，/api/mtr/fare 用）：由港鐵開放數據 mtr_lines_fares.csv 生成。

用法：python3 packages/core/tools/mtr-fares.py [車費 CSV] [站 CSV] [機場快綫車費 CSV]
冇路徑就由 opendata.mtr.com.hk 下載（站 CSV = mtr_lines_and_stations.csv，用嚟將數字站 ID 轉做站代號）。只用標準庫。
每年加價後重新跑。馬場（70）站 CSV 冇，人手加 RAC。
機場快綫（airport_express_fares.csv）：只有香港／九龍／青衣／機場／博覽館之間，只有成人同小童，其他種類係 null。
輸出（同 lrt-fares.json 一樣次序）：{起點站代號: {終點站代號: [八達通成人, 小童, 長者, 殘疾, 學生, 樂悠咭, 單程成人, 單程小童, 單程長者]}}
"""
import csv, io, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
FARES = 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv'
STATIONS = 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv'
AEL = 'https://opendata.mtr.com.hk/data/airport_express_fares.csv'
COLS = ['OCT_ADT_FARE', 'OCT_CON_CHILD_FARE', 'OCT_CON_ELDERLY_FARE', 'OCT_CON_PWD_FARE', 'OCT_STD_FARE', 'OCT_JOYYOU_SIXTY_FARE',
        'SINGLE_ADT_FARE', 'SINGLE_CON_CHILD_FARE', 'SINGLE_CON_ELDERLY_FARE']
args = [a for a in sys.argv[1:] if not a.startswith('--')]
get = lambda path, url: open(path, encoding='utf-8-sig').read() if path else urllib.request.urlopen(url, timeout=60).read().decode('utf-8-sig')
fares = get(args[0] if len(args) > 0 else None, FARES)
stations = get(args[1] if len(args) > 1 else None, STATIONS)
ael = get(args[2] if len(args) > 2 else None, AEL)
code = {'70': 'RAC'}
for r in csv.DictReader(io.StringIO(stations)):
    if r['Station ID'].strip(): code[r['Station ID'].strip()] = r['Station Code'].strip()
out = {}
for r in csv.DictReader(io.StringIO(fares)):
    a, b = code.get(r['SRC_STATION_ID'].strip()), code.get(r['DEST_STATION_ID'].strip())
    if not a or not b: sys.exit(f"唔認得站 ID：{r['SRC_STATION_ID']} {r['DEST_STATION_ID']}")
    if a == b: continue
    out.setdefault(a, {})[b] = [float(r[c]) for c in COLS]
# 機場快綫：普通車費表冇嘅（去／由機場、博覽館）先加
n_ael = 0
for r in csv.DictReader(io.StringIO(ael)):
    a, b = code.get(r['ST_FROM_ID'].strip()), code.get(r['ST_TO_ID'].strip())
    if not a or not b: sys.exit(f"唔認得機場快綫站 ID：{r['ST_FROM_ID']} {r['ST_TO_ID']}")
    if a == b or b in out.get(a, {}): continue
    f = lambda c: float(r[c])
    out.setdefault(a, {})[b] = [f('OCT_ADT_FARE'), f('OCT_CHD_FARE'), None, None, None, None, f('SINGLE_ADT_FARE'), f('SINGLE_CHD_FARE'), None]
    n_ael += 1
print(f'機場快綫加咗 {n_ael} 對', file=sys.stderr)
path = os.path.join(ROOT, 'apps/web/lib/mtr-fares.json')
open(path, 'w').write(json.dumps(out, separators=(',', ':')))
print(f'寫咗 {path}：{len(out)} 個起點', file=sys.stderr)
