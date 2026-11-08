"""港鐵示意圖座標（自己畫）+ 檢查：45° 轉彎、統一彎位、站離轉角、轉車站對齊、站名唔撞。輸出 TS。"""
# 用法：curl -s https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv -o /tmp/mtr.csv；python3 packages/core/tools/mtr-layout.py [--ts]
# 改完座標行一次，0 個問題先將 --ts 輸出貼返入 src/mtr-map.ts 嘅 MTR_MAP_LINES／MTR_MAP_LABELS。
import json, math, sys, csv, collections

G = 0.24      # 並排綫距離 = 綫闊（貼埋）
R = 0.45      # 統一彎位（沿線段由轉角量）
CLR = 0.6     # 站離轉角最少

L = {}
def line(code, paths, stations):
    L[code] = {'paths': paths, 'stations': stations}

# ---------------- 港島綫 ----------------
line('ISL', [[(2.5,22),(29.3,22),(30.3,23),(30.3,25.6)]], dict(
    KET=(2.5,22), HKU=(4.4,22), SYP=(6.2,22), SHW=(8.0,22), CEN=(10.2,22), ADM=(12.4,22), WAC=(14.6,22), CAB=(16.6,22),
    TIH=(18.6,22), FOH=(20.6,22), NOP=(22.6,22), QUB=(24.6,22), TAK=(26.6,22), SWH=(28.6,22), SKW=(30.3,23.7), HFC=(30.3,24.65), CHW=(30.3,25.6)))
# ---------------- 荃灣綫：中環、金鐘緊貼港島綫上面 ----------------
TW = 22 - G
line('TWL', [[(10.2,TW),(13.0,TW),(15,TW-2.0),(15,13.1),(14.2,12.3),(1.5,12.3)]], dict(
    CEN=(10.2,TW), ADM=(12.4,TW), TST=(15,17.9), JOR=(15,17.0), YMT=(15,15.8), MOK=(15,14.8), PRE=(15,13.8),
    SSP=(13.6,12.3), CSW=(12.25,12.3), LCK=(11.0,12.3), MEF=(9.48,12.3), LAK=(7.6,12.3), KWF=(6.0,12.3), KWH=(4.5,12.3), TWH=(3.0,12.3), TSW=(1.5,12.3)))
# ---------------- 觀塘綫：油麻地至太子喺荃灣綫右邊貼住 ----------------
KX = 15 + G
line('KTL', [[(21.2,17.2),(16.04,17.2),(KX,16.4),(KX,10.6),(16.04,9.8),(24.05,9.8),(24.85,10.6),(24.85,14.6),(25.65,15.4),(28.5,15.4)]], dict(
    WHA=(21.2,17.2), HOM=(19.2,17.2), YMT=(KX,15.8), MOK=(KX,14.8), PRE=(KX,13.8), SKM=(KX,11.7), KOT=(17.5,9.8), LOF=(19.0,9.8),
    WTS=(20.5,9.8), DIH=(22.0,9.8), CHH=(23.4,9.8), KOB=(24.85,11.3), NTK=(24.85,12.2), KWT=(24.85,13.1), LAT=(24.85,14.0), YAT=(27.2,15.4), TIK=(28.5,15.4)))
# ---------------- 將軍澳綫：北角、鰂魚涌貼住港島綫上面；油塘、調景嶺貼住觀塘綫下面 ----------------
TK = 15.4 + G
line('TKL', [[(22.6,TW),(25.2,TW),(25.9,TW-0.7),(25.9,TK+0.7),(26.6,TK),(30.2,TK),(31.0,TK-0.8),(31.0,12.4)],
             [(30.2,TK),(31.0,TK+0.8),(31.0,17.6)]], dict(
    NOP=(22.6,TW), QUB=(24.6,TW), YAT=(27.2,TK), TIK=(28.5,TK), TKO=(29.6,TK), HAH=(31.0,13.6), POA=(31.0,12.4), LHP=(31.0,17.6)))
# ---------------- 屯馬綫 ----------------
ML = 9.48 # 經美孚、南昌嗰段直綫（南昌貼住東涌綫右邊）
line('TML', [[(1,7.0),(1,2.9),(1.8,2.1),(3.2,2.1),(4,2.9),(4,8.0),(5.5,9.5),(8.68,9.5),(ML,10.3),(ML,15.5),(ML+3.1,18.6),(18.4,18.6),(19.2,17.8),
              (19.2,16.3),(22.0,13.5),(22.0,9.0),(21.2,8.2),(18.54,8.2),(17.5+G,7.4),(17.5+G,6.2),(19.44,4.5),(28.6,4.5)]], dict(
    TUM=(1,7.0), SIH=(1,4.6), TIS=(2.5,2.1), LOP=(4,3.7), YUL=(4,5.2), KSR=(4,6.7), TWW=(7.0,9.5), MEF=(ML,12.3-G), NAC=(ML,14.9),
    AUS=(10.9,16.92), ETS=(16.2,18.6), HUH=(17.5,18.6), HOM=(19.2,17.2-G), TKW=(20.5,15.0), SUW=(22,12.8), KAT=(22,11.4), DIH=(22,9.8+G),
    HIK=(20.0,8.2), TAW=(17.5+G,6.8), CKT=(18.6,5.34), STW=(20.2,4.5), CIO=(21.6,4.5), SHM=(23.0,4.5), TSH=(24.4,4.5), HEO=(25.8,4.5),
    MOS=(27.2,4.5), WKS=(28.6,4.5)))
# ---------------- 東鐵綫：金鐘喺港島綫下面，過咗金鐘先斜上 ----------------
EA = 22 + G
line('EAL', [[(12.4,EA),(13.0,EA),(13.94,21.3),(16.3,21.3),(17.5,20.1),(17.5,2.9),(16.7,2.1),(10.2,2.1)],
             [(12.2,2.1),(11.4,2.9),(10.2,2.9)]], dict(
    ADM=(12.4,EA), EXC=(15.4,21.3), HUH=(17.5,18.6-G), MKK=(17.5,13.0), KOT=(17.5,9.8+G), TAW=(17.5,6.8), SHT=(17.5,5.8), FOT=(17.5,4.7),
    UNI=(17.5,3.6), TAP=(16.0,2.1), TWO=(14.75,2.1), FAN=(13.5,2.1), SHS=(12.2,2.1), LOW=(10.2,2.1), LMC=(10.2,2.9)))
# ---------------- 南港島綫：金鐘最低一條 ----------------
SI = 22 + 2*G
line('SIL', [[(12.4,SI),(13.0,SI),(13.8,SI+0.8),(13.8,24.5),(13.0,25.3),(9.0,25.3)]], dict(
    ADM=(12.4,SI), OCP=(13.8,23.9), WCH=(12.4,25.3), LET=(10.7,25.3), SOH=(9.0,25.3)))
# ---------------- 東涌綫、機場快綫：香港站至青衣貼住並排；過咗青衣機場快綫交叉去上面 ----------------
TC = 9.0 + G   # 東涌綫（外邊）
line('TCL', [[(TC,21.3),(TC,13.4),(8.38,12.3+G),(7.0,12.3+G),(5.0,14.54),(5.0,18.3),(4.2,19.1),(2.6,19.1)]], dict(
    HOK=(TC,21.3), KOW=(TC,17.9), OLY=(TC,16.3), NAC=(TC,14.9), LAK=(7.6,12.3+G), TSY=(5.0,15.4), SUN=(5.0,17.6), TUC=(2.6,19.1)))
line('AEL', [[(9.0,21.3),(9.0,13.499),(8.281,12.3+2*G),(7.099,12.3+2*G),(5.24,14.639),(5.24,16.2),(4.24,17.2),(1.9,17.2)]], dict(
    HOK=(9.0,21.3), KOW=(9.0,17.9), TSY=(5.24,15.4), AIR=(3.4,17.2), AWE=(1.9,17.2)))
# ---------------- 迪士尼綫：由欣澳貼住東涌綫向下 ----------------
line('DRL', [[(5.0+G,17.6),(5.0+G,19.6)]], dict(SUN=(5.0+G,17.6), DIS=(5.0+G,19.6)))

LABELS = dict(
  CEN='s', ADM='sw', SKW='e', HFC='e', CHW='e',
  TST='w', JOR='w', YMT='w', MOK='w', PRE='w', SSP='n', CSW='n', LCK='n', MEF='ne', LAK='n', KWF='n', KWH='n', TWH='n', TSW='n',
  WHA='e', HOM='se', SKM='e', KOT='nw', LOF='n', WTS='n', DIH='se', CHH='n', KOB='e', NTK='e', KWT='e', LAT='e', YAT='n', TIK='n',
  NOP='s', QUB='s', TKO='s', HAH='e', POA='e', LHP='e',
  TUM='e', SIH='e', TIS='n', LOP='e', YUL='e', KSR='e', TWW='n', NAC='e', AUS='ne', ETS='n', HUH='se', TKW='se', SUW='e', KAT='e',
  HIK='n', TAW='w', CKT='se', STW='n', CIO='n', SHM='n', TSH='n', HEO='n', MOS='n', WKS='n',
  EXC='n', MKK='e', SHT='w', FOT='w', UNI='w', TAP='n', TWO='n', FAN='n', SHS='n', LOW='w', LMC='w',
  OCP='e', WCH='s', LET='s', SOH='s',
  HOK='nw', KOW='w', OLY='w', TSY='w', SUN='w', TUC='s', AIR='n', AWE='n', DIS='s',
)
# 站名同站粒之間額外留位（例如奧運：左邊仲有機場快綫）
LABEL_GAP = dict(OLY=0.42)

# ======================= 檢查 =======================
PAD = 0.15
names = {}
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/mtr.csv', encoding='utf-8-sig')):
    if r['Station Code']: names[r['Station Code']] = (r['Chinese Name'], r['English Name'])
errs = []
d = lambda a,b: math.hypot(a[0]-b[0], a[1]-b[1])
def onseg(p,a,b): return abs(d(a,p)+d(p,b)-d(a,b)) < 0.01
for code, l in L.items():
    for path in l['paths']:
        for i in range(1, len(path)):
            dx, dy = abs(path[i][0]-path[i-1][0]), abs(path[i][1]-path[i-1][1])
            if not (dx < 1e-9 or dy < 1e-9 or abs(dx-dy) < 1e-6): errs.append(f'{code} 段 {i} 唔係橫直或 45°: {path[i-1]}→{path[i]}')
        for i in range(1, len(path)-1):
            a, p, b = path[i-1], path[i], path[i+1]
            v1 = (p[0]-a[0], p[1]-a[1]); v2 = (b[0]-p[0], b[1]-p[1])
            ang = math.degrees(math.acos(max(-1,min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(math.hypot(*v1)*math.hypot(*v2))))))
            if abs(ang-45) > 0.5: errs.append(f'{code} 轉角 {p} 轉咗 {ang:.0f}°（要 45°）')
            # 統一彎位：前後段要夠長（兩頭都係轉角就要 2R）
            for seg, other_is_corner in ((d(a,p), i-1 > 0), (d(p,b), i+1 < len(path)-1)):
                need = 2*R if other_is_corner else R
                if seg < need - 1e-6: errs.append(f'{code} 轉角 {p} 隔離段太短 {seg:.2f} < {need:.2f}')
            for s, sp in l['stations'].items():
                if (onseg(sp,a,p) or onseg(sp,p,b)) and 0 < d(sp,p) < CLR - 1e-6: errs.append(f'{code} {s} 離轉角 {p} 得 {d(sp,p):.2f}')
    for s, sp in l['stations'].items():
        if not any(onseg(sp, path[i-1], path[i]) for path in l['paths'] for i in range(1, len(path))): errs.append(f'{code} {s} 唔喺條綫上 {sp}')
# 每個站嘅點
st = collections.defaultdict(list)
for code, l in L.items():
    for s, p in l['stations'].items(): st[s].append((code, p))
for s, pts in st.items():
    xs = {round(p[0],6) for _,p in pts}; ys = {round(p[1],6) for _,p in pts}
    if len(pts) > 1 and len(xs) > 1 and len(ys) > 1: errs.append(f'轉車站 {s} 唔係直排或者橫排: {pts}')
    if len(pts) > 1 and len({p for _,p in pts}) == 1: errs.append(f'交叉轉車站 {s} 只得一點（要錯開 G 變膠囊）')
# CSV 每個站都有
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/mtr.csv', encoding='utf-8-sig')):
    if r['Line Code'] and r['Station Code'] not in L[r['Line Code']]['stations']: errs.append(f"{r['Line Code']} 冇 {r['Station Code']}")

# 站名位置（同 core mtrLabelPos 一樣）
def box_of(s):
    pts = [p for _,p in st[s]]
    x0 = min(p[0] for p in pts)-PAD; y0 = min(p[1] for p in pts)-PAD
    return (x0, y0, max(p[0] for p in pts)+PAD-x0, max(p[1] for p in pts)+PAD-y0)
def label_rect(s):
    x,y,w,h = box_of(s); side = LABELS.get(s,'s'); g = 0.14 + LABEL_GAP.get(s,0)
    zh, en = names[s]
    W = max(len(zh)*0.3, len(en)*0.098); H = 0.52
    cx, cy = x+w/2, y+h/2
    if side=='n': return (cx-W/2, y-g-H, W, H)
    if side=='s': return (cx-W/2, y+h+g, W, H)
    if side=='e': return (x+w+g, cy-H/2, W, H)
    if side=='w': return (x-g-W, cy-H/2, W, H)
    if side=='ne': return (x+w+g, y-g-H, W, H)
    if side=='nw': return (x-g-W, y-g-H, W, H)
    if side=='se': return (x+w+g, y+h+g, W, H)
    if side=='sw': return (x-g-W, y+h+g, W, H)
def rect_hit(a, b, m=0.0):
    return a[0] < b[0]+b[2]+m and b[0] < a[0]+a[2]+m and a[1] < b[1]+b[3]+m and b[1] < a[1]+a[3]+m
def seg_hits_rect(p, q, r, half=0.12):
    # 取樣
    n = max(2, int(d(p,q)/0.05))
    for i in range(n+1):
        x = p[0]+(q[0]-p[0])*i/n; y = p[1]+(q[1]-p[1])*i/n
        if r[0]-half < x < r[0]+r[2]+half and r[1]-half < y < r[1]+r[3]+half: return True
    return False
rects = {s: label_rect(s) for s in st}
for s, r in rects.items():
    for code, l in L.items():
        for path in l['paths']:
            for i in range(1, len(path)):
                if seg_hits_rect(path[i-1], path[i], r): errs.append(f'站名 {s} 壓住 {code} 綫'); break
            else: continue
            break
    for t, r2 in rects.items():
        if t < s and rect_hit(r, r2): errs.append(f'站名 {s} 撞 {t}')
    for t in st:
        if t != s and rect_hit(r, box_of(t)): errs.append(f'站名 {s} 撞站 {t}')
for e in errs: print('✗', e)
print(f'{len(errs)} 個問題')

if '--ts' in sys.argv:
    def P(p): return f'[{round(p[0],3)}, {round(p[1],3)}]'
    out = []
    for code in ['ISL','TWL','KTL','TKL','TML','EAL','SIL','TCL','AEL','DRL']:
        l = L[code]
        paths = ', '.join('[' + ', '.join(P(p) for p in path) + ']' for path in l['paths'])
        stas = ', '.join(f'{s}: {P(p)}' for s,p in l['stations'].items())
        out.append(f"  {{ line: '{code}', paths: [{paths}], stations: {{ {stas} }} }},")
    print('LINES>>>'); print('\n'.join(out))
    print('LABELS>>>'); print('  ' + ', '.join(f"{s}: '{v}'" for s,v in LABELS.items()) + ',')
    print('GAP>>>'); print(json.dumps(LABEL_GAP))
