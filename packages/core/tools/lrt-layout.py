"""輕鐵示意圖排版：喺度定義每個站位置、軸同路軌彎位，檢查晒先輸出。

用法：
  python3 packages/core/tools/lrt-layout.py [--svg 預覽.svg]
畫法（2026-11，用戶要求）：
- 每段路軌（兩個站之間）上面，行經嘅路線各一條色綫並排，每條色綫都有黑色綑邊（綫同綫之間都有黑綫）。
- 每個站有一條「軸」（橫、直或者 45°）：路軌一律沿軸出入站，出站直行一段先轉彎。
  同一邊出站嘅幾段路軌先並排（「出站位」，轉得急嘅喺內圈），轉彎時同心，之後先各自分開。
- 有兩條或以上色綫經過嘅站係膠囊（白底黑邊，橫跨所有色綫）；只有一條嘅係圓點。
- 終點站：盡頭站（元朗、三聖、屯門碼頭）色綫穿過個站再散開，尾端係寫住路線號碼嘅膠囊；
  中途終點站（兆康、田景、天逸、天水圍、友愛）喺站旁邊放號碼膠囊。
- 單方向行駛嘅色綫（天水圍循環綫、505 經山景／鳴琴、751 經友愛）加白色箭咀。
站位置參考真實地理（tools/lrt-coords.py），自己排：唔好照抄港鐵官方輕鐵路綫圖（版權）。
檢查：路軌只行橫直 45°；出入站嗰段沿站嘅軸、夠長；站名唔撞綫、唔撞站、唔撞號碼膠囊、站名之間有位。
"""
import heapq, itertools, json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'src/lrt-data.ts')).read()
STOPS = {k: (z, e) for k, z, e in re.findall(r'"(\d+)": \["([^"]+)", "([^"]+)", "[^"]*"\]', src)}
ROUTE_STOPS = {r: json.loads(o) for r, o in re.findall(r'"(\d+P?)": (\{[^}]*\})', src.split('LRT_ROUTE_STOPS')[1])}
COLORS = dict(re.findall(r"route: '(\w+)', color: '(#\w+)'", open(os.path.join(ROOT, 'src/lrt.ts')).read()))

# ---------------------------------------------------------------------------
# 尺寸（地圖單位）
G = 0.13          # 每條色綫闊（並排貼住）
CASE = 0.03       # 黑色綑邊（成束色綫外面）
SEP = 0.028       # 並排色綫之間嘅黑綫（每條色綫畫窄啲，露出底下嘅黑邊）
R = 0.5           # 彎位半徑（中綫）
STRAIGHT = 0.3    # 出站最少直行幾遠先開始彎
PAD = 0.07        # 站膠囊超出色綫
THICK = 0.26      # 膠囊厚度（沿軸）
DOT = 0.14        # 單一色綫站圓點半徑
ZH, EN = 0.3, 0.17
CAP_W, CAP_H = 0.78, 0.28   # 路線號碼膠囊
INK = '#1d1d1f'
# 色綫並排次序（冇特別指定時；按「向右／向上」行嘅左手邊排先）
ORDER = ['761P', '705', '706', '751', '615', '615P', '505', '507', '610', '614', '614P']

# ---------------------------------------------------------------------------
# 站位置（x 向右、y 向下）同軸（h 橫、v 直、d1 東北—西南、d2 西北—東南）
P, AXIS = {}, {}
NAME = {v[0]: k for k, v in STOPS.items()}
VIRTUAL = set()                # 唔係站嘅匯合點（例如 505 兩個方向喺建安前併返一條）
def sid(n): return n if n in STOPS or n in VIRTUAL else NAME[n]
def nm_(s): return STOPS[s][0] if s in STOPS else s
def put_join(name, x, y, axis):
    VIRTUAL.add(name)
    P[name] = (round(x, 4), round(y, 4))
    AXIS[name] = axis
def put(name, x, y, axis):
    s = sid(name)
    P[s] = (round(x, 4), round(y, 4))
    AXIS[s] = axis

MID = 21.4                     # 天水圍環綫中綫、坑尾村
W, E = MID - 2, MID + 2        # 環綫西、東
for n, y in [('天逸', 0.3), ('天富', 1.25), ('頌富', 2.2), ('天瑞', 4.1), ('樂湖', 5.55), ('天耀', 7.0)]: put(n, W, y, 'v')
for n, y in [('濕地公園', 0.1), ('天秀', 0.9), ('天悅', 1.7), ('天榮', 3.9), ('銀座', 4.7), ('天湖', 5.45), ('天慈', 6.2), ('天水圍', 7.0)]: put(n, E, y, 'v')
put('天恒', MID, -0.9, 'h')
YCW = 3.05                     # 翠湖
put('翠湖', MID, YCW, 'h')
put('坑尾村', MID, 10.5, 'v')
BY = 13.1                      # 元朗綫
put('洪水橋', MID - 0.9, BY + 0.9, 'd1')
put('塘坊村', MID + 3.0, BY, 'h')
for i, n in enumerate(['屏山', '水邊圍', '豐年路', '康樂路', '大棠路', '元朗']): put(n, MID + 4.5 + i * 1.5, BY, 'h')
# 幹綫：洪水橋 → 兆康（x + y = 34.5）
for i, n in enumerate(['鍾屋村', '泥圍', '藍地']): put(n, 19.5 - i, 15.0 + i, 'd1')
KX, KY = 16.0, 19.2
put('兆康', KX, KY, 'v')
Y1 = KY + 1.0                  # 屯門北一行
for n, x in [('麒麟', 14.0), ('青松', 12.2), ('建生', 10.4), ('田景', 8.6)]: put(n, x, Y1, 'h')
XW = 7.6                       # 西面直綫
put('良景', XW, 21.2, 'v')
put('新圍', XW, 22.4, 'v')
RY = 23.4                      # 大興一行
XC = 12.8                      # 中間直綫（蔡意橋 → 兆麟）
for n, x in [('大興(北)', 8.9), ('大興(南)', 10.05), ('銀圍', 11.2)]: put(n, x, RY, 'h')
YH = Y1 + 0.5                  # 屯門醫院綫喺兆康南面轉彎（喺北一行下面，唔撞）
DSUM = KX + YH                 # 屯門醫院、澤豐：x + y = DSUM
put('屯門醫院', 14.9, DSUM - 14.9, 'd1')
ZX = DSUM - RY                 # 澤豐 → 銀圍／蔡意橋 轉彎位
put('澤豐', ZX + 0.6, RY - 0.6, 'd1')
put('蔡意橋', ZX, RY + 0.9, 'v')
put('河田', ZX, 26.5, 'v')
# 505 經山景／經鳴琴：山景兩個站喺石排—鳴琴旁邊行一條平行綫，兩邊喺建安會合（似港鐵地圖嘅細圈）
XS = XW + 0.75
put('石排', XW, 24.2, 'v')
put_join('J505N', XW, 24.5, 'v')  # 山景嗰邊喺石排南面併返入主綫
put('鳴琴', XW, 25.85, 'v')
put('山景(北)', XS, 26.05, 'v')
put('山景(南)', XS, 26.7, 'v')
put_join('J505S', XS, 27.7, 'v')   # 兩邊喺度併返一條紅綫
put('建安', XS, 28.15, 'v')
YK = 28.95                     # 建安 → 屯門
YT = YK + 0.8                  # 屯門
put('屯門', ZX, YT, 'v')
YP = YT + 0.8                  # 杯渡一行
put('市中心', ZX, YT + 1.6, 'v')
put('杯渡', 14.4, YP, 'h')
put('安定', ZX, YT + 3.2, 'v')
XY = ZX - 2.4
put('友愛', XY, YT + 3.2, 'v')
put('兆麟', ZX, YT + 4.8, 'v')
put('三聖', ZX + 1.6, YT + 5.6, 'h')
DS2 = ZX + YT + 5.6            # 豐景園 → 兆禧：x + y = DS2
for i, n in enumerate(['豐景園', '海皇路', '兆禧']): put(n, ZX - 1.0 - i, DS2 - (ZX - 1.0 - i), 'd1')
YF = DS2 - XW + 0.8            # 屯門碼頭
put('屯門碼頭', XW, YF, 'v')
for i, n in enumerate(['青雲', '青山村', '龍門', '輕鐵車廠', '蝴蝶', '美樂']): put(n, XW, 28.2 + i * (YF - 1.9 - 28.2) / 5, 'v')
for i, n in enumerate(['鳳地', '景峰', '新墟', '何福堂']): put(n, KX, KY + 2.5 + i * (YP - 1.0 - KY - 2.5) / 3, 'v')

# 路軌彎位：(甲, 乙) → 中間轉角點（由甲行去乙，中綫座標）
BENDS = {
    ('天恒', '天逸'): [(W, -0.9)],
    ('天恒', '濕地公園'): [(E, -0.9)],
    ('頌富', '翠湖'): [(W, YCW)],
    ('翠湖', '天榮'): [(E, YCW)],
    ('天耀', '天水圍'): [(W, 7.8), (E, 7.8)],
    ('天耀', '坑尾村'): [(W, 7.8), (MID, 9.8)],
    ('天水圍', '坑尾村'): [(E, 7.8), (MID, 9.8)],
    ('坑尾村', '塘坊村'): [(MID, 11.2), (MID + 1.9, BY)],
    ('坑尾村', '洪水橋'): [(MID, BY)],
    ('洪水橋', '塘坊村'): [(MID, BY)],
    ('藍地', '兆康'): [(KX, KY - 0.7)],
    ('兆康', '麒麟'): [(KX, Y1)],
    ('兆康', '屯門醫院'): [(KX, YH)],
    ('田景', '良景'): [(XW, Y1)],
    ('新圍', '大興(北)'): [(XW, RY)],
    ('石排', '大興(北)'): [(XW, RY)],
    ('澤豐', '銀圍'): [(ZX, RY)],
    ('澤豐', '蔡意橋'): [(ZX, RY)],
    ('銀圍', '蔡意橋'): [(ZX, RY)],
    ('J505N', '山景(北)'): [(XW, 24.72), (XS, 25.47)],
    ('鳴琴', 'J505S'): [(XW, 26.4), (XS, 27.15)],
    ('建安', '屯門'): [(XS, YK), (ZX, YK)],
    ('市中心', '杯渡'): [(ZX, YP)],
    ('杯渡', '何福堂'): [(KX, YP)],
    ('市中心', '友愛'): [(ZX, YT + 2.4), (XY, YT + 2.4)],
    ('安定', '友愛'): [(ZX, YT + 4.0), (XY, YT + 4.0)],
    ('兆麟', '三聖'): [(ZX, YT + 5.6)],
    ('兆麟', '豐景園'): [(ZX, YT + 5.6)],
    ('兆禧', '屯門碼頭'): [(XW, DS2 - XW)],
}
# 唔停站經過（615 青松 → 兆康 經麒麟唔停）
VIA = {('青松', '兆康'): ['麒麟'], ('鳴琴', '建安'): ['J505S'], ('山景(南)', '建安'): ['J505S'],
       ('石排', '鳴琴'): ['J505N'], ('山景(北)', '石排'): ['J505N']}
# 指定色綫次序：沿住呢串站行，由左至右
CHAIN_ORDER = [
    (['濕地公園', '天秀', '天悅', '天榮', '銀座', '天湖', '天慈', '天水圍'], ['751', '705', '706']),
    (['天耀', '天水圍'], ['706', '705']),
    (['洪水橋', '鍾屋村', '泥圍', '藍地', '兆康'], ['614', '751', '610', '615']),
    (['兆康', '麒麟', '青松', '建生', '田景'], ['615', '615P', '505']),
    (['兆康', '屯門醫院', '澤豐'], ['751', '610']),
    (['蔡意橋', '河田', '屯門'], ['751', '507']),
    (['屯門', '市中心'], ['751', '507', '505']),
    (['市中心', '安定'], ['614P', '614', '751', '507', '505']),
    (['安定', '兆麟'], ['614P', '614', '507', '505']),
    (['田景', '良景', '新圍'], ['507', '615', '615P', '505']),
    (['新圍', '石排'], ['615', '615P', '505']),
    (['石排', 'J505N', '鳴琴'], ['505', '610', '615', '615P']),
    (['鳴琴', '青雲', '青山村', '龍門', '輕鐵車廠', '蝴蝶', '美樂', '屯門碼頭'], ['610', '615', '615P']),
]
# 終點站路線號碼：extend = 色綫穿過個站再散開；split = 穿過個站之後左右分兩邊打直排；n／s／e／w = 放喺站嗰邊（^ = 由站向上排）
CAPS = {'元朗': 'extend', '三聖': 'extend', '屯門碼頭': 'split', '友愛': 'e', '田景': 's', '兆康': 'e', '天逸': 'e', '天水圍': 'w^'}
# 站名位置
LABELS = {}
for n in ['天逸', '天富', '頌富', '天瑞', '樂湖', '天耀']: LABELS[n] = 'w'
for n in ['濕地公園', '天秀', '天悅', '天榮', '銀座', '天湖', '天慈', '天水圍']: LABELS[n] = 'e'
LABELS.update({'天恒': 'n', '翠湖': 's', '坑尾村': 'e', '洪水橋': 'nw', '塘坊村': 's'})
for i, n in enumerate(['屏山', '水邊圍', '豐年路', '康樂路', '大棠路', '元朗']): LABELS[n] = 's' if i % 2 == 0 else 'n'
for n in ['鍾屋村', '泥圍', '藍地']: LABELS[n] = 'se'
LABELS.update({'兆康': 'w', '麒麟': 'n', '青松': 'n', '建生': 'n', '田景': 'n', '良景': 'w', '新圍': 'w', '大興(北)': 'n', '大興(南)': 's',
               '銀圍': 'n', '屯門醫院': 'se', '澤豐': 'se', '蔡意橋': 'e', '河田': 'e', '屯門': 'e', '石排': 'w', '鳴琴': 'w',
               '山景(北)': 'e', '山景(南)': 'e', '建安': 'e', '市中心': 'w', '杯渡': 's', '友愛': 'w', '安定': 'e', '兆麟': 'e',
               '三聖': 'n', '屯門碼頭': 'w'})
LABELS.update({'元朗': 'nw', '屯門醫院': 'nw', '兆麟': 'w', '坑尾村': 'w'})
for n in ['青雲', '青山村', '龍門', '輕鐵車廠', '蝴蝶', '美樂']: LABELS[n] = 'w'
for n in ['鳳地', '景峰', '新墟', '何福堂']: LABELS[n] = 'e'
for n in ['豐景園', '海皇路', '兆禧']: LABELS[n] = 'se'
# 圖例（右下角空位）
LEGEND = (18.6, 30.6, 11.6, 5.4)
LEGEND_ROWS = [('505', '三聖 ↔ 兆康'), ('507', '屯門碼頭 ↔ 田景'), ('610', '屯門碼頭 ↔ 元朗'), ('614', '屯門碼頭 ↔ 元朗'), ('614P', '屯門碼頭 ↔ 兆康'),
               ('615', '屯門碼頭 ↔ 元朗'), ('615P', '屯門碼頭 ↔ 兆康'), ('705', '天水圍循環綫'), ('706', '天水圍循環綫'), ('751', '友愛 ↔ 天逸'), ('761P', '天逸 ↔ 元朗')]

# ---------------------------------------------------------------------------
missing = [STOPS[s][0] for s in STOPS if s not in P]
if missing: sys.exit(f'未排嘅站：{missing}')
S2 = 1 / math.sqrt(2)
AX = {'h': (1, 0), 'v': (0, -1), 'd1': (S2, -S2), 'd2': (S2, S2)}
def unit(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    return (dx / L, dy / L), L
def cross(a, b): return a[0] * b[1] - a[1] * b[0]
def dot(a, b): return a[0] * b[0] + a[1] * b[1]
def left(u): return (u[1], -u[0])     # y 向下：行緊 u 方向嘅左手邊
def tan_len(a, p, b, r=R):
    ua, _ = unit(p, a); ub, _ = unit(p, b)
    th = math.acos(max(-1, min(1, -dot(ua, ub))))
    return r * math.tan(th / 2)

bends = {}
for (a, b), pts in BENDS.items():
    bends[(sid(a), sid(b))] = [tuple(p) for p in pts]
    bends[(sid(b), sid(a))] = [tuple(p) for p in reversed(pts)]
via = {}
for (a, b), vs in VIA.items():
    via[(sid(a), sid(b))] = [sid(v) for v in vs]
    via[(sid(b), sid(a))] = [sid(v) for v in reversed(vs)]

# 每段路軌行經嘅路線、行邊個方向；每條路線停邊啲站、起訖站
edges, used_dirs, stopping, ends = {}, {}, {}, {}
for r, dirs in ROUTE_STOPS.items():
    for seq in dirs.values():
        for s in seq: stopping.setdefault(s, set()).add(r)
        ends.setdefault(seq[0], set()).add(r)
        ends.setdefault(seq[-1], set()).add(r)
        for a, b in zip(seq, seq[1:]):
            chain = [a, *via.get((a, b), []), b]
            for u, v in zip(chain, chain[1:]):
                e = frozenset((u, v))
                edges.setdefault(e, set()).add(r)
                used_dirs.setdefault((e, r), set()).add((u, v))
for s in list(ends):   # 循環綫（705、706）嘅起訖站只係天水圍
    if s != sid('天水圍'): ends[s] -= {'705', '706'}
    if not ends[s]: del ends[s]
def other(e, s): return next(x for x in e if x != s)
def geom(u, v): return [P[u], *bends.get((u, v), []), P[v]]
def oriented(u, v):
    dx, dy = P[v][0] - P[u][0], P[v][1] - P[u][1]
    fwd = dx > 0 if abs(dx) > 1e-9 else dy < 0
    return (u, v) if fwd else (v, u)

errors = []
def octi(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    return abs(dx) < 1e-6 or abs(dy) < 1e-6 or abs(abs(dx) - abs(dy)) < 1e-6
for e in edges:
    u, v = sorted(e)
    g = geom(u, v)
    nm = f'{nm_(u)}–{nm_(v)}'
    bad = False
    for p, q in zip(g, g[1:]):
        if math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9: errors.append(f'{nm} 有重複點 {p}'); bad = True
        elif not octi(p, q): errors.append(f'{nm} 唔係橫直 45°：{p} → {q}'); bad = True
    if bad: continue
    for s, a, b, c in ((u, g[0], g[1], g[2] if len(g) > 2 else None), (v, g[-1], g[-2], g[-3] if len(g) > 2 else None)):
        d, L = unit(a, b)
        if abs(cross(d, AX[AXIS[s]])) > 1e-6: errors.append(f'{nm}：出入 {nm_(s)} 唔係沿軸（{AXIS[s]}）')
        need = (0 if s in VIRTUAL else STRAIGHT) + (tan_len(a, b, c) if c else 0)
        if L < need - 1e-6: errors.append(f'{nm}：出入 {nm_(s)} 直綫得 {L:.2f}，要 {need:.2f}')
    for i in range(1, len(g) - 2):
        need = tan_len(g[i - 1], g[i], g[i + 1]) + tan_len(g[i], g[i + 1], g[i + 2])
        _, L = unit(g[i], g[i + 1])
        if L < need - 1e-6: errors.append(f'{nm}：彎位之間得 {L:.2f}，要 {need:.2f}')
if errors:
    for x in errors: print('✗', x, file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# 色綫次序（沿 u → v 行，由左至右）
chain_order = {}
for chain, routes in CHAIN_ORDER:
    ids = [sid(n) for n in chain]
    for a, b in zip(ids, ids[1:]): chain_order[(a, b)] = routes
def lane_order(u, v):
    rs = edges[frozenset((u, v))]
    if (u, v) in chain_order: return sorted(rs, key=chain_order[(u, v)].index)
    if (v, u) in chain_order: return sorted(rs, key=chain_order[(v, u)].index)[::-1]
    base = sorted(rs, key=ORDER.index)
    return base if oriented(u, v) == (u, v) else base[::-1]

# 出站位：每個站每邊，幾段路軌並排；轉左嘅喺左、轉右嘅喺右，同方向轉嘅近啲轉嗰段喺內圈
adj, side_of, side_edges = {}, {}, {}
for e in edges:
    for s in e:
        adj.setdefault(s, []).append(e)
        g = geom(s, other(e, s))
        d, L = unit(g[0], g[1])
        side = 1 if dot(d, AX[AXIS[s]]) > 0 else -1
        turn, dist = 0.0, 0.0
        if len(g) > 2:
            d2, _ = unit(g[1], g[2])
            turn = round(math.atan2(cross(d, d2), dot(d, d2)), 3)   # < 0 = 左轉
            dist = L if turn < 0 else -L
        side_of[(s, e)] = side
        side_edges.setdefault((s, side), []).append(((turn, dist), e))
port_base = {}
for (s, side), lst in side_edges.items():
    lst.sort(key=lambda x: x[0])
    pos = sum(len(edges[e]) for _, e in lst) * G / 2
    for _, e in lst:
        n = len(edges[e])
        port_base[(s, e)] = pos - n * G / 2
        pos -= n * G
    if s in VIRTUAL:
        main = max((e for _, e in lst), key=lambda e: len(edges[e]))
        mo = lane_order(s, other(main, s))
        for _, e in lst:
            port_base[(s, e)] = 0.0
            if e == main: continue
            own = lane_order(s, other(e, s))
            r = next((r for r in own if r in mo), None)
            if r: port_base[(s, e)] = ((len(mo) - 1) / 2 - mo.index(r)) * G - ((len(own) - 1) / 2 - own.index(r)) * G

# 站兩邊對齊：同一條路線入站出站用同一個位（唔會過咗站就走去第二行）。
# 兩邊每段路軌（成束色綫）試晒放喺邊個位，揀兩邊同一條路線喺同一個位最多嘅排法；完咗、分出去嘅綫喺旁邊。
def side_seq(s, side):
    lst = [e for _, e in side_edges.get((s, side), [])]
    seq = []
    for e in (lst if side == 1 else lst[::-1]):
        o = lane_order(s, other(e, s))
        seq += [(r, e) for r in (o if side == 1 else o[::-1])]
    return seq
def placements(sizes, M):
    res = []
    def rec(i, start, acc):
        if i == len(sizes): res.append(list(acc)); return
        for st in range(start, M - sum(sizes[i:]) + 1):
            acc.append(st); rec(i + 1, st + sizes[i], acc); acc.pop()
    rec(0, 0, [])
    return res
def blocks_of(seq):
    out = []
    for r, e in seq:
        if not out or out[-1][0] != e: out.append((e, []))
        out[-1][1].append(r)
    return out
jumps = []
for s in P:
    if s in VIRTUAL: continue
    A, B = blocks_of(side_seq(s, 1)), blocks_of(side_seq(s, -1))
    na, nb = sum(len(x[1]) for x in A), sum(len(x[1]) for x in B)
    M = max(na, nb) + 2
    best = None
    for pa in placements([len(x[1]) for x in A], M):
        sa = {st + i: r for (e, rs), st in zip(A, pa) for i, r in enumerate(rs)}
        for pb in placements([len(x[1]) for x in B], M):
            sb = {st + i: r for (e, rs), st in zip(B, pb) for i, r in enumerate(rs)}
            match = sum(1 for k, r in sa.items() if sb.get(k) == r)
            used = set(sa) | set(sb)
            span = max(used) - min(used)
            ca = (min(sa) + max(sa)) / 2 if sa else 0
            cb = (min(sb) + max(sb)) / 2 if sb else ca
            key = (-match, span, abs(ca - cb) if sa and sb else 0)
            if best is None or key < best[0]: best = (key, pa, pb, sa, sb)
    _, pa, pb, sa, sb = best
    used = set(sa) | set(sb)
    mid = (min(used) + max(used)) / 2
    for side, blocks, pl in ((1, A, pa), (-1, B, pb)):
        for (e, rs), st in zip(blocks, pl):
            c = (mid - (st + (len(rs) - 1) / 2)) * G
            port_base[(s, e)] = c if side == 1 else -c
    both = set(sa.values()) & set(sb.values())
    for r in sorted(both):
        if not any(sb.get(k) == r for k, x in sa.items() if x == r): jumps.append(f'{nm_(s)} {r}')

# 站嘅橫移：令每段路軌兩頭嘅出站位一致（色綫一路平行，轉彎同心）。
# 由最大嘅站開始，先跟直路軌、再跟同其他路軌共用彎位嘅、最後其他，咁樣對唔齊嘅只會喺普通彎位處理。
shift = {}
def port_eff(s, e): return port_base[(s, e)] + shift[s] * side_of[(s, e)]
bend_use = {}
for e in edges:
    u, v = sorted(e)
    for b in bends.get((u, v), []): bend_use[(round(b[0], 3), round(b[1], 3))] = bend_use.get((round(b[0], 3), round(b[1], 3)), 0) + 1
def prio(e):
    u, v = sorted(e)
    g = geom(u, v)
    if len(g) == 2: return 0
    return 1 if any(bend_use[(round(b[0], 3), round(b[1], 3))] > 1 for b in g[1:-1]) else 2
lanes_at = {s: sum(len(edges[e]) for e in adj[s]) for s in P}
counter = itertools.count()
seed = []
for j in VIRTUAL:              # 匯合點固定喺正中，佢兩邊嘅直路軌跟佢
    shift[j] = 0.0
    seed += [(prio(e), next(counter), j, e) for e in adj[j] if prio(e) == 0]
for start in sorted(P, key=lambda s: -lanes_at[s]):
    if start in shift: continue
    shift[start] = 0.0
    heap = [(prio(e), next(counter), start, e) for e in adj[start]] + seed
    seed = []
    heapq.heapify(heap)
    while heap:
        _, _, s, e = heapq.heappop(heap)
        t = other(e, s)
        if t in shift: continue
        shift[t] = (-port_eff(s, e) - port_base[(t, e)]) * side_of[(t, e)]
        for f in adj[t]:
            if other(f, t) not in shift: heapq.heappush(heap, (prio(f), next(counter), t, f))

def line_isect(p, d, q, f):
    t = cross((q[0] - p[0], q[1] - p[1]), f) / cross(d, f)
    return (p[0] + d[0] * t, p[1] + d[1] * t)

def lane_poly(g, offs):
    """折綫每段向左平移 offs[k]；轉角斜接，半徑按偏移調（同心）"""
    lines = []
    for (p, q), d in zip(zip(g, g[1:]), offs):
        u, _ = unit(p, q)
        n = left(u)
        lines.append(((p[0] + n[0] * d, p[1] + n[1] * d), u, d))
    pts = [lines[0][0]]
    for (a1, u1, d1), (a2, u2, d2) in zip(lines, lines[1:]):
        c = cross(u1, u2)
        x, y = line_isect(a1, u1, a2, u2)
        turn = 1 if c > 0 else -1          # 右轉 +1
        pts.append((x, y, max(0.05, R + (d1 + d2) / 2 * turn)))
    u, _ = unit(g[-2], g[-1])
    n = left(u)
    pts.append((g[-1][0] + n[0] * offs[-1], g[-1][1] + n[1] * offs[-1]))
    return pts

lanes = []          # (路線, 點, (u, v), 單向 (由, 去) 或者 None)
lane_end = {}       # (站, 路線) → (點, 由站入路軌嘅方向)
jogs = []
for e in edges:
    u, v = oriented(*e)
    g = geom(u, v)
    rs = lane_order(u, v)
    n = len(rs)
    pu, pv = port_eff(u, e), -port_eff(v, e)
    if len(g) == 2 and abs(pu - pv) > 1e-6: jogs.append(f'{nm_(u)}–{nm_(v)}（{abs(pu - pv):.2f}）')
    for i, r in enumerate(rs):
        l = ((n - 1) / 2 - i) * G
        if len(g) == 2 and abs(pu - pv) > 1e-6:
            (dx, dy), L = unit(g[0], g[1])
            nx, ny = left((dx, dy))
            dl = abs(pv - pu)
            m = (L - dl) / 2
            a, b = g
            pts = [(a[0] + nx * (pu + l), a[1] + ny * (pu + l)),
                   (a[0] + dx * m + nx * (pu + l), a[1] + dy * m + ny * (pu + l), 0.3),
                   (a[0] + dx * (m + dl) + nx * (pv + l), a[1] + dy * (m + dl) + ny * (pv + l), 0.3),
                   (b[0] + nx * (pv + l), b[1] + ny * (pv + l))]
        else:
            k = len(g) - 1
            half = max(1, k // 2)
            offs = [pu + l if j < half else pv + l for j in range(k)]
            if abs(pu - pv) < 1e-6: offs = [pu + l] * k
            pts = lane_poly(g, offs)
        dirs = used_dirs[(e, r)]
        lanes.append((r, pts, (u, v), next(iter(dirs)) if len(dirs) == 1 else None))
        lane_end.setdefault((u, r), (pts[0], unit(g[0], g[1])[0]))
        lane_end.setdefault((v, r), (pts[-1], unit(g[-1], g[-2])[0]))

# ---------------------------------------------------------------------------
# 站：膠囊或者圓點（中心跟色綫實際位置）
markers = {}
STATIONS = [s for s in P if s not in VIRTUAL]
for s in STATIONS:
    ax = AX[AXIS[s]]
    N = left(ax)
    offs = []
    for e in adj[s]:
        p, n, sd = port_eff(s, e), len(edges[e]), side_of[(s, e)]
        for i in range(n):
            offs.append(sd * (p + ((n - 1) / 2 - i) * G))
    lo, hi = min(offs), max(offs)
    c = (lo + hi) / 2
    cx, cy = P[s][0] + N[0] * c, P[s][1] + N[1] * c
    if hi - lo < 1e-6:
        markers[s] = {'kind': 'dot', 'x': round(cx, 4), 'y': round(cy, 4), 'r': DOT}
    else:
        markers[s] = {'kind': 'pill', 'x': round(cx, 4), 'y': round(cy, 4), 'len': round(hi - lo + G + 2 * PAD, 4), 'thick': THICK,
                      'angle': round(math.degrees(math.atan2(N[1], N[0])), 2)}

def marker_box(s):
    m = markers[s]
    if m['kind'] == 'dot': return (m['x'] - m['r'], m['y'] - m['r'], 2 * m['r'], 2 * m['r'])
    a = math.radians(m['angle'])
    hx = abs(math.cos(a)) * m['len'] / 2 + abs(math.sin(a)) * m['thick'] / 2
    hy = abs(math.sin(a)) * m['len'] / 2 + abs(math.cos(a)) * m['thick'] / 2
    return (m['x'] - hx, m['y'] - hy, 2 * hx, 2 * hy)

# ---------------------------------------------------------------------------
# 終點站路線號碼
caps, cap_lanes = [], []
for name, mode in CAPS.items():
    s = sid(name)
    rs = [r for r in ORDER if r in ends.get(s, set())]
    if not rs: errors.append(f'{name} 唔係終點站'); continue
    if mode == 'extend':
        items = []
        for r in rs:
            (pt, d) = lane_end[(s, r)]
            out = (-d[0], -d[1])
            nrm = left(out)
            items.append(((pt[0] - P[s][0]) * nrm[0] + (pt[1] - P[s][1]) * nrm[1], r, pt, out, nrm))
        items.sort(key=lambda x: -x[0])
        out, nrm = items[0][3], items[0][4]
        vertical = abs(out[0]) < 1e-6
        gap = (CAP_W if vertical else CAP_H) + 0.08
        k = len(items)
        c0 = sum(x[0] for x in items) / k
        e0 = THICK / 2 + 0.2
        cos_ = [c0 + ((k - 1) / 2 - i) * gap for i in range(k)]
        far = e0 + max(abs(co - it[0]) for co, it in zip(cos_, items)) + 0.2
        for co, (off, r, pt, _, _) in zip(cos_, items):
            dl = co - off
            p0 = (pt[0], pt[1])
            p3 = (pt[0] + out[0] * far + nrm[0] * dl, pt[1] + out[1] * far + nrm[1] * dl)
            if abs(dl) > 1e-6:
                p1 = (pt[0] + out[0] * e0, pt[1] + out[1] * e0, 0.2)
                p2 = (pt[0] + out[0] * (e0 + abs(dl)) + nrm[0] * dl, pt[1] + out[1] * (e0 + abs(dl)) + nrm[1] * dl, 0.2)
                pts = [p0, p1, p2, p3]
            else:
                pts = [p0, p3]
            cap_lanes.append((r, pts))
            h = CAP_H / 2 if vertical else CAP_W / 2
            caps.append({'route': r, 'x': round(p3[0] + out[0] * h, 4), 'y': round(p3[1] + out[1] * h, 4)})
    elif mode == 'split':
        items = []
        for r in rs:
            (pt, d) = lane_end[(s, r)]
            out = (-d[0], -d[1])
            nrm = left(out)
            items.append(((pt[0] - P[s][0]) * nrm[0] + (pt[1] - P[s][1]) * nrm[1], r, pt, out, nrm))
        out, nrm = items[0][3], items[0][4]
        c0 = sum(x[0] for x in items) / len(items)
        e0 = THICK / 2 + 0.42
        for grp, sign in (([x for x in items if x[0] > c0], 1), ([x for x in items if x[0] <= c0], -1)):
            grp.sort(key=lambda x: -x[0] * sign)        # 內圈（最外邊嗰條綫）先轉
            end = max(x[0] * sign for x in grp) + 0.35
            for rank, (off, r, pt, _, _) in enumerate(grp):
                t = e0 + rank * (CAP_H + 0.08)
                p1 = (pt[0] + out[0] * t, pt[1] + out[1] * t, 0.2)
                k = end * sign - off
                p2 = (p1[0] + nrm[0] * k, p1[1] + nrm[1] * k)
                cap_lanes.append((r, [(pt[0], pt[1]), p1, p2]))
                caps.append({'route': r, 'x': round(p2[0] + nrm[0] * sign * CAP_W / 2, 4), 'y': round(p2[1] + nrm[1] * sign * CAP_W / 2, 4)})
    else:
        bx, by, bw, bh = marker_box(s)
        k = len(rs)
        for i, r in enumerate(rs):
            if mode in ('s', 'n'):
                cy = (by + bh + 0.12 + CAP_H / 2) if mode == 's' else (by - 0.12 - CAP_H / 2)
                cx = bx + bw / 2 + (i - (k - 1) / 2) * (CAP_W + 0.08)
            else:
                cx = (bx + bw + 0.12 + CAP_W / 2) if mode[0] == 'e' else (bx - 0.12 - CAP_W / 2)
                cy = by + bh / 2 + ((i - (k - 1) / 2) if mode[-1] != '^' else (i - (k - 1))) * (CAP_H + 0.08)
            caps.append({'route': r, 'x': round(cx, 4), 'y': round(cy, 4)})
def cap_box(c): return (c['x'] - CAP_W / 2, c['y'] - CAP_H / 2, CAP_W, CAP_H)

# 單方向箭咀：每條單向色綫最長嗰段直綫中間一個
arrows = []
for r, pts, (u, v), one in lanes:
    if not one: continue
    i = max(range(len(pts) - 1), key=lambda i: math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
    a, b = pts[i], pts[i + 1]
    d, L = unit(a, b)
    if one != (u, v): d = (-d[0], -d[1])
    arrows.append({'route': r, 'x': round((a[0] + b[0]) / 2, 4), 'y': round((a[1] + b[1]) / 2, 4), 'angle': round(math.degrees(math.atan2(d[1], d[0])), 1)})

# ---------------------------------------------------------------------------
# 站名
def text_w(s, size, en=False):
    if en: return len(s) * size * 0.52
    return sum(size * (0.45 if c in '()（）' else 1.0) for c in s)
labels = {}
for s in STATIONS:
    zh, en = STOPS[s]
    side = LABELS.get(zh, 's')
    bx, by, bw, bh = marker_box(s)
    gap = 0.1
    cx, cy = bx + bw / 2, by + bh / 2
    w = max(text_w(zh, ZH), text_w(en, EN, True))
    h = ZH + EN + 0.04
    if side == 'n': x, y, anchor = cx, by - gap - h, 'middle'
    elif side == 's': x, y, anchor = cx, by + bh + gap, 'middle'
    elif side == 'e': x, y, anchor = bx + bw + gap, cy - h / 2, 'start'
    elif side == 'w': x, y, anchor = bx - gap, cy - h / 2, 'end'
    elif side == 'ne': x, y, anchor = bx + bw, by - h + 0.02, 'start'
    elif side == 'nw': x, y, anchor = bx, by - h + 0.02, 'end'
    elif side == 'se': x, y, anchor = bx + bw, by + bh - 0.02, 'start'
    else: x, y, anchor = bx, by + bh - 0.02, 'end'
    lft = x - (w / 2 if anchor == 'middle' else w if anchor == 'end' else 0)
    labels[s] = {'x': round(x, 4), 'zhY': round(y + ZH * 0.86, 4), 'enY': round(y + ZH + 0.03 + EN * 0.86, 4), 'anchor': anchor, 'box': (lft, y, w, h)}

def hit(box, x, y, pad):
    bx, by, bw, bh = box
    return bx - pad < x < bx + bw + pad and by - pad < y < by + bh + pad
def poly_hits(pts, box, pad):
    for p, q in zip(pts, pts[1:]):
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        n = max(2, int(L / 0.04))
        for i in range(n + 1):
            t = i / n
            if hit(box, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, pad): return True
    return False
def overlap(a, b, gx=0.0, gy=0.0):
    return a[0] < b[0] + b[2] + gx and b[0] < a[0] + a[2] + gx and a[1] < b[1] + b[3] + gy and b[1] < a[1] + a[3] + gy
all_lanes = [(r, pts) for r, pts, *_ in lanes] + cap_lanes
for s, lb in labels.items():
    nm = STOPS[s][0]
    for r, pts in all_lanes:
        if poly_hits(pts, lb['box'], G / 2 + CASE):
            errors.append(f'站名「{nm}」撞到 {r} 綫'); break
    for t in STATIONS:
        if t != s and overlap(lb['box'], marker_box(t)): errors.append(f'站名「{nm}」撞到站 {STOPS[t][0]}')
    for c in caps:
        if overlap(lb['box'], cap_box(c), 0.04, 0.04): errors.append(f'站名「{nm}」撞到 {c["route"]} 號碼')
    for t, lt in labels.items():
        if t > s and overlap(lb['box'], lt['box'], 0.12, 0.06): errors.append(f'站名「{nm}」同「{STOPS[t][0]}」太近')
for i, c in enumerate(caps):
    for t in STATIONS:
        if overlap(cap_box(c), marker_box(t), 0.02, 0.02): errors.append(f'{c["route"]} 號碼撞到站 {STOPS[t][0]}')
    for r, pts, *_ in lanes:
        if poly_hits(pts, cap_box(c), G / 2): errors.append(f'{c["route"]} 號碼撞到 {r} 綫'); break
    for d in caps[i + 1:]:
        if overlap(cap_box(c), cap_box(d), 0.02, 0.02): errors.append(f'{c["route"]} 同 {d["route"]} 號碼重疊')
lx, ly, lw, lh = LEGEND
for s, lb in labels.items():
    if overlap(lb['box'], (lx, ly, lw, lh)): errors.append(f'站名「{STOPS[s][0]}」入咗圖例')
for r, pts in all_lanes:
    if poly_hits(pts, (lx, ly, lw, lh), 0.1): errors.append(f'{r} 綫入咗圖例'); break

xs = [m['x'] for m in markers.values()] + [l['box'][0] for l in labels.values()] + [l['box'][0] + l['box'][2] for l in labels.values()] + [c['x'] + CAP_W / 2 for c in caps] + [c['x'] - CAP_W / 2 for c in caps] + [lx + lw]
ys = [m['y'] for m in markers.values()] + [l['box'][1] for l in labels.values()] + [l['box'][1] + l['box'][3] for l in labels.values()] + [c['y'] + CAP_H / 2 for c in caps] + [ly + lh, -0.9 - 0.4]
VIEW = (round(min(xs) - 0.6, 2), round(min(ys) - 0.6, 2), round(max(xs) - min(xs) + 1.2, 2), round(max(ys) - min(ys) + 1.2, 2))

print(f'{len(P)} 個站、{len(edges)} 段路軌、{len(lanes)} 條色綫、{len(caps)} 個號碼、{len(arrows)} 個箭咀；範圍 {VIEW}', file=sys.stderr)
for j in jogs: print('· 直路軌兩頭出站位唔同，中間打斜移位：', j, file=sys.stderr)
if jumps: print('· 過站換位（同其他綫交叉）：', '、'.join(jumps), file=sys.stderr)
for x in errors: print('✗', x, file=sys.stderr)

# ---------------------------------------------------------------------------
def path_d(pts):
    def f(n): return f'{n:.4f}'.rstrip('0').rstrip('.')
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    used = 0
    for i in range(1, len(pts) - 1):
        a, p, b = pts[i - 1], pts[i], pts[i + 1]
        la, lb = math.hypot(a[0] - p[0], a[1] - p[1]), math.hypot(b[0] - p[0], b[1] - p[1])
        if la < 1e-9 or lb < 1e-9: continue
        ua, ub = ((a[0] - p[0]) / la, (a[1] - p[1]) / la), ((b[0] - p[0]) / lb, (b[1] - p[1]) / lb)
        th = math.acos(max(-1, min(1, -(ua[0] * ub[0] + ua[1] * ub[1]))))
        if th < 1e-6: used = 0; d += f' L{f(p[0])} {f(p[1])}'; continue
        r = p[2] if len(p) > 2 else R
        t = r * math.tan(th / 2)
        tmax = min(la - used, lb / 2 if i < len(pts) - 2 else lb)
        if t > tmax: t = max(0, tmax); r = t / math.tan(th / 2)
        used = t
        p1, p2 = (p[0] + ua[0] * t, p[1] + ua[1] * t), (p[0] + ub[0] * t, p[1] + ub[1] * t)
        crs = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
        d += f' L{f(p1[0])} {f(p1[1])} A{f(r)} {f(r)} 0 0 {1 if crs > 0 else 0} {f(p2[0])} {f(p2[1])}'
    return d + f' L{f(pts[-1][0])} {f(pts[-1][1])}'

def cap_svg(x, y, route):
    return (f'<rect x="{x - CAP_W / 2:.4f}" y="{y - CAP_H / 2:.4f}" width="{CAP_W}" height="{CAP_H}" rx="{CAP_H / 2}" fill="{COLORS[route]}" stroke="{INK}" stroke-width="{CASE}"/>'
            f'<rect x="{x - CAP_W / 2 + 0.055:.4f}" y="{y - CAP_H / 2 + 0.05:.4f}" width="{CAP_W - 0.11:.4f}" height="{CAP_H - 0.1:.4f}" rx="{(CAP_H - 0.1) / 2:.4f}" fill="#fff"/>'
            f'<text x="{x:.4f}" y="{y + 0.058:.4f}" text-anchor="middle" font-size="0.165" font-weight="800" fill="#111">{route}</text>')

if '--svg' in sys.argv:
    out_path = sys.argv[sys.argv.index('--svg') + 1]
    vx, vy, vw, vh = VIEW
    sc = 60
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw * sc:.0f}" height="{vh * sc:.0f}" viewBox="{vx} {vy} {vw} {vh}" font-family="PingFang HK, Noto Sans CJK TC, sans-serif">',
         f'<rect x="{vx}" y="{vy}" width="{vw}" height="{vh}" fill="#fff"/>']
    for r, pts in all_lanes:
        o.append(f'<path d="{path_d(pts)}" fill="none" stroke="{INK}" stroke-width="{G + 2 * CASE}"/>')
    for r, pts in all_lanes:
        o.append(f'<path d="{path_d(pts)}" fill="none" stroke="{COLORS[r]}" stroke-width="{G - SEP}"/>')
    for a in arrows:
        o.append(f'<path d="M-0.035 -0.042 L0.025 0 L-0.035 0.042" fill="none" stroke="#fff" stroke-width="0.026" stroke-linecap="round" stroke-linejoin="round" transform="translate({a["x"]} {a["y"]}) rotate({a["angle"]})"/>')
    for s, m in markers.items():
        if m['kind'] == 'dot':
            o.append(f'<circle cx="{m["x"]}" cy="{m["y"]}" r="{m["r"]}" fill="#fff" stroke="{INK}" stroke-width="0.045"/>')
        else:
            x, y, L, t = m['x'], m['y'], m['len'], m['thick']
            o.append(f'<rect x="{x - L / 2:.4f}" y="{y - t / 2:.4f}" width="{L}" height="{t}" rx="{t / 2}" fill="#fff" stroke="{INK}" stroke-width="0.045" transform="rotate({m["angle"]} {x} {y})"/>')
    for c in caps: o.append(cap_svg(c['x'], c['y'], c['route']))
    o.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="0.3" fill="#fff" stroke="#e5e7eb" stroke-width="0.04"/>')
    o.append(f'<text x="{lx + 0.4}" y="{ly + 0.75}" font-size="0.36" font-weight="700" fill="#111">輕鐵路綫圖<tspan font-size="0.2" fill="#666" dx="0.15">Light Rail</tspan></text>')
    for i, (r, zh) in enumerate(LEGEND_ROWS):
        x = lx + 0.4 + (i % 2) * 5.6
        y = ly + 1.5 + (i // 2) * 0.62
        o.append(cap_svg(x + CAP_W / 2, y, r))
        o.append(f'<text x="{x + CAP_W + 0.2}" y="{y + 0.09}" font-size="0.24" font-weight="600" fill="#111">{zh}</text>')
    for s, lb in labels.items():
        zh, en = STOPS[s]
        o.append(f'<text x="{lb["x"]}" y="{lb["zhY"]}" text-anchor="{lb["anchor"]}" font-size="{ZH}" font-weight="700" fill="#111">{zh}</text>')
        o.append(f'<text x="{lb["x"]}" y="{lb["enY"]}" text-anchor="{lb["anchor"]}" font-size="{EN}" fill="#666">{en}</text>')
    o.append('</svg>')
    open(out_path, 'w').write('\n'.join(o))
    print(f'預覽：{out_path}', file=sys.stderr)
