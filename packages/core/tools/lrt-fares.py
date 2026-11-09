"""輕鐵車費（apps/web/lib/lrt-fares.json，/api/lrt/fare 用）：由港鐵開放數據 light_rail_fares.csv 生成。

用法：python3 packages/core/tools/lrt-fares.py [CSV 路徑]
冇 CSV 路徑就由 opendata.mtr.com.hk 下載。只用標準庫。每年加價後重新跑。
輸出：{起點站 ID: {終點站 ID: [八達通成人, 小童, 長者, 殘疾, 學生, 樂悠咭, 單程成人, 單程小童, 單程長者]}}
"""
import csv, io, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
URL = 'https://opendata.mtr.com.hk/data/light_rail_fares.csv'
COLS = ['fare_octo_adult', 'fare_octo_child', 'fare_octo_elderly', 'fare_octo_pwd', 'fare_octo_student', 'fare_octo_joyyou_sixty',
        'fare_single_adult', 'fare_single_child', 'fare_single_elderly']
raw = open(sys.argv[1], encoding='utf-8-sig').read() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=60).read().decode('utf-8-sig')
out = {}
for r in csv.DictReader(io.StringIO(raw)):
    a, b = r['from_station_id'].strip(), r['to_station_id'].strip()
    if a == b: continue
    out.setdefault(a, {})[b] = [float(r[c]) for c in COLS]
path = os.path.join(ROOT, 'apps/web/lib/lrt-fares.json')
open(path, 'w').write(json.dumps(out, separators=(',', ':')))
print(f'寫咗 {path}：{len(out)} 個起點', file=sys.stderr)
