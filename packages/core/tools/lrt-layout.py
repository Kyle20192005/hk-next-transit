"""輕鐵示意圖排版（src/lrt-map.ts）：喺度定義每個站位置同路軌彎位，檢查晒先寫入。

用法：
  python3 packages/core/tools/lrt-layout.py [--write] [--svg 預覽.svg]
畫法：每段路軌（兩個站之間）上面，行經嘅路線各一條色綫並排（路線固定次序，貼住），
站係橫跨所有色綫嘅白色膠囊（黑邊）；幾個方向交匯嘅站用圓形。彎位係圓弧（並排綫同心）。
站位置參考真實地理（tools/lrt-coords.py），自己排：唔好照抄港鐵官方輕鐵路綫圖（版權）。
檢查：路軌只行橫直 45°；站唔可以喺彎位；站名唔撞綫、唔撞站、站名之間有位。
"""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'src/lrt-data.ts')).read()
STOPS = {k: (z, e) for k, z, e in re.findall(r'"(\d+)": \["([^"]+)", "([^"]+)", "[^"]*"\]', src)}
ROUTE_STOPS = {r: json.loads(o) for r, o in re.findall(r'"(\d+P?)": (\{[^}]*\})', src.split('LRT_ROUTE_STOPS')[1])}

# ---------------------------------------------------------------------------
# 尺寸
G = 0.13          # 每條路線色綫闊（並排貼住）
R = 0.55          # 彎位半徑（中綫）
PAD = 0.07        # 站膠囊超出色綫
THICK = 0.26      # 膠囊厚度（沿路軌方向）
ZH, EN = 0.3, 0.17
# 路線次序（並排時由左至右，左 = 行進方向左邊；路軌方向統一向右／向上）
ORDER = ['761P', '751', '705', '706', '610', '614', '614P', '615', '615P', '505', '507']

# ---------------------------------------------------------------------------
# 站位置（x 向右、y 向下）
P = {}
def put(name_or_id, x, y):
    sid = name_or_id if name_or_id in STOPS else next(k for k, v in STOPS.items() if v[0] == name_or_id)
    P[sid] = (x, y)

# 天水圍（環綫）
for i, n in enumerate(['天逸', '天富']):
    put(n, 18, 1.5 + i * 1.25)
put('頌富', 18, 4)
for i, n in enumerate(['天瑞', '樂湖']):
    put(n, 18, 5.33 + i * 1.33)
put('天耀', 18, 8)
for i, n in enumerate(['濕地公園', '天秀', '天悅', '天榮', '銀座', '天湖', '天慈', '天水圍']):
    put(n, 22, 1 + i)
put('天恒', 20, 0)
put('翠湖', 20, 4)
put('坑尾村', 20, 10)
put('洪水橋', 20, 12)
put('塘坊村', 22, 12)
for i, n in enumerate(['屏山', '水邊圍', '豐年路', '康樂路', '大棠路', '元朗']):
    put(n, 23.9 + i * 1.9, 12)
# 幹綫（洪水橋 → 兆康，向西南）
for i, n in enumerate(['鍾屋村', '泥圍', '藍地']):
    put(n, 19 - i, 13 + i)
put('兆康', 16, 16)
# 屯門北：兆康向西一行
for i, n in enumerate(['麒麟', '青松', '建生', '田景']):
    put(n, 14 - i * 2, 16)
put('良景', 6, 17.2)
put('新圍', 6, 18.4)
put('大興(北)', 8, 18.4)
put('大興(南)', 10, 18.4)
put('銀圍', 11.8, 18.4)
put('澤豐', 13.6, 18.4)
put('屯門醫院', 14.8, 17.2)
put('蔡意橋', 11.8, 20.2)
put('河田', 11.8, 22)
put('屯門', 11.8, 23.8)
# 西面：石排 → 屯門碼頭
put('石排', 6, 20.4)
for i, n in enumerate(['鳴琴', '青雲', '青山村', '龍門', '輕鐵車廠', '蝴蝶', '美樂']):
    put(n, 6, 21.8 + i * 1.4)
put('山景(北)', 8, 21.4)
put('山景(南)', 8, 22.6)
put('建安', 8, 23.8)
# 東面：兆康 → 市中心（614）
for i, n in enumerate(['鳳地', '景峰', '新墟', '何福堂']):
    put(n, 16, 17.6 + i * 1.6)
put('杯渡', 13.3, 25.6)
put('市中心', 11.8, 25.6)
put('友愛', 10.4, 27)
put('安定', 11.8, 27)
put('兆麟', 11.8, 28.4)
put('三聖', 13.6, 28.4)
for i, n in enumerate(['豐景園', '海皇路', '兆禧']):
    put(n, 10.6 - i * 1.2, 29.6 + i * 1.2)
put('屯門碼頭', 7, 33.2)

# 路軌彎位：(甲, 乙) → 中間轉角點（由甲行去乙）
BENDS = {
    ('天恒', '天逸'): [(18, 0)],
    ('天恒', '濕地公園'): [(22, 0)],
    ('良景', '田景'): [(6, 16)],
    ('石排', '山景(北)'): [(7, 20.4)],
    ('何福堂', '杯渡'): [(16, 24), (14.4, 25.6)],
    ('美樂', '屯門碼頭'): [(6, 32.2)],
    ('天耀', '天水圍'): [],
}
# 唔停站經過（例如 615 青松 → 兆康 經麒麟唔停）
VIA = {('青松', '兆康'): ['麒麟']}
# 站名位置：n 上、s 下、e 右、w 左（同 ne、nw、se、sw）
LABELS = {}
for n in ['天逸', '天富', '頌富', '天瑞', '樂湖', '天耀']: LABELS[n] = 'w'
for n in ['濕地公園', '天秀', '天悅', '天榮', '銀座', '天湖', '天慈', '天水圍']: LABELS[n] = 'e'
LABELS.update({'天恒': 'n', '翠湖': 's', '坑尾村': 'e', '洪水橋': 'w', '塘坊村': 's'})
for i, n in enumerate(['屏山', '水邊圍', '豐年路', '康樂路', '大棠路', '元朗']): LABELS[n] = 's' if i % 2 == 0 else 'n'
for n in ['鍾屋村', '泥圍', '藍地']: LABELS[n] = 'e'
LABELS.update({'兆康': 'ne', '麒麟': 'n', '青松': 'n', '建生': 'n', '田景': 'n', '良景': 'w', '新圍': 'w', '大興(北)': 's', '大興(南)': 's',
               '銀圍': 'n', '澤豐': 's', '屯門醫院': 'e', '蔡意橋': 'w', '河田': 'w', '屯門': 'e', '石排': 'w', '山景(北)': 'e', '山景(南)': 'e',
               '建安': 's', '市中心': 'e', '友愛': 'w', '安定': 'w', '兆麟': 'w', '三聖': 'e', '屯門碼頭': 's'})
for n in ['鳴琴', '青雲', '青山村', '龍門', '輕鐵車廠', '蝴蝶', '美樂']: LABELS[n] = 'w'
for n in ['鳳地', '景峰', '新墟', '何福堂']: LABELS[n] = 'e'
LABELS['杯渡'] = 's'
for n in ['豐景園', '海皇路', '兆禧']: LABELS[n] = 'nw'
# 斜綫上嘅站：站名放喺斜綫冇綫嗰邊（避開斜綫）
for n in ['鍾屋村', '泥圍', '藍地']: LABELS[n] = 'se'
LABELS.update({'坑尾村': 'sw', '洪水橋': 'nw', '兆康': 'nw', '大興(北)': 'n', '澤豐': 'se', '屯門醫院': 'nw', '市中心': 'nw', '安定': 'e', '兆麟': 'nw'})

# 圖例（右下角空位）：每條路線顏色同起訖站
LEGEND = (18.5, 19, 11.6, 5.6)
LEGEND_ROWS = [('505', '三聖 ↔ 兆康'), ('507', '屯門碼頭 ↔ 田景'), ('610', '屯門碼頭 ↔ 元朗'), ('614', '屯門碼頭 ↔ 元朗'), ('614P', '屯門碼頭 ↔ 兆康'),
               ('615', '屯門碼頭 ↔ 元朗'), ('615P', '屯門碼頭 ↔ 兆康'), ('705', '天水圍循環綫'), ('706', '天水圍循環綫'), ('751', '友愛 ↔ 天逸'), ('761P', '天逸 ↔ 元朗')]

# ---------------------------------------------------------------------------
NAME = {v[0]: k for k, v in STOPS.items()}
def sid(n): return n if n in STOPS else NAME[n]
missing = [STOPS[s][0] for s in STOPS if s not in P]
if missing: sys.exit(f'未排嘅站：{missing}')

bends = {}
for (a, b), pts in BENDS.items():
    bends[(sid(a), sid(b))] = pts
    bends[(sid(b), sid(a))] = list(reversed(pts))
via = {}
for (a, b), vs in VIA.items():
    via[(sid(a), sid(b))] = [sid(v) for v in vs]
    via[(sid(b), sid(a))] = [sid(v) for v in reversed(vs)]

# 每段路軌（無向）行經嘅路線、每條路線停邊啲站
edges = {}
stopping = {}
for r, dirs in ROUTE_STOPS.items():
    for seq in dirs.values():
        for s in seq: stopping.setdefault(s, set()).add(r)
        for a, b in zip(seq, seq[1:]):
            chain = [a, *via.get((a, b), []), b]
            for u, v in zip(chain, chain[1:]):
                edges.setdefault(frozenset((u, v)), set()).add(r)

def geom(u, v):
    return [P[u], *bends.get((u, v), []), P[v]]

errors = []
def octi(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    return abs(dx) < 1e-6 or abs(dy) < 1e-6 or abs(abs(dx) - abs(dy)) < 1e-6
for e in edges:
    u, v = sorted(e)
    g = geom(u, v)
    for p, q in zip(g, g[1:]):
        if not octi(p, q): errors.append(f'{STOPS[u][0]}–{STOPS[v][0]} 唔係橫直 45°：{p} → {q}')

# 方向統一：向右（dx>0），直嘅向上
def oriented(u, v):
    g = geom(u, v)
    dx, dy = g[-1][0] - g[0][0], g[-1][1] - g[0][1]
    d0x, d0y = g[1][0] - g[0][0], g[1][1] - g[0][1]
    # 用頭尾方向決定；頭尾一樣就用第一段
    key = (dx, -dy) if abs(dx) > 1e-6 or abs(dy) > 1e-6 else (d0x, -d0y)
    return (u, v) if key > (0, 0) else (v, u)

def offset_poly(g, d):
    """折綫向左邊（行進方向）平移 d，轉角用斜接；回傳點同每個轉角嘅半徑（同心）"""
    segs = []
    for p, q in zip(g, g[1:]):
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        nx, ny = uy, -ux  # 左邊（y 向下）
        segs.append(((p[0] + nx * d, p[1] + ny * d), (q[0] + nx * d, q[1] + ny * d), (ux, uy)))
    pts = [segs[0][0]]
    for (a1, b1, u1), (a2, b2, u2) in zip(segs, segs[1:]):
        cross = u1[0] * u2[1] - u1[1] * u2[0]
        # 兩條平移綫交點
        den = u1[0] * u2[1] - u1[1] * u2[0]
        t = ((a2[0] - a1[0]) * u2[1] - (a2[1] - a1[1]) * u2[0]) / den
        x, y = a1[0] + u1[0] * t, a1[1] + u1[1] * t
        r = R + d * (1 if cross > 0 else -1)
        pts.append((x, y, max(0.05, r)))
    pts.append(segs[-1][1])
    return pts

lanes = []
lane_count = {}
for e, rs in edges.items():
    u, v = oriented(*sorted(e))
    g = geom(u, v)
    rs = sorted(rs, key=ORDER.index)
    n = len(rs)
    lane_count[e] = n
    for i, r in enumerate(rs):
        d = ((n - 1) / 2 - i) * G  # i = 0 喺最左
        lanes.append((r, offset_poly(g, d), (u, v)))

# 站：膠囊（直綫經過）或者圓（交匯）
def dirs_at(s):
    out = []
    for e in edges:
        if s not in e: continue
        t = next(x for x in e if x != s)
        g = geom(s, t)
        L = math.hypot(g[1][0] - g[0][0], g[1][1] - g[0][1])
        out.append(((g[1][0] - g[0][0]) / L, (g[1][1] - g[0][1]) / L, lane_count[e]))
    return out

markers = {}
for s in P:
    ds = dirs_at(s)
    n = max(d[2] for d in ds)
    u0 = ds[0]
    collinear = all(abs(u0[0] * d[1] - u0[1] * d[0]) < 1e-6 for d in ds)
    if collinear:
        w = n * G + 2 * PAD
        ang = math.degrees(math.atan2(u0[1], u0[0]))
        markers[s] = {'kind': 'pill', 'w': round(w, 4), 'h': THICK, 'angle': round(ang % 180, 2)}
    else:
        markers[s] = {'kind': 'circle', 'r': round(n * G / 2 + PAD, 4)}

# 站唔可以喺彎位：同轉角距離要夠
for (u, v), pts in bends.items():
    for c in pts:
        for s in (u, v):
            if math.hypot(P[s][0] - c[0], P[s][1] - c[1]) < R + 0.35:
                errors.append(f'{STOPS[s][0]} 太近彎位 {c}')

def marker_box(s):
    x, y = P[s]
    m = markers[s]
    if m['kind'] == 'circle':
        r = m['r']
        return (x - r, y - r, 2 * r, 2 * r)
    a = math.radians(m['angle'])
    # 膠囊：沿路軌方向 h，垂直方向 w
    hx, hy = abs(math.cos(a)) * m['h'] / 2 + abs(math.sin(a)) * m['w'] / 2, abs(math.sin(a)) * m['h'] / 2 + abs(math.cos(a)) * m['w'] / 2
    return (x - hx, y - hy, 2 * hx, 2 * hy)

def text_w(s, size, en=False):
    if en: return len(s) * size * 0.52
    return sum(size * (0.45 if c in '()（）' else 1.0) for c in s)

labels = {}
for s in P:
    zh, en = STOPS[s]
    side = LABELS.get(zh, 's')
    bx, by, bw, bh = marker_box(s)
    gap = 0.12
    cx, cy = bx + bw / 2, by + bh / 2
    wz, we = text_w(zh, ZH), text_w(en, EN, True)
    w = max(wz, we)
    h = ZH + EN + 0.04
    if side == 'n': x, y, anchor, top = cx, by - gap - h, 'middle', True
    elif side == 's': x, y, anchor, top = cx, by + bh + gap, 'middle', True
    elif side == 'e': x, y, anchor, top = bx + bw + gap, cy - h / 2, 'start', True
    elif side == 'w': x, y, anchor, top = bx - gap, cy - h / 2, 'end', True
    elif side == 'ne': x, y, anchor, top = bx + bw + gap * 0.5, by - h + 0.05, 'start', True
    elif side == 'nw': x, y, anchor, top = bx - gap * 0.5, by - h + 0.05, 'end', True
    elif side == 'se': x, y, anchor, top = bx + bw + gap * 0.5, by + bh - 0.05, 'start', True
    else: x, y, anchor, top = bx - gap * 0.5, by + bh - 0.05, 'end', True
    left = x - (w / 2 if anchor == 'middle' else w if anchor == 'end' else 0)
    labels[s] = {'x': round(x, 4), 'zhY': round(y + ZH * 0.86, 4), 'enY': round(y + ZH + 0.02 + EN * 0.86, 4), 'anchor': anchor, 'box': (left, y, w, h)}

# 檢查：站名唔撞綫、唔撞站、唔撞其他站名
def seg_box_hit(p, q, box, half):
    x, y, w, h = box
    # 取樣
    L = math.hypot(q[0] - p[0], q[1] - p[1])
    n = max(2, int(L / 0.05))
    for i in range(n + 1):
        t = i / n
        px, py = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
        if x - half < px < x + w + half and y - half < py < y + h + half: return True
    return False
for s, lb in labels.items():
    for r, pts, _ in lanes:
        if any(seg_box_hit(p, q, lb['box'], G / 2) for p, q in zip(pts, pts[1:])):
            errors.append(f'站名「{STOPS[s][0]}」撞到 {r} 綫'); break
    for t in P:
        if t == s: continue
        bx, by, bw, bh = marker_box(t)
        x, y, w, h = lb['box']
        if x < bx + bw and bx < x + w and y < by + bh and by < y + h: errors.append(f'站名「{STOPS[s][0]}」撞到站 {STOPS[t][0]}')
    for t, lt in labels.items():
        if t <= s: continue
        a, b = lb['box'], lt['box']
        if a[0] < b[0] + b[2] + 0.12 and b[0] < a[0] + a[2] + 0.12 and a[1] < b[1] + b[3] + 0.06 and b[1] < a[1] + a[3] + 0.06:
            errors.append(f'站名「{STOPS[s][0]}」同「{STOPS[t][0]}」太近')

xs = [p[0] for p in P.values()] + [l['box'][0] for l in labels.values()] + [l['box'][0] + l['box'][2] for l in labels.values()]
ys = [p[1] for p in P.values()] + [l['box'][1] for l in labels.values()] + [l['box'][1] + l['box'][3] for l in labels.values()]
VIEW = (min(xs) - 1, min(ys) - 1, max(xs) - min(xs) + 2, max(ys) - min(ys) + 2)

print(f'{len(P)} 個站、{len(edges)} 段路軌、{len(lanes)} 條色綫；範圍 {VIEW}', file=sys.stderr)
for e in errors: print('✗', e, file=sys.stderr)

# ---------------------------------------------------------------------------
COLORS = dict(re.findall(r"route: '(\w+)', color: '(#\w+)'", open(os.path.join(ROOT, 'src/lrt.ts')).read()))

def path_d(pts):
    # 同 mtrLinePathD 一樣：轉角圓弧
    def f(n): return f'{n:.4f}'.rstrip('0').rstrip('.')
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    used = 0
    for i in range(1, len(pts) - 1):
        a, p, b = pts[i - 1], pts[i], pts[i + 1]
        la, lb = math.hypot(a[0] - p[0], a[1] - p[1]), math.hypot(b[0] - p[0], b[1] - p[1])
        ua, ub = ((a[0] - p[0]) / la, (a[1] - p[1]) / la), ((b[0] - p[0]) / lb, (b[1] - p[1]) / lb)
        th = math.acos(max(-1, min(1, -(ua[0] * ub[0] + ua[1] * ub[1]))))
        r = p[2] if len(p) > 2 else R
        t = r * math.tan(th / 2)
        tmax = min(la - used, lb / 2)
        if t > tmax: t = max(0, tmax); r = t / math.tan(th / 2) if th > 1e-6 else r
        used = t
        p1, p2 = (p[0] + ua[0] * t, p[1] + ua[1] * t), (p[0] + ub[0] * t, p[1] + ub[1] * t)
        cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
        d += f' L{f(p1[0])} {f(p1[1])} A{f(r)} {f(r)} 0 0 {1 if cross > 0 else 0} {f(p2[0])} {f(p2[1])}'
    return d + f' L{f(pts[-1][0])} {f(pts[-1][1])}'

if '--svg' in sys.argv:
    out_path = sys.argv[sys.argv.index('--svg') + 1]
    vx, vy, vw, vh = VIEW
    sc = 60
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw * sc:.0f}" height="{vh * sc:.0f}" viewBox="{vx} {vy} {vw} {vh}" font-family="PingFang HK, Noto Sans CJK TC, sans-serif">',
         f'<rect x="{vx}" y="{vy}" width="{vw}" height="{vh}" fill="#fff"/>']
    for r, pts, _ in lanes:
        o.append(f'<path d="{path_d(pts)}" fill="none" stroke="{COLORS.get(r, "#888")}" stroke-width="{G}" stroke-linecap="butt" stroke-linejoin="round"/>')
    for s, m in markers.items():
        x, y = P[s]
        if m['kind'] == 'circle':
            o.append(f'<circle cx="{x}" cy="{y}" r="{m["r"]}" fill="#fff" stroke="#23262b" stroke-width="0.045"/>')
        else:
            o.append(f'<rect x="{x - m["h"] / 2}" y="{y - m["w"] / 2}" width="{m["h"]}" height="{m["w"]}" rx="{m["h"] / 2}" fill="#fff" stroke="#23262b" stroke-width="0.045" transform="rotate({m["angle"]} {x} {y})"/>')
    # 圖例：右下角空位
    lx, ly = LEGEND[0], LEGEND[1]
    o.append(f'<rect x="{lx}" y="{ly}" width="{LEGEND[2]}" height="{LEGEND[3]}" rx="0.3" fill="#fff" stroke="#e5e7eb" stroke-width="0.04"/>')
    o.append(f'<text x="{lx + 0.4}" y="{ly + 0.75}" font-size="0.36" font-weight="700" fill="#111">輕鐵路綫圖<tspan font-size="0.2" fill="#666" dx="0.15">Light Rail</tspan></text>')
    for i, (r, zh) in enumerate(LEGEND_ROWS):
        x = lx + 0.4 + (i % 2) * 5.6
        y = ly + 1.5 + (i // 2) * 0.7
        o.append(f'<rect x="{x}" y="{y - 0.25}" width="1.1" height="0.42" rx="0.21" fill="{COLORS.get(r)}"/>')
        o.append(f'<text x="{x + 0.55}" y="{y + 0.05}" text-anchor="middle" font-size="0.26" font-weight="800" fill="#fff">{r}</text>')
        o.append(f'<text x="{x + 1.3}" y="{y + 0.07}" font-size="0.26" font-weight="600" fill="#111">{zh}</text>')
    for s, lb in labels.items():
        zh, en = STOPS[s]
        o.append(f'<text x="{lb["x"]}" y="{lb["zhY"]}" text-anchor="{lb["anchor"]}" font-size="{ZH}" font-weight="700" fill="#111">{zh}</text>')
        o.append(f'<text x="{lb["x"]}" y="{lb["enY"]}" text-anchor="{lb["anchor"]}" font-size="{EN}" fill="#666">{en}</text>')
    o.append('</svg>')
    open(out_path, 'w').write('\n'.join(o))
    print(f'預覽：{out_path}', file=sys.stderr)
