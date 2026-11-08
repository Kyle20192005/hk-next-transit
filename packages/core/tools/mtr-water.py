"""港鐵示意圖嘅海（MTR_MAP_WATER）：OpenStreetMap 海岸綫拉落示意圖座標。

做法：
1. 海岸綫畫落真實座標（km）嘅格仔，由外海填色 → 邊格係海。
2. 每個站有兩個位置：示意圖（src/mtr-map.ts）同真實（OSM 站點）。示意圖每一點用附近站嘅關係
   （moving least squares 相似變換，越近嘅站權重越大）換算返真實位置，睇佢係咪海。
3. 示意圖格仔 → 等高綫 → 簡化做多邊形。第一個環係外框（成個範圍係海），其餘係陸地邊：畫嘅時候用 evenodd。

用法：
  python3 packages/core/tools/mtr-water.py [快取目錄] [--write]
  第一次會由 Overpass 下載 OSM 站點同海岸綫（約 7MB）去快取目錄（預設 /tmp/hknt-mtr-osm）。
  冇 --write 就印 TS；有 --write 直接改 src/mtr-map.ts。改咗站位置（mtr-layout.py）要再行一次。
只用標準庫。數據 © OpenStreetMap 貢獻者（ODbL）：地圖要註明。真實座標唔入 repo，只係用嚟計變形。
"""
import json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # packages/core
args = [a for a in sys.argv[1:] if not a.startswith('--')]
CACHE = args[0] if args else '/tmp/hknt-mtr-osm'
os.makedirs(CACHE, exist_ok=True)

# Overpass 查詢範圍；raster 一定要喺入面（範圍外嘅海岸綫冇攞，填色會漏）
S_, W_, N_, E_ = 22.12, 113.80, 22.60, 114.40
MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
def overpass(name, q):
    path = os.path.join(CACHE, name)
    if os.path.exists(path): return json.load(open(path))
    for i in range(3):
        for url in MIRRORS:
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'hknt-mtr-water'})
                body = urllib.request.urlopen(req, timeout=240).read()
                d = json.loads(body)
                open(path, 'wb').write(body)
                return d
            except Exception as e:
                print(f'{url} 失敗：{e}', file=sys.stderr)
        time.sleep(5 * (i + 1))
    sys.exit('Overpass 下載唔到')
stations_osm = overpass('stations.json', f'[out:json][timeout:120];(nwr["railway"="station"]({S_},{W_},{N_},{E_});nwr["public_transport"="station"]({S_},{W_},{N_},{E_}););out tags center;')
coast = overpass('coast.json', f'[out:json][timeout:180];way["natural"="coastline"]({S_},{W_},{N_},{E_});out geom;')

lat0, lon0 = 22.33, 114.15
K = math.cos(math.radians(lat0)) * 111.32
def proj(lat, lon): return ((lon - lon0) * K, -(lat - lat0) * 110.57)

# ---------- 站：真實位置（OSM，中文或者英文名完全一樣）----------
names = dict((c, (z, e)) for c, z, e in re.findall(r'(\w{3}): \["([^"]+)", "([^"]+)"\]', open(os.path.join(ROOT, 'src/mtr-data.ts')).read()))
def norm(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', s or '').lower())
def nz(s): return unicodedata.normalize('NFKC', s or '').replace('茘', '荔').replace('湾', '灣').strip()
cands = collections.defaultdict(list)
for e in stations_osm['elements']:
    t = e.get('tags', {})
    if t.get('station') == 'light_rail' or t.get('light_rail') == 'yes' or t.get('railway') == 'tram_stop': continue
    if t.get('railway') != 'station' and not (t.get('train') == 'yes' or t.get('subway') == 'yes'): continue
    lat = e.get('lat') or e.get('center', {}).get('lat'); lon = e.get('lon') or e.get('center', {}).get('lon')
    if lat is None: continue
    ens = {norm(t.get(k)) for k in ('name:en', 'official_name:en')} - {''}
    zhs = {nz(t.get(k)) for k in ('name:zh', 'name:zh-Hant', 'name:zh-HK')} - {''}
    nm = nz(t.get('name'))
    if nm: zhs.add(nm.split(' ')[0]); ens.add(norm(' '.join(nm.split(' ')[1:])))
    for code, (z, en) in names.items():
        if norm(en) in ens or z in zhs or (z + '站') in zhs: cands[code].append(proj(lat, lon))
real = {}
for code in names:
    c = cands.get(code)
    if not c: sys.exit(f'OSM 搵唔到 {code} {names[code][0]}')
    xs = sorted(p[0] for p in c); ys = sorted(p[1] for p in c)
    real[code] = (xs[len(xs) // 2], ys[len(ys) // 2])

# ---------- 站：示意圖位置（mtr-map.ts，幾條綫嘅點取中間）----------
TS_PATH = os.path.join(ROOT, 'src/mtr-map.ts')
ts = open(TS_PATH).read()
body = ts.split('export const MTR_MAP_LINES')[1].split('\n];')[0]
sch = collections.defaultdict(list)
for m in re.finditer(r'stations: \{([^}]*)\}', body):
    for s, x, y in re.findall(r'(\w+): \[([-\d.]+), ([-\d.]+)\]', m.group(1)): sch[s].append((float(x), float(y)))
codes = sorted(sch)
src = [(sum(p[0] for p in sch[c]) / len(sch[c]), sum(p[1] for p in sch[c]) / len(sch[c])) for c in codes]
dst = [real[c] for c in codes]
view = dict(re.findall(r'(minX|minY|width|height): ([-\d.]+)', ts.split('export const MTR_MAP_VIEW')[1].split('\n')[0]))
VX0, VY0 = float(view['minX']), float(view['minY']); VX1, VY1 = VX0 + float(view['width']), VY0 + float(view['height'])

# ---------- 1. 海水 raster（真實 km）----------
X0, X1 = proj(22.3, W_ + 0.006)[0], proj(22.3, E_ - 0.006)[0]
Y0, Y1 = proj(N_ - 0.006, 114.0)[1], proj(S_ + 0.006, 114.0)[1]
S = 0.08
NX, NY = int((X1 - X0) / S), int((Y1 - Y0) / S)
grid = bytearray(NX * NY)  # 0 陸地（未填）1 海岸綫 2 海
def cell(x, y): return int((x - X0) / S), int((y - Y0) / S)
for w in coast['elements']:
    pts = [proj(g['lat'], g['lon']) for g in w['geometry']]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / (S * 0.4)))
        for i in range(n + 1):
            cx, cy = cell(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)
            if 0 <= cx < NX and 0 <= cy < NY: grid[cy * NX + cx] = 1
# 種子：南丫島以南、大嶼山西南、東面公海、吐露港、大鵬灣（raster 東邊界將後兩個同外海切開）
stack = []
for lat, lon in ((22.14, 114.30), (22.14, 113.85), (22.20, 114.38), (22.445, 114.235), (22.47, 114.37)):
    cx, cy = cell(*proj(lat, lon)); i = cy * NX + cx
    if grid[i] == 0: grid[i] = 2; stack.append(i)
while stack:
    i = stack.pop(); cx = i % NX
    for j in ((i - 1) if cx > 0 else -1, (i + 1) if cx < NX - 1 else -1, i - NX, i + NX):
        if 0 <= j < NX * NY and grid[j] == 0: grid[j] = 2; stack.append(j)
def water_real(x, y):
    cx, cy = cell(x, y)
    cx, cy = min(NX - 1, max(0, cx)), min(NY - 1, max(0, cy))  # 範圍外用最近嘅邊
    return grid[cy * NX + cx] == 2

# ---------- 2. 示意 → 真實：moving least squares（相似變換）----------
ALPHA = 1.5
def to_real(x, y):
    ws = []; sw = sx = sy = tx = ty = 0.0
    for (px, py), (qx, qy) in zip(src, dst):
        d2 = (px - x) ** 2 + (py - y) ** 2
        if d2 < 1e-10: return qx, qy
        w = 1.0 / d2 ** ALPHA; ws.append(w); sw += w; sx += w * px; sy += w * py; tx += w * qx; ty += w * qy
    pcx, pcy, qcx, qcy = sx / sw, sy / sw, tx / sw, ty / sw
    nr = ni = den = 0.0
    for w, (px, py), (qx, qy) in zip(ws, src, dst):
        ax, ay, bx, by = px - pcx, py - pcy, qx - qcx, qy - qcy
        nr += w * (ax * bx + ay * by); ni += w * (ax * by - ay * bx); den += w * (ax * ax + ay * ay)
    ar, ai = nr / den, ni / den
    vx, vy = x - pcx, y - pcy
    return qcx + ar * vx - ai * vy, qcy + ai * vx + ar * vy

# ---------- 3. 示意圖格仔（畫面外多留位，拖出去都仲有海）----------
M, GS = 14.0, 0.1
GX0, GY0 = VX0 - M, VY0 - M
GW, GH = int((VX1 - VX0 + 2 * M) / GS) + 1, int((VY1 - VY0 + 2 * M) / GS) + 1
V = [[1.0 if water_real(*to_real(GX0 + i * GS, GY0 + j * GS)) else 0.0 for i in range(GW)] for j in range(GH)]
for sx_, sy_ in src:  # 站周圍一定係陸地
    for j in range(int((sy_ - 0.4 - GY0) / GS), int((sy_ + 0.4 - GY0) / GS) + 2):
        for i in range(int((sx_ - 0.4 - GX0) / GS), int((sx_ + 0.4 - GX0) / GS) + 2):
            if 0 <= j < GH and 0 <= i < GW and (GX0 + i * GS - sx_) ** 2 + (GY0 + j * GS - sy_) ** 2 < 0.35 ** 2: V[j][i] = 0.0

# ---------- 4. marching squares → 環 → 簡化 ----------
def v(i, j): return V[j][i] if 0 <= i < GW and 0 <= j < GH else 1.0
TABLE = {1: [('l', 'b')], 2: [('b', 'r')], 3: [('l', 'r')], 4: [('r', 't')], 5: [('l', 't'), ('r', 'b')], 6: [('b', 't')], 7: [('l', 't')],
         8: [('t', 'l')], 9: [('t', 'b')], 10: [('t', 'r'), ('b', 'l')], 11: [('t', 'r')], 12: [('r', 'l')], 13: [('r', 'b')], 14: [('b', 'l')]}
segs = {}
for j in range(-1, GH):
    for i in range(-1, GW):
        idx = (v(i, j) > .5) * 8 + (v(i + 1, j) > .5) * 4 + (v(i + 1, j + 1) > .5) * 2 + (v(i, j + 1) > .5)
        edge = {'t': ('h', i, j), 'r': ('v', i + 1, j), 'b': ('h', i, j + 1), 'l': ('v', i, j)}
        for a, b in TABLE.get(idx, []): segs[edge[a]] = edge[b]
def pt(k):
    t, i, j = k
    return (GX0 + (i + 0.5) * GS, GY0 + j * GS) if t == 'h' else (GX0 + i * GS, GY0 + (j + 0.5) * GS)
rings = []
while segs:
    s, e = segs.popitem(); ring = [s, e]
    while e in segs and e != s: e = segs.pop(e); ring.append(e)
    rings.append([pt(k) for k in ring])
def area(r): return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2
def dp(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        dd = abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / L if L > 1e-9 else math.hypot(p[0] - a[0], p[1] - a[1])
        if dd > best: best, bi = dd, i
    if best <= tol: return [a, b]
    return dp(pts[:bi + 1], tol)[:-1] + dp(pts[bi:], tol)
TOL, MIN_AREA = 0.3, 1.2   # 簡化誤差（格）、細過呢個面積嘅島／水唔要
x1, y1 = GX0 + (GW - 1) * GS, GY0 + (GH - 1) * GS
out = [[(GX0, GY0), (x1, GY0), (x1, y1), (GX0, y1), (GX0, GY0)]]
for r in rings:
    if abs(area(r)) < MIN_AREA: continue
    far = max(range(len(r)), key=lambda i: (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2)
    s = dp(r[:far + 1], TOL)[:-1] + dp(r[far:], TOL)
    if len(s) >= 4: out.append(s)
print(f'{len(rings)} 個環 → 留 {len(out) - 1} 個（{sum(len(s) for s in out)} 點）', file=sys.stderr)
TS = 'export const MTR_MAP_WATER: readonly (readonly Pt[])[] = [\n' + ''.join(
    '  [' + ', '.join(f'[{round(p[0], 2)}, {round(p[1], 2)}]' for p in s) + '],\n' for s in out) + '];'
if '--write' in sys.argv:
    new = re.sub(r'export const MTR_MAP_WATER: readonly \(readonly Pt\[\]\)\[\] = \[\n.*?\n\];', lambda m: TS, ts, count=1, flags=re.S)
    assert new != ts or TS in ts, '搵唔到 MTR_MAP_WATER'
    open(TS_PATH, 'w').write(new)
    print('已寫入 src/mtr-map.ts', file=sys.stderr)
else:
    print(TS)
