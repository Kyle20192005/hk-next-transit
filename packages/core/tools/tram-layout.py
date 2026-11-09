"""電車示意圖排版（src/tram-map.ts）：由 src/tram-data.ts 嘅站同座標計位置，檢查晒先輸出。

用法：python3 packages/core/tools/tram-layout.py [--svg 預覽.svg] [--write]
畫法（2026-11 第一版，用戶揀咗自己畫電車路綫圖；唔好照抄電車公司官方路綫圖）：
- 打橫：左邊堅尼地城、右邊筲箕灣。雙軌：上面東行、下面西行，各自有自己嘅站（電車兩個方向嘅站唔一定對正）。
- 站嘅左右位置跟真實位置（投影落主綫嘅里數），太密就推開（成段一齊推，東西行唔會錯開）。
- 站名直排中文：東行喺上面、西行喺下面（似電車站牌）。
- 總站：膠囊橫跨雙軌，粗體站名。
- 跑馬地環綫：喺灣仔（天樂里接返軒尼詩道）同銅鑼灣（波斯富街）之間向下吊一個圈，單向（東邊落、西邊上），有箭咀。
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'src/tram-data.ts'), encoding='utf-8').read()
ST = {}
for line in src.split('TRAM_STATIONS')[1].split('TRAM_ORDER')[0].splitlines():
    line = line.strip().rstrip(',')
    if line.startswith('{'):
        s = json.loads(line)
        ST[s['id']] = s
ORDER = json.loads(re.search(r'TRAM_ORDER[^=]*= (\{.*\});', src).group(1))

# ---------------------------------------------------------------------------
# 尺寸（地圖單位）
GAP = 0.2         # 東行、西行兩條軌中心距離
LW = 0.11         # 軌闊
DOT = 0.075       # 站圓點半徑
MIN = 0.42        # 同一條軌相鄰兩個站最少距離（直排站名一個字闊）
PER_M = 0.42 / 210  # 每米幾多單位（平均站距約 210 米）
ZH = 0.26         # 站名字高
LABEL_GAP = 0.2   # 站名離軌
TERM_ZH = 0.3
COLOR = '#007a4d'  # 電車綠（自己揀，唔用官方色板）
INK = '#1d1d1f'
LOOP_W = 1.6      # 跑馬地環綫兩條直綫距離
LOOP_STEP = 0.5   # 環綫站距


def ll(s):
    return ST[s]['lat'], ST[s]['lng']


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------------------
# 主綫里數：用西行站（筲箕灣 → 堅尼地城，唔計跑馬地）做主綫，量到堅尼地城嘅距離；東行站投影落去
main_w = [s for s in ORDER['W']]
main_w.append('KTT')
poly = [ll(s) for s in main_w]
cum = [0.0]
for a, b in zip(poly, poly[1:]):
    cum.append(cum[-1] + hav(a, b))
TOTAL = cum[-1]


def project(p):
    """點投影落主綫 → 由堅尼地城起計嘅里數（米）"""
    best = None
    lat0 = math.radians(p[0])
    kx, ky = 111320 * math.cos(lat0), 110540
    for i, (a, b) in enumerate(zip(poly, poly[1:])):
        ax, ay = (a[1] - p[1]) * kx, (a[0] - p[0]) * ky
        bx, by = (b[1] - p[1]) * kx, (b[0] - p[0]) * ky
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1
        t = max(0, min(1, -(ax * dx + ay * dy) / L2))
        d = math.hypot(ax + t * dx, ay + t * dy)
        c = cum[i] + t * math.sqrt(L2)
        if best is None or d < best[0]:
            best = (d, c)
    return TOTAL - best[1]


chain = {}
for s in ORDER['W']:
    chain[s] = TOTAL - cum[main_w.index(s)]
for s in ORDER['E']:
    if s not in chain:
        chain[s] = project(ll(s))
chain['KTT'] = 0.0

# 跑馬地環綫兩個接駁點（主綫里數）：落 = 波斯富街（東行 51E 同西行 48W 之間）；上 = 天樂里（堅拿道西同杜老誌道之間）
J_DOWN = project(ll('105'))
J_UP = project(ll('112'))

# ---------------------------------------------------------------------------
# x：里數 × PER_M，同一條軌太近就成段一齊推開（後面全部跟住移，東西行唔會錯開）
TRACK = {}
for s in chain:
    d = ST[s]['dir']
    TRACK[s] = 'T' if d == 'T' else d
events = sorted(chain.items(), key=lambda kv: kv[1])
events += [('@down', J_DOWN), ('@up', J_UP)]
events.sort(key=lambda kv: kv[1])
X = {}
shift = 0.0
last = {}
for s, c in events:
    x = c * PER_M + shift
    tr = TRACK.get(s, 'J')
    need = []
    if tr in ('W', 'E', 'J'):
        if tr in last:
            need.append(last[tr] + MIN)
    if tr == 'T' or tr == 'J':
        # 總站、接駁點：兩條軌都要讓位
        for t in ('W', 'E'):
            if t in last:
                need.append(last[t] + MIN * 0.9)
    if tr in ('W', 'E') and 'T' in last:
        need.append(last['T'] + MIN * 0.9)
    if tr in ('W', 'E') and 'J' in last:
        need.append(last['J'] + MIN * 0.6)
    if need and max(need) > x:
        shift += max(need) - x
        x = max(need)
    X[s] = round(x, 3)
    if tr == 'T':
        last['T'] = x
        last['W'] = last['E'] = x
    else:
        last[tr] = x
W_ = max(X.values())

YE, YW = -GAP / 2, GAP / 2


def y_of(s):
    return {'E': YE, 'W': YW}.get(ST[s]['dir'], 0.0)


# ---------------------------------------------------------------------------
# 跑馬地環綫：落（東邊）南行站 105–108，底跑馬地總站，上（西邊）北行站 109–112
# 環綫兩條直綫要喺西行站名之間穿過：放喺接駁點兩邊最近嘅西行站正中間
def w_gap(x):
    ws = sorted(X[s] for s in X if TRACK.get(s) == 'W')
    a = max(v for v in ws if v <= x)
    b = min(v for v in ws if v > x)
    return (a + b) / 2


xd, xu = w_gap(X['@down']), w_gap(X['@up'])
if xd - xu < 0.5:
    raise SystemExit('跑馬地環綫兩條直綫太近')
LOOP_TOP = YW + 1.9   # 西行站名下面先開始放站
loop = {}
for i, s in enumerate(ORDER['S'][:-1]):
    loop[s] = (xd, LOOP_TOP + i * LOOP_STEP)
bottom = LOOP_TOP + (len(ORDER['S']) - 1) * LOOP_STEP
loop['HVT'] = ((xd + xu) / 2, bottom + 0.35)
for i, s in enumerate(ORDER['N']):
    loop[s] = (xu, bottom - i * LOOP_STEP)

# ---------------------------------------------------------------------------
# 輸出（設計方向 = 打橫；直版 = 轉 90°：堅尼地城喺頂、東行喺右邊、跑馬地環綫喺左邊）
POS = {}
for s in ST:
    if s in loop:
        POS[s] = loop[s]
    elif s in X:
        POS[s] = (X[s], y_of(s))
# 站名：(x, y) 錨點、v 直排、flow：直排 up（字向上排，最尾一個字貼錨點）／down；打橫 start／end／middle
LABELS = {}
for s, (x, y) in POS.items():
    d = ST[s]['dir']
    if s == 'HVT':
        LABELS[s] = {'x': x, 'y': y + 0.3, 'v': True, 'flow': 'down', 'bold': True}
    elif d == 'E':
        LABELS[s] = {'x': x, 'y': YE - LABEL_GAP, 'v': True, 'flow': 'up'}
    elif d == 'W':
        LABELS[s] = {'x': x, 'y': YW + LABEL_GAP, 'v': True, 'flow': 'down'}
    elif d == 'S':
        LABELS[s] = {'x': x + 0.2, 'y': y, 'v': False, 'flow': 'start'}
    elif d == 'N':
        LABELS[s] = {'x': x - 0.2, 'y': y, 'v': False, 'flow': 'end'}
    elif d == 'T':
        LABELS[s] = {'x': x, 'y': YE - 0.28, 'v': True, 'flow': 'up', 'bold': True}

R = 0.35
x0, x1 = 0.0, W_
hb = bottom + 0.35
LINES = [
    [('M', x0, YE), ('L', x1, YE)],
    [('M', x0, YW), ('L', x1, YW)],
    [('M', xd, YW), ('L', xd, hb - R), ('A', R, xd - R, hb), ('L', xu + R, hb), ('A', R, xu, hb - R), ('L', xu, YW)],
]
ARROWS = [(xd, (YW + LOOP_TOP) / 2 + 0.2, 90), ((xd + xu) / 2, hb, 180), (xu, (YW + LOOP_TOP) / 2 + 0.2, -90)]
TERMS = [s for s in ST if ST[s].get('terminus')]


def term_box(s):
    x, y = POS[s]
    if s == 'HVT':
        return (x, y, 0.62, 0.26)
    return (x, (YE + YW) / 2, 0.26, GAP + 0.32)


def size_of(L):
    return TERM_ZH if L.get('bold') else ZH


def label_box(s, L):
    """站名佔嘅長方形（x0, y0, x1, y1），用嚟檢查撞字"""
    n, sz = len(ST[s]['zh']), size_of(L)
    if L['v']:
        h = n * sz * 1.02
        y0 = L['y'] - h if L['flow'] == 'up' else L['y']
        return (L['x'] - sz / 2, y0, L['x'] + sz / 2, y0 + h)
    w = n * sz
    x0 = {'start': L['x'], 'end': L['x'] - w, 'middle': L['x'] - w / 2}[L['flow']]
    return (x0, L['y'] - sz / 2, x0 + w, L['y'] + sz / 2)


def overlap(a, b, m=0.03):
    return a[0] < b[2] - m and b[0] < a[2] - m and a[1] < b[3] - m and b[1] < a[3] - m


problems = []
for tr in ('W', 'E'):
    xs = sorted(X[s] for s in X if TRACK.get(s) == tr)
    for a, b in zip(xs, xs[1:]):
        if b - a < MIN - 1e-6:
            problems.append(f'{tr} 站太近 {a} {b}')
boxes = {s: label_box(s, L) for s, L in LABELS.items()}
ids = sorted(boxes)
for i, a in enumerate(ids):
    for b in ids[i + 1:]:
        if overlap(boxes[a], boxes[b]):
            problems.append(f'站名撞：{ST[a]["zh"]} {ST[b]["zh"]}')
# 站名唔好撞環綫
for s, bx in boxes.items():
    if ST[s]['dir'] in ('W', 'T'):
        for lx in (xd, xu):
            if bx[0] - 0.02 < lx < bx[2] + 0.02 and bx[3] > YW + 0.1:
                problems.append(f'站名撞跑馬地環綫：{ST[s]["zh"]}')
print('寬', round(W_, 2), '單位；問題', len(problems), *problems[:20], sep='\n  ')


def rot(p):
    """設計方向 → 直版"""
    return (-p[1], p[0])


FLOW_V = {'up': 'start', 'down': 'end', 'start': 'down', 'end': 'up', 'middle': 'middle'}


def build(vertical):
    tf = rot if vertical else (lambda p: p)
    r = lambda v: round(v, 3)

    def path(segs):
        out = []
        for seg in segs:
            if seg[0] == 'A':
                _, rad, x, y = seg
                X2, Y2 = tf((x, y))
                # 轉 90° 唔改圓弧方向（順時針轉，sweep 照舊）
                out.append(f'A{rad} {rad} 0 0 1 {r(X2)} {r(Y2)}')
            else:
                X2, Y2 = tf((seg[1], seg[2]))
                out.append(f'{seg[0]}{r(X2)} {r(Y2)}')
        return ''.join(out)
    labels = []
    for s, L in LABELS.items():
        X2, Y2 = tf((L['x'], L['y']))
        v, flow = L['v'], L['flow']
        if vertical:
            v, flow = not v, FLOW_V[flow]
            if s == 'HVT':
                X2, Y2 = tf(POS[s])
                X2 -= 0.45
                v, flow = False, 'end'
        item = {'id': s, 'x': r(X2), 'y': r(Y2), 'v': v, 'flow': flow}
        if L.get('bold'):
            item['bold'] = True
        labels.append(item)
    stops = []
    for s, p in POS.items():
        if ST[s].get('terminus'):
            continue
        X2, Y2 = tf(p)
        stops.append({'id': s, 'x': r(X2), 'y': r(Y2)})
    terms = []
    for s in TERMS:
        x, y, w, h = term_box(s)
        X2, Y2 = tf((x, y))
        if vertical:
            w, h = h, w
        terms.append({'id': s, 'x': r(X2), 'y': r(Y2), 'w': r(w), 'h': r(h)})
    arrows = []
    for x, y, a in ARROWS:
        X2, Y2 = tf((x, y))
        arrows.append({'x': r(X2), 'y': r(Y2), 'rot': (a + 90) % 360 if vertical else a})
    # 範圍：所有點、站名
    pts = [tf((x, y)) for x, y in POS.values()]
    for s, L in LABELS.items():
        b = label_box(s, L)
        pts += [tf((b[0], b[1])), tf((b[2], b[3]))]
    if vertical:
        hb_ = term_box('HVT')
        pts.append((tf(POS['HVT'])[0] - 0.45 - len(ST['HVT']['zh']) * TERM_ZH, tf(POS['HVT'])[1]))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    pad = 0.4
    box = [r(min(xs) - pad), r(min(ys) - pad), r(max(xs) - min(xs) + 2 * pad), r(max(ys) - min(ys) + 2 * pad)]
    return {'box': box, 'lines': [path(l) for l in LINES], 'arrows': arrows, 'stops': stops, 'terms': terms, 'labels': labels}


MAPS = {'h': build(False), 'v': build(True)}


def svg(m):
    bx = m['box']
    k = 60
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{bx[0]} {bx[1]} {bx[2]} {bx[3]}" width="{bx[2] * k:.0f}" height="{bx[3] * k:.0f}" '
           f'font-family="PingFang HK, Noto Sans TC, sans-serif">', f'<rect x="{bx[0]}" y="{bx[1]}" width="{bx[2]}" height="{bx[3]}" fill="#fff"/>']
    for d in m['lines']:
        out.append(f'<path d="{d}" fill="none" stroke="{COLOR}" stroke-width="{LW}" stroke-linecap="round"/>')
    for a in m['arrows']:
        out.append(f'<path d="M-0.05 -0.045 L0.04 0 L-0.05 0.045" transform="translate({a["x"]} {a["y"]}) rotate({a["rot"]})" fill="none" stroke="#fff" stroke-width="0.03" stroke-linejoin="round" stroke-linecap="round"/>')
    for tt in m['terms']:
        out.append(f'<rect x="{tt["x"] - tt["w"] / 2:.3f}" y="{tt["y"] - tt["h"] / 2:.3f}" width="{tt["w"]}" height="{tt["h"]}" rx="{min(tt["w"], tt["h"]) / 2:.3f}" fill="#fff" stroke="{INK}" stroke-width="0.05"/>')
    for s in m['stops']:
        out.append(f'<circle cx="{s["x"]}" cy="{s["y"]}" r="{DOT}" fill="#fff" stroke="{INK}" stroke-width="0.035"/>')
    for L in m['labels']:
        zh = ST[L['id']]['zh']
        sz = TERM_ZH if L.get('bold') else ZH
        w = ' font-weight="800"' if L.get('bold') else ''
        if L['v']:
            zh = zh.replace('（', '︵').replace('）', '︶')
            n = len(zh)
            for i, ch in enumerate(zh):
                yy = L['y'] - (n - 1 - i) * sz * 1.02 - sz * 0.12 if L['flow'] == 'up' else L['y'] + (i + 1) * sz * 1.02 - sz * 0.14
                out.append(f'<text x="{L["x"]}" y="{yy:.3f}" font-size="{sz}" text-anchor="middle"{w} fill="{INK}">{ch}</text>')
        else:
            anchor = {'start': 'start', 'end': 'end', 'middle': 'middle'}[L['flow']]
            out.append(f'<text x="{L["x"]}" y="{L["y"] + sz * 0.36:.3f}" font-size="{sz}" text-anchor="{anchor}"{w} fill="{INK}">{zh}</text>')
    out.append('</svg>')
    return '\n'.join(out)


if '--svg' in sys.argv:
    p = sys.argv[sys.argv.index('--svg') + 1]
    open(p, 'w', encoding='utf-8').write(svg(MAPS['h']))
    open(p.replace('.svg', '-v.svg'), 'w', encoding='utf-8').write(svg(MAPS['v']))
    print('預覽', p, p.replace('.svg', '-v.svg'))

if '--write' in sys.argv:
    m = MAPS['v']
    def rows(xs):
        return '[\n  ' + ',\n  '.join(json.dumps(x, ensure_ascii=False, separators=(', ', ': ')) for x in xs) + ',\n]'
    ts = f"""// 由 tools/tram-layout.py 生成（打直：堅尼地城喺頂、筲箕灣喺底；右邊東行、左邊西行；跑馬地環綫喺左邊），唔好人手改
export interface TramMapLabel {{
  /** 站 ID（core tram-data.ts） */
  id: string;
  x: number;
  y: number;
  /** 直排（一個字一行） */
  v: boolean;
  /** 直排：up 由錨點向上排（最尾一個字貼錨點）、down 由錨點向下；打橫：start 錨點喺左、end 錨點喺右、middle 置中 */
  flow: 'up' | 'down' | 'start' | 'end' | 'middle';
  /** 總站：粗體大字 */
  bold?: true;
}}

/** 地圖範圍 [x, y, 闊, 高]（地圖單位） */
export const TRAM_MAP_BOX: [number, number, number, number] = {json.dumps(m['box'])};
/** 路軌（SVG path，東行、西行、跑馬地環綫） */
export const TRAM_MAP_LINES: string[] = {json.dumps(m['lines'])};
/** 單向路軌（跑馬地環綫）白色箭咀：位置同方向（度，0 = 向右） */
export const TRAM_MAP_ARROWS: {{ x: number; y: number; rot: number }}[] = {json.dumps(m['arrows'])};
/** 一般站（圓點） */
export const TRAM_MAP_STOPS: {{ id: string; x: number; y: number }}[] = {rows(m['stops'])};
/** 總站（膠囊，x、y 係中心） */
export const TRAM_MAP_TERMS: {{ id: string; x: number; y: number; w: number; h: number }}[] = {rows(m['terms'])};
/** 站名 */
export const TRAM_MAP_LABELS: TramMapLabel[] = {rows(m['labels'])};
/** 尺寸同顏色：路軌闊、站圓點半徑、站名字高、總站字高、行距（直排每個字）、路軌色 */
export const TRAM_MAP_SIZE = {{ lw: {LW}, dot: {DOT}, zh: {ZH}, termZh: {TERM_ZH}, lineH: 1.02, color: '{COLOR}', ink: '{INK}' }};
"""
    path = os.path.join(ROOT, 'src', 'tram-map.ts')
    open(path, 'w', encoding='utf-8').write(ts)
    print('寫咗', path)
