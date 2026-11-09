"""輕鐵站真實位置（LRT_STOP_LL，src/lrt-geo.ts）：OpenStreetMap 輕鐵站點，附近輕鐵站同排路綫圖用。

用法：python3 packages/core/tools/lrt-coords.py [快取目錄] [--write]
同 mtr-coords.py／mtr-water.py 共用快取（stations.json）。只要 station=light_rail 或者 light_rail=yes 嘅點，
中文或者英文名同 src/lrt-data.ts 一樣；幾個點取中位數。OSM 冇嘅站（例如海皇路）用路線上前後兩個站嘅中點。
只用標準庫。數據 © OpenStreetMap 貢獻者（ODbL）。
"""
import collections, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '/tmp/hknt-mtr-osm'
path = os.path.join(CACHE, 'stations.json')
if not os.path.exists(path):
    sys.exit(f'冇 {path}：先行 mtr-coords.py（會由 Overpass 下載）')
osm = json.load(open(path))
src = open(os.path.join(ROOT, 'src/lrt-data.ts')).read()
stops = {k: (z, e) for k, z, e in re.findall(r'"(\d+)": \["([^"]+)", "([^"]+)", "[^"]*"\]', src)}
routes = re.findall(r'"\d+": (\[[^\]]*\])', src.split('LRT_ROUTE_STOPS')[1])


def nz(s): return unicodedata.normalize('NFKC', s or '').replace('（', '(').replace('）', ')').strip()
def norm(s): return ''.join(c for c in (s or '').lower() if c.isalnum())


cands = collections.defaultdict(list)
for e in osm['elements']:
    t = e.get('tags', {})
    if not (t.get('station') == 'light_rail' or t.get('light_rail') == 'yes'):
        continue
    lat = e.get('lat') or e.get('center', {}).get('lat')
    lon = e.get('lon') or e.get('center', {}).get('lon')
    if lat is None or not (22.36 < lat < 22.48 and 113.94 < lon < 114.06):
        continue
    zh = {nz(t.get(k)) for k in ('name:zh', 'name:zh-Hant', 'name:zh-HK', 'name')}
    zh |= {z.split(' ')[0] for z in zh}
    ens = {norm(t.get('name:en'))}
    for sid, (z, en) in stops.items():
        if z in zh or (z + '站') in zh or norm(en) in ens:
            cands[sid].append((lat, lon))

ll = {}
for sid, c in cands.items():
    lats = sorted(p[0] for p in c)
    lons = sorted(p[1] for p in c)
    ll[sid] = (lats[len(lats) // 2], lons[len(lons) // 2])
# OSM 冇嘅站：路線上前後兩個站嘅中點
for sid in stops:
    if sid in ll:
        continue
    for seq in routes:
        ids = json.loads(seq)
        if sid in ids:
            i = ids.index(sid)
            if 0 < i < len(ids) - 1 and ids[i - 1] in ll and ids[i + 1] in ll:
                a, b = ll[ids[i - 1]], ll[ids[i + 1]]
                ll[sid] = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                print(f'{sid} {stops[sid][0]}：OSM 冇，用前後站中點', file=sys.stderr)
                break
missing = [f'{s} {stops[s][0]}' for s in stops if s not in ll]
if missing:
    sys.exit(f'搵唔到：{missing}')

ts = '\n'.join([
    '// 由 tools/lrt-coords.py 生成，唔好人手改。',
    '/** 輕鐵站真實位置 [緯度, 經度]（附近輕鐵站、排路綫圖用）。數據 © OpenStreetMap 貢獻者（ODbL）。 */',
    'export const LRT_STOP_LL: Record<string, readonly [number, number]> = {',
    *[f'  "{s}": [{round(ll[s][0], 5)}, {round(ll[s][1], 5)}],' for s in sorted(ll, key=int)],
    '};',
    '',
])
if '--write' in sys.argv:
    open(os.path.join(ROOT, 'src/lrt-geo.ts'), 'w').write(ts)
    print(f'寫咗 {len(ll)} 個站', file=sys.stderr)
else:
    print(ts)
