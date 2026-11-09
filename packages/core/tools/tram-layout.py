"""電車示意圖排版（src/tram-map.ts）：由 src/tram-data.ts 嘅站同座標計位置，檢查晒先輸出。

用法：python3 packages/core/tools/tram-layout.py [--svg 預覽.svg] [--write]
（喺「設計方向」打橫排，輸出轉 90° 打直；預覽同 tram-map.ts 都係直版）
畫法（2026-11 第一版，用戶揀咗自己畫電車路綫圖；唔好照抄電車公司官方路綫圖）：
- 打橫：左邊堅尼地城、右邊筲箕灣。雙軌：上面東行、下面西行，各自有自己嘅站（電車兩個方向嘅站唔一定對正）。
- 站嘅左右位置跟真實位置（投影落主綫嘅里數），太密就推開（成段一齊推，東西行唔會錯開）。
- 站名直排中文：東行喺上面、西行喺下面（似電車站牌）。
- 總站：膠囊橫跨雙軌，粗體站名。
- 跑馬地環綫：喺灣仔（天樂里接返軒尼詩道）同銅鑼灣（波斯富街）之間向下吊一個圈，單向（東邊落、西邊上），有箭咀。
- 總站分支（BRANCH）：銅鑼灣、北角（連春秧街）、石塘咀由主綫分出去（直版向右），伸過附近東行站名先放站同總站膠囊；
  上環（西港城）西行直通車有停，留喺主綫。
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
# 總站分支（2026-11 用戶：銅鑼灣、北角（連春秧街）、石塘咀係由主綫分出去嘅掉頭位，唔係主綫上面嘅站）：
# 東行車喺度入去、掉頭再出返西行；只有去呢個總站嘅車先經支綫上面嘅站（春秧街）。上環（西港城）西行直通車有停，留喺主綫。
BRANCH = {'CBT': [], 'NPT': ['67E'], 'WST': []}
# 北角：入同出唔喺同一度——東行喺炮台山之後入（經春秧街，唔經主綫北角道），掉頭後喺北角道同書局街之間返西行。
# 所以畫做單向細環：入口喺呢兩個東行站中間
BRANCH_LOOP = {'NPT': ('65E', '69E')}
STUB = {s: t for t, ss in BRANCH.items() for s in ss}
BR_GAP = 0.5      # 支綫第一樣嘢離附近東行站名幾遠
BR_STEP = 0.7     # 支綫上面站同站（總站）距離
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
    if s not in chain and s not in STUB:
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
                need.append(last[t] + MIN)
    if tr in ('W', 'E') and 'T' in last:
        need.append(last['T'] + MIN)
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
# 輸出（設計方向 = 打橫，最後轉 90° 做直版：堅尼地城喺頂、東行喺右邊、跑馬地環綫喺左邊）
POS = {}
for s in ST:
    if s in loop:
        POS[s] = loop[s]
    elif s in X:
        POS[s] = (X[s], y_of(s))
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

# 總站分支：直版向右（東行嗰邊）伸出去，伸過附近東行站名先放站同總站；設計方向即係向上（-y）
E_LABEL_X = -(YE - LABEL_GAP)       # 直版東行站名由呢度開始（打橫寫）
VLABEL = {}                         # 直版站名（覆蓋上面嘅）：x, y, flow, bold
BR_END = {}
LOOP_BR = {}                        # 單向環：y_in, y_out, 站 x, 右邊直綫 x（直版座標）
for T, stubs in BRANCH.items():
    xT = X[T]
    ext = max([E_LABEL_X + len(ST[s]['zh']) * ZH for s in X if TRACK.get(s) == 'E' and abs(X[s] - xT) < 0.8] or [E_LABEL_X])
    xv = ext + BR_GAP
    for s in stubs:
        POS[s] = (xT, -xv)
        LABELS[s] = {'x': 0, 'y': 0, 'v': False, 'flow': 'middle'}   # 位置用 VLABEL
        VLABEL[s] = (xv, xT - 0.3, 'middle', False)
        xv += BR_STEP
    if T in BRANCH_LOOP:
        # 環：入口（y_in）喺兩個東行站中間，春秧街喺入口橫綫上，右邊直綫係總站（膠囊打直），出口（y_out = 總站位置）返西行
        a, b = BRANCH_LOOP[T]
        y_in, y_out = (X[a] + X[b]) / 2, xT
        xs_ = ext + BR_GAP
        for s in stubs:
            POS[s] = (y_in, -xs_)
            VLABEL[s] = (xs_, y_in - 0.3, 'middle', False)
        xc = xs_ + 0.6
        POS[T] = ((y_in + y_out) / 2, -xc)
        VLABEL[T] = (xc + 0.25, (y_in + y_out) / 2, 'start', True)
        LOOP_BR[T] = (y_in, y_out, xs_, xc)
        continue
    xv += 0.31   # 總站膠囊中心（膠囊闊 0.62）
    POS[T] = (xT, -xv)
    VLABEL[T] = (xv + 0.31 + 0.12, xT, 'start', True)
    BR_END[T] = xv

R = 0.35
x0, x1 = 0.0, W_
hb = bottom + 0.35
LINES = [
    [('M', x0, YE), ('L', x1, YE)],
    [('M', x0, YW), ('L', x1, YW)],
    [('M', xd, YW), ('L', xd, hb - R), ('A', R, xd - R, hb), ('L', xu + R, hb), ('A', R, xu, hb - R), ('L', xu, YW)],
]
# 支綫：由西行軌（橫過東行軌）伸去總站
for T, xe in BR_END.items():
    LINES.append([('M', X[T], YW), ('L', X[T], -xe)])
ARROWS = [(xd, (YW + LOOP_TOP) / 2 + 0.2, 90), ((xd + xu) / 2, hb, 180), (xu, (YW + LOOP_TOP) / 2 + 0.2, -90)]
TERMS = [s for s in ST if ST[s].get('terminus')]


def term_box(s):
    """總站膠囊（設計方向；直版會對調闊高）"""
    x, y = POS[s]
    if s == 'HVT':
        return (x, y, 0.62, 0.26)
    if s in LOOP_BR:
        y_in, y_out, _, _ = LOOP_BR[s]
        return (x, y, max(0.5, y_out - y_in + 0.1), 0.26)
    if s in BRANCH:
        return (x, y, 0.26, 0.62)
    return (x, (YE + YW) / 2, 0.26, GAP + 0.32)


def size_of(L):
    return TERM_ZH if L.get('bold') else ZH


def rot(p):
    """設計方向 → 直版"""
    return (-p[1], p[0])


FLOW_V = {'up': 'start', 'down': 'end', 'start': 'down', 'end': 'up', 'middle': 'middle'}
r3 = lambda v: round(v, 3)


def label_box_v(L):
    """直版站名佔嘅長方形（x0, y0, x1, y1）"""
    n, sz = len(ST[L['id']]['zh']), size_of(L)
    if L['v']:
        h = n * sz * 1.02
        y0 = L['y'] - h if L['flow'] == 'up' else L['y']
        return (L['x'] - sz / 2, y0, L['x'] + sz / 2, y0 + h)
    w = n * sz
    x0 = {'start': L['x'], 'end': L['x'] - w, 'middle': L['x'] - w / 2}[L['flow']]
    return (x0, L['y'] - sz / 2, x0 + w, L['y'] + sz / 2)


def build():
    def path(segs):
        out = []
        for seg in segs:
            if seg[0] == 'A':
                _, rad, x, y = seg
                X2, Y2 = rot((x, y))
                out.append(f'A{rad} {rad} 0 0 1 {r3(X2)} {r3(Y2)}')
            else:
                X2, Y2 = rot((seg[1], seg[2]))
                out.append(f'{seg[0]}{r3(X2)} {r3(Y2)}')
        return ''.join(out)
    labels = []
    for s, L in LABELS.items():
        if s in VLABEL:
            x2, y2, flow, bold = VLABEL[s]
            item = {'id': s, 'x': r3(x2), 'y': r3(y2), 'v': False, 'flow': flow}
            if bold:
                item['bold'] = True
            labels.append(item)
            continue
        X2, Y2 = rot((L['x'], L['y']))
        v, flow = not L['v'], FLOW_V[L['flow']]
        if s == 'HVT':
            X2, Y2 = rot(POS[s])
            X2 -= 0.45
            v, flow = False, 'end'
        item = {'id': s, 'x': r3(X2), 'y': r3(Y2), 'v': v, 'flow': flow}
        if L.get('bold'):
            item['bold'] = True
        labels.append(item)
    stops = [{'id': s, 'x': r3(rot(p)[0]), 'y': r3(rot(p)[1])} for s, p in POS.items() if not ST[s].get('terminus')]
    terms = []
    for s in TERMS:
        x, y, w, h = term_box(s)
        X2, Y2 = rot((x, y))
        terms.append({'id': s, 'x': r3(X2), 'y': r3(Y2), 'w': r3(h), 'h': r3(w)})
    arrows = [{'x': r3(rot((x, y))[0]), 'y': r3(rot((x, y))[1]), 'rot': (a + 90) % 360} for x, y, a in ARROWS]
    pts = [rot(p) for p in POS.values()]
    for L in labels:
        b = label_box_v(L)
        pts += [(b[0], b[1]), (b[2], b[3])]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    pad = 0.4
    box = [r3(min(xs) - pad), r3(min(ys) - pad), r3(max(xs) - min(xs) + 2 * pad), r3(max(ys) - min(ys) + 2 * pad)]
    # 直版嘅橫綫（環綫兩條、支綫），檢查站名撞綫用：(y, x0, x1)
    hsegs = []
    for segs in LINES[2:]:
        pts2 = [rot((sg[-2], sg[-1])) for sg in segs]
        for a, b in zip(pts2, pts2[1:]):
            if abs(a[1] - b[1]) < 1e-6:
                hsegs.append((a[1], min(a[0], b[0]), max(a[0], b[0])))
    lines = [path(l) for l in LINES]
    RR = 0.2
    for T, (y_in, y_out, xs_, xc) in LOOP_BR.items():
        # 入：東行軌 → 右 → 落 → 出：返左橫過東行軌去西行軌（直版座標）
        lines.append(f'M{r3(GAP / 2)} {r3(y_in)}L{r3(xc - RR)} {r3(y_in)}A{RR} {RR} 0 0 1 {r3(xc)} {r3(y_in + RR)}'
                     f'L{r3(xc)} {r3(y_out - RR)}A{RR} {RR} 0 0 1 {r3(xc - RR)} {r3(y_out)}L{r3(-GAP / 2)} {r3(y_out)}')
        arrows.append({'x': r3((xs_ + xc - RR) / 2 + 0.05), 'y': r3(y_in), 'rot': 0})
        arrows.append({'x': r3(xs_), 'y': r3(y_out), 'rot': 180})
        hsegs.append((y_in, GAP / 2, xc))
        hsegs.append((y_out, -GAP / 2, xc))
    return {'box': box, 'lines': lines, 'arrows': arrows, 'stops': stops, 'terms': terms, 'labels': labels}, hsegs


V_MAP, HSEGS = build()


def overlap(a, b, m=0.03):
    return a[0] < b[2] - m and b[0] < a[2] - m and a[1] < b[3] - m and b[1] < a[3] - m


problems = []
for tr in ('W', 'E'):
    xs = sorted(X[s] for s in X if TRACK.get(s) == tr)
    for a, b in zip(xs, xs[1:]):
        if b - a < MIN - 1e-6:
            problems.append(f'{tr} 站太近 {a} {b}')
boxes = [(L['id'], label_box_v(L)) for L in V_MAP['labels']]
for i, (a, ba) in enumerate(boxes):
    for b, bb in boxes[i + 1:]:
        if overlap(ba, bb):
            problems.append(f'站名撞：{ST[a]["zh"]} {ST[b]["zh"]}')
    for (y, sx0, sx1) in HSEGS:
        if ba[1] - LW / 2 < y < ba[3] + LW / 2 and ba[0] < sx1 and sx0 < ba[2]:
            problems.append(f'站名撞綫：{ST[a]["zh"]}')
# 總站膠囊、站點唔好撞站名
for tt in V_MAP['terms']:
    tb = (tt['x'] - tt['w'] / 2, tt['y'] - tt['h'] / 2, tt['x'] + tt['w'] / 2, tt['y'] + tt['h'] / 2)
    for a, ba in boxes:
        if a != tt['id'] and overlap(tb, ba):
            problems.append(f'總站撞站名：{ST[tt["id"]]["zh"]} {ST[a]["zh"]}')
print('高', round(W_, 2), '單位；問題', len(problems), *problems[:20], sep='\n  ')


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
    open(p, 'w', encoding='utf-8').write(svg(V_MAP))
    print('預覽', p)

if '--write' in sys.argv:
    m = V_MAP
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
/** 路軌（SVG path，東行、西行、跑馬地環綫、總站分支） */
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
