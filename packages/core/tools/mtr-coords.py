"""港鐵站真實位置（MTR_STATION_LL）：由 OpenStreetMap 站點生成，首頁「附近港鐵站」用。

用法：
  python3 packages/core/tools/mtr-coords.py [快取目錄] [--write]
  同 mtr-water.py 共用快取（stations.json，第一次由 Overpass 下載）。冇 --write 就印 TS；有 --write 寫 src/mtr-geo.ts。
配對：OSM 站（唔計輕鐵）中文或者英文名同 src/mtr-data.ts 一樣；幾個點（站、站體）取中位數。
只用標準庫。數據 © OpenStreetMap 貢獻者（ODbL）。
"""
import collections, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # packages/core
args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '/tmp/hknt-mtr-osm'
os.makedirs(CACHE, exist_ok=True)
S_, W_, N_, E_ = 22.12, 113.80, 22.60, 114.40
MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']


def overpass(name, q):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        return json.load(open(path))
    for i in range(3):
        for url in MIRRORS:
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'hknt-mtr-coords'})
                body = urllib.request.urlopen(req, timeout=240).read()
                d = json.loads(body)
                open(path, 'wb').write(body)
                return d
            except Exception as e:
                print(f'{url} 失敗：{e}', file=sys.stderr)
        time.sleep(5 * (i + 1))
    sys.exit('Overpass 下載唔到')


osm = overpass('stations.json', f'[out:json][timeout:120];(nwr["railway"="station"]({S_},{W_},{N_},{E_});nwr["public_transport"="station"]({S_},{W_},{N_},{E_}););out tags center;')
names = dict((c, (z, e)) for c, z, e in re.findall(r'(\w{3}): \["([^"]+)", "([^"]+)"\]', open(os.path.join(ROOT, 'src/mtr-data.ts')).read()))


def norm(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', s or '').lower())
def nz(s): return unicodedata.normalize('NFKC', s or '').replace('茘', '荔').replace('湾', '灣').strip()


cands = collections.defaultdict(list)
for e in osm['elements']:
    t = e.get('tags', {})
    if t.get('station') == 'light_rail' or t.get('light_rail') == 'yes' or t.get('railway') == 'tram_stop':
        continue
    if t.get('railway') != 'station' and not (t.get('train') == 'yes' or t.get('subway') == 'yes'):
        continue
    lat = e.get('lat') or e.get('center', {}).get('lat')
    lon = e.get('lon') or e.get('center', {}).get('lon')
    if lat is None:
        continue
    ens = {norm(t.get(k)) for k in ('name:en', 'official_name:en')} - {''}
    zhs = {nz(t.get(k)) for k in ('name:zh', 'name:zh-Hant', 'name:zh-HK')} - {''}
    nm = nz(t.get('name'))
    if nm:
        zhs.add(nm.split(' ')[0])
        ens.add(norm(' '.join(nm.split(' ')[1:])))
    for code, (z, en) in names.items():
        if norm(en) in ens or z in zhs or (z + '站') in zhs:
            cands[code].append((lat, lon))

out = {}
for code in sorted(names):
    c = cands.get(code)
    if not c:
        sys.exit(f'OSM 搵唔到 {code} {names[code][0]}')
    lats = sorted(p[0] for p in c)
    lons = sorted(p[1] for p in c)
    lat, lon = lats[len(lats) // 2], lons[len(lons) // 2]
    # 同一個名嘅點相距太遠（例如同名唔同站）就報出嚟
    far = max(abs(p[0] - lat) + abs(p[1] - lon) for p in c)
    if far > 0.01:
        print(f'注意：{code} {names[code][0]} 有點相距 {far:.4f} 度', file=sys.stderr)
    out[code] = (round(lat, 5), round(lon, 5))

ts = '\n'.join([
    '// 由 tools/mtr-coords.py 生成，唔好人手改。',
    '/** 港鐵站真實位置 [緯度, 經度]（首頁「附近港鐵站」用）。數據 © OpenStreetMap 貢獻者（ODbL）。 */',
    'export const MTR_STATION_LL: Record<string, readonly [number, number]> = {',
    *[f'  {c}: [{lat}, {lon}],' for c, (lat, lon) in out.items()],
    '};',
    '',
])
if '--write' in sys.argv:
    open(os.path.join(ROOT, 'src/mtr-geo.ts'), 'w').write(ts)
    print(f'寫咗 {len(out)} 個站', file=sys.stderr)
else:
    print(ts)
