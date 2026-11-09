"""港鐵示意圖座標（自己畫）+ 檢查：橫直 45°、轉彎 45° 或 90°（圓弧統一半徑，並排綫同心）、站離彎位、轉車站對齊、站名唔撞。輸出 TS。"""
# 用法：curl -s https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv -o /tmp/mtr.csv
#       python3 packages/core/tools/mtr-layout.py [csv] [--ts | --write]
# 改完座標行一次，0 個問題先 --write（寫入 src/mtr-map.ts 嘅 MTR_MAP_LINES／LABELS／LABEL_GAP），
# 之後一定要行 mtr-water.py --write（海岸綫跟站位置變形）。
# 站位置參考真實地理（OpenStreetMap 站點），但係自己排，唔係照官方路綫圖。
# 轉角點可以寫 (x, y, 半徑)：並排綫一齊轉彎，外面嗰條半徑 + G（同心，轉彎時都貼住）；冇寫就用 R。
import json, math, os, re, sys, csv, collections

G = 0.18      # 並排綫距離 = 綫闊（貼埋）；同 core MTR_MAP_GAP 一樣
R = 0.7       # 統一彎位半徑（同 core MTR_MAP_RADIUS 一樣）
RJ = 0.3      # 扭位（兩條並排綫交換位置）嘅細彎半徑
CLR = 0.15    # 站離彎位起點最少
H = G * math.sqrt(2) / 2   # 斜綫並排：垂直相隔 G 嘅點，x、y 各差 H
# 支綫分岔站：畫雙圈（似轉車站，但冇綫色短棒）。主綫用上面個圈，支綫由呢個點（下面個圈）出發
DOUBLE = {}   # 下面設
# 兩個站之間畫一條細黑綫（同一個站名唔同嘅站：香港 ↔ 中環）
LINKS = [('HOK', 'CEN')]
L = {}
def line(code, paths, stations, dashed=()):
    """dashed：邊幾段 path 用虛綫（例如東鐵綫經馬場）"""
    L[code] = {'paths': paths, 'stations': stations, 'dashed': list(dashed)}

# 座標參考真實地理（OpenStreetMap 站位置，市區放大、新界收細），再拉直做 45°／90°。
# ---------------- 港島綫 ----------------
IY = 22.6   # 港島綫（九龍南面要留位：紅磡東鐵、屯馬並排）
line('ISL', [[(2.5,IY),(30.3,IY),(30.3,IY+3.6)]], dict(
    KET=(2.5,IY), HKU=(4.4,IY), SYP=(6.2,IY), SHW=(8.0,IY), CEN=(10.2,IY), ADM=(12.4,IY), WAC=(14.6,IY), CAB=(16.6,IY),
    TIH=(18.6,IY), FOH=(20.6,IY), NOP=(22.6,IY), QUB=(24.6,IY), TAK=(26.6,IY), SWH=(28.6,IY), SKW=(30.3,IY+1.7), HFC=(30.3,IY+2.65), CHW=(30.3,IY+3.6)))
# ---------------- 荃灣綫：中環、金鐘緊貼港島綫上面；荔景之後向北去荃灣（荔景、葵芳之間穿過屯馬綫） ----------------
TW = IY - G
ML = 9.0 + 2*G   # 屯馬綫南昌、美孚嗰段直綫（機場快綫 9.0、東涌綫 9.0+G、屯馬綫 9.0+2G 並排）
line('TWL', [[(10.2,TW),(13.3,TW),(15,TW-1.7),(15,12.3),(6.9,12.3),(6.9,7.5)]], dict(
    CEN=(10.2,TW), ADM=(12.4,TW), TST=(15,18.5), JOR=(15,17.2), YMT=(15,15.8), MOK=(15,14.8), PRE=(15,13.8),
    SSP=(13.6,12.3), CSW=(12.25,12.3), LCK=(10.9,12.3), MEF=(ML,12.3), LAK=(7.86,12.3), KWF=(6.9,10.2), KWH=(6.9,9.3), TWH=(6.9,8.4), TSW=(6.9,7.5)))
# ---------------- 觀塘綫：油麻地至太子喺荃灣綫右邊貼住 ----------------
KX = 15 + G
line('KTL', [[(21.2,17.2),(KX,17.2),(KX,9.8),(24.85,9.8),(24.85,15.4),(28.5,15.4)]], dict(
    WHA=(21.2,17.2), HOM=(18.5+G,17.2), YMT=(KX,15.8), MOK=(KX,14.8), PRE=(KX,13.8), SKM=(KX,11.7), KOT=(17.5,9.8), LOF=(19.0,9.8),
    WTS=(20.5,9.8), DIH=(22.0,9.8), CHH=(23.4,9.8), KOB=(24.85,11.3), NTK=(24.85,12.2), KWT=(24.85,13.1), LAT=(24.85,14.0), YAT=(27.2,15.4), TIK=(28.5,15.4)))
# ---------------- 將軍澳綫：北角、鰂魚涌貼住港島綫上面；油塘、調景嶺貼住觀塘綫下面；將軍澳分岔（雙圈） ----------------
TK = 15.4 + G
line('TKL', [[(22.6,TW),(25.9,TW),(25.9,TK),(31.0,TK),(31.0,12.4)],
             [(29.6,TK+G),(31.0,TK+G),(31.0,17.6)]], dict(
    NOP=(22.6,TW), QUB=(24.6,TW), YAT=(27.2,TK), TIK=(28.5,TK), TKO=(29.6,TK), HAH=(31.0,13.6), POA=(31.0,12.4), LHP=(31.0,17.6)))
DOUBLE['TKO'] = (29.6, TK+G)   # 康城支綫
# ---------------- 屯馬綫：南昌、美孚直上，喺荃灣綫上面轉西（荔景、葵芳之間穿過荃灣綫）→ 荃灣西 → 錦上路 → 元朗、天水圍 → 屯門；
#                  東面經大圍向東去馬鞍山（喺東鐵綫東南面） ----------------
TX = 18.5 + G   # 紅磡、何文田嗰段直綫（東鐵綫東邊）
line('TML', [[(-0.75,9.4),(-0.75,5.6),(5.0,5.6),(5.0,10.8),(ML,10.8),(ML,15.5),(ML+4.4,19.9),(TX,19.9),(TX,15.9),(22.0,15.9-(22.0-TX)),
              (22.0,8.2),(17.5+G,8.2),(17.5+G,5.5),(23.4,5.5),(25.4,3.5),(27.6,3.5)]], dict(
    TUM=(-0.75,9.4), SIH=(-0.75,7.6), TIS=(0.25,5.6), LOP=(1.4,5.6), YUL=(2.55,5.6), KSR=(3.7,5.6), TWW=(6.1,10.8),
    MEF=(ML,12.3+G), NAC=(ML,14.9), AUS=(ML+1.92,17.42), ETS=(16.2,19.9), HUH=(TX,18.66), HOM=(TX,17.2-G), TKW=(20.3,TX+15.9-20.3), SUW=(22,12.0),
    KAT=(22,11.3), DIH=(22,9.8+G), HIK=(20.0,8.2), TAW=(17.5+G,6.8), CKT=(19.2,5.5), STW=(20.4,5.5), CIO=(21.6,5.5), SHM=(22.8,5.5),
    TSH=(24.1,4.8), HEO=(24.8,4.1), MOS=(26.2,3.5), WKS=(27.6,3.5)))
# ---------------- 東鐵綫：金鐘喺港島綫下面，過咗金鐘先斜上；紅磡同屯馬綫並排；大圍之後向東北去大學，再向西北去上水（分岔，雙圈）、羅湖 ----------------
EA = IY + G
# 馬場虛綫：喺沙田、火炭之間同火炭、大學之間由東鐵綫垂直分出去，東南面平行經馬場（火炭隔籬），似括號
RK = 0.5                      # 離東鐵綫幾遠
RO = RK / math.sqrt(2)        # x、y 各移幾多
RA, RB = (18.55, 4.15), (19.25, 3.45)   # 分出、駁返嘅位（站同站正中）
line('EAL', [[(12.4,EA),(13.5,EA),(14.38,IY-0.7),(16.8,IY-0.7),(18.5,20.2),(18.5,17.7),(17.5,16.7),(17.5,5.2),(20.65,2.05),(18.0,-0.6),(15.0,-0.6),(14.3,-1.3)],
             [(15.8,-0.6+G),(12.8,-0.6+G)],
             [RA, (RA[0]+RO,RA[1]+RO,0.3), (RB[0]+RO,RB[1]+RO,0.3), RB]], dict(
    ADM=(12.4,EA), EXC=(15.8,IY-0.7), HUH=(18.5,18.66), MKK=(17.5,13.0), KOT=(17.5,9.8+G), TAW=(17.5,6.8), SHT=(18.2,4.5), FOT=(18.9,3.8),
    UNI=(19.6,3.1), TAP=(19.5,0.9), TWO=(18.6,0.0), FAN=(17.2,-0.6), SHS=(15.8,-0.6), LOW=(14.3,-1.3), LMC=(12.8,-0.6+G),
    RAC=(18.9+RO,3.8+RO)), dashed=[2])
DOUBLE['SHS'] = (15.8, -0.6+G)   # 落馬洲支綫
# ---------------- 南港島綫：金鐘最低一條 ----------------
SI = IY + 2*G
line('SIL', [[(12.4,SI),(13.8,SI),(13.8,IY+3.3),(9.0,IY+3.3)]], dict(
    ADM=(12.4,SI), OCP=(13.8,IY+1.9), WCH=(12.4,IY+3.3), LET=(10.7,IY+3.3), SOH=(9.0,IY+3.3)))
# ---------------- 東涌綫、機場快綫：香港站至南昌直上，一齊 90° 轉西（同心，貼住）、貼住荃灣綫底經荔景；
#   再一齊轉西南，青衣喺斜綫上（東涌綫西北、機場快綫東南，轉車站打斜）；之後扭一扭交換位置，
#   機場快綫喺西北貼住一齊經欣澳，過咗小蠔灣先分開向西去機場（機場喺東涌北面） ----------------
TC = 9.0 + G   # 東涌綫（外邊）
YT, YA = 12.3 + G, 12.3 + 2*G   # 荔景嗰段：東涌綫、機場快綫（荃灣綫 12.3 下面）
CA = 6.6 + YA                   # 西南斜綫（x + y = 常數）：機場快綫（東南邊）
CT = CA - G*math.sqrt(2)        # 東涌綫（西北邊）
J = 4.85                        # 扭位
HY = TW - 0.7 - G   # 香港站東涌綫（機場快綫喺下面 G）：中環正上方
line('TCL', [[(10.2,HY),(TC,HY),(TC,YT,R+G),(CT-YT,YT,R+G),(J,CT-J,RJ),(J,CA-J,RJ),(0.8,CA-0.8)]], dict(
    HOK=(10.2,HY), KOW=(TC,17.9), OLY=(TC,16.3), NAC=(TC,14.9), LAK=(7.86,YT), TSY=(5.6,CT-5.6), SUN=(3.3,CA-3.3), TUC=(0.8,CA-0.8)))
line('AEL', [[(10.2,HY+G),(9.0,HY+G,R+G),(9.0,YA),(CA-YA,YA),(J+H,CA-J-H,RJ),(J-H,CA-J-H,RJ),(CT-17.0,17.0),(-0.5,17.0)]], dict(
    HOK=(10.2,HY+G), KOW=(9.0,17.9), TSY=(5.6+H,CT-5.6+H), AIR=(1.0,17.0), AWE=(-0.5,17.0)))
# ---------------- 迪士尼綫：由欣澳（東涌綫東南邊）先貼住東涌綫向東北，再屈落迪士尼（135° 彎，半徑細啲） ----------------
CD = CA + G*math.sqrt(2)   # 迪士尼綫貼住東涌綫嘅斜綫
line('DRL', [[(3.3+H,CA-3.3+H),(4.6,CD-4.6,0.5),(4.6,17.6)]], dict(SUN=(3.3+H,CA-3.3+H), DIS=(4.6,17.6)))

LABELS = dict(
  CEN='s', ADM='sw', SKW='e', HFC='e', CHW='e',
  TST='w', JOR='w', YMT='w', MOK='w', PRE='w', SSP='s', CSW='n', LCK='s', MEF='ne', LAK='n', KWF='e', KWH='e', TWH='e', TSW='n',
  WHA='e', HOM='ne', SKM='e', KOT='nw', LOF='n', WTS='n', DIH='se', CHH='n', KOB='e', NTK='e', KWT='e', LAT='e', YAT='n', TIK='n',
  NOP='s', QUB='s', TKO='s', HAH='e', POA='e', LHP='e',
  TUM='s', SIH='w', TIS='n', LOP='s', YUL='s', KSR='n', TWW='sw', NAC='e', AUS='ne', ETS='n', HUH='se', TKW='se', SUW='e', KAT='e',
  HIK='n', TAW='w', CKT='s', STW='n', CIO='s', SHM='n', TSH='se', HEO='se', MOS='n', WKS='n',
  EXC='n', MKK='e', SHT='nw', FOT='nw', UNI='nw', TAP='ne', TWO='ne', FAN='s', SHS='s', LOW='n', LMC='w',
  OCP='e', WCH='s', LET='s', SOH='s',
  HOK='e', KOW='w', OLY='w', TSY='se', SUN='s', RAC='e', TUC='w', AIR='n', AWE='n', DIS='s',
)
# 站名同站粒之間額外留位（例如奧運：左邊仲有機場快綫）
LABEL_GAP = dict(OLY=0.42, SUN=0.3, RAC=0.3)

# ======================= 檢查 =======================
DOT_R = 0.17   # 站圈外半徑（同 core MTR_MAP_DOT_R 一樣）：圈心喺綫正中，轉車站幾個圈重疊成「8」字
names = {}
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/mtr.csv', encoding='utf-8-sig')):
    if r['Station Code']: names[r['Station Code']] = (r['Chinese Name'], r['English Name'])
names['RAC'] = ('馬場', 'Racecourse')   # CSV 冇（賽馬日先停）
errs = []
d = lambda a,b: math.hypot(a[0]-b[0], a[1]-b[1])
def onseg(p,a,b): return abs(d(a,p)+d(p,b)-d(a,b)) < 0.01
def turn(path, i):
    """第 i 點嘅轉角：(角度, 彎位由轉角起計幾長)"""
    a, p, b = path[i-1], path[i], path[i+1]
    v1 = (p[0]-a[0], p[1]-a[1]); v2 = (b[0]-p[0], b[1]-p[1])
    ang = math.degrees(math.acos(max(-1,min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(math.hypot(*v1)*math.hypot(*v2))))))
    r = p[2] if len(p) > 2 else R
    return ang, r*math.tan(math.radians(ang)/2)
for code, l in L.items():
    for path in l['paths']:
        for i in range(1, len(path)):
            dx, dy = abs(path[i][0]-path[i-1][0]), abs(path[i][1]-path[i-1][1])
            if not (dx < 1e-9 or dy < 1e-9 or abs(dx-dy) < 1e-6): errs.append(f'{code} 段 {i} 唔係橫直或 45°: {path[i-1]}→{path[i]}')
        tl = [0.0] + [turn(path, i)[1] for i in range(1, len(path)-1)] + [0.0]
        for i in range(1, len(path)-1):
            ang, t = turn(path, i)
            if min(abs(ang-45), abs(ang-90), abs(ang-135)) > 0.5: errs.append(f'{code} 轉角 {path[i][:2]} 轉咗 {ang:.0f}°（要 45°、90° 或者 135°）')
        for i in range(1, len(path)):
            seg = d(path[i-1], path[i])
            if seg < tl[i-1] + tl[i] - 1e-6: errs.append(f'{code} {path[i-1][:2]}→{path[i][:2]} 太短放唔落彎位 {seg:.2f} < {tl[i-1]+tl[i]:.2f}')
        for i in range(1, len(path)-1):
            a, p, b = path[i-1], path[i], path[i+1]
            for s, sp in l['stations'].items():
                if (onseg(sp,a,p) or onseg(sp,p,b)) and 0 < d(sp,p) < tl[i] + CLR - 1e-6: errs.append(f'{code} {s} 離轉角 {p[:2]} 得 {d(sp,p):.2f}（要 {tl[i]+CLR:.2f}）')
    for s, sp in l['stations'].items():
        if not any(onseg(sp, path[i-1], path[i]) for path in l['paths'] for i in range(1, len(path))): errs.append(f'{code} {s} 唔喺條綫上 {sp}')
# 每個站嘅點（DOUBLE：喺條綫兩邊各半個 G，畫雙圈）
st = collections.defaultdict(list)
for code, l in L.items():
    for s, p in l['stations'].items():
        st[s].append((code, p))
        if s in DOUBLE: st[s].append((code, DOUBLE[s]))
for s, pts in st.items():
    if len(pts) > 1:
        # 轉車站：所有點喺同一條橫、直或者 45° 綫上（可以打斜）
        a0 = pts[0][1]; far = max((p for _,p in pts), key=lambda p: d(a0, p))
        dx, dy = far[0]-a0[0], far[1]-a0[1]
        if not (abs(dx) < 1e-6 or abs(dy) < 1e-6 or abs(abs(dx)-abs(dy)) < 1e-6): errs.append(f'轉車站 {s} 唔係橫、直或者 45°: {pts}')
        for _,p in pts:
            if abs((p[0]-a0[0])*dy - (p[1]-a0[1])*dx) > 1e-6: errs.append(f'轉車站 {s} 嘅點唔喺同一條綫: {pts}')
    if len(pts) > 1 and len({p for _,p in pts}) == 1: errs.append(f'交叉轉車站 {s} 只得一點（要錯開 G，兩個圈貼住）')
# CSV 每個站都有
for r in csv.DictReader(open(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/mtr.csv', encoding='utf-8-sig')):
    if r['Line Code'] and r['Station Code'] not in L[r['Line Code']]['stations']: errs.append(f"{r['Line Code']} 冇 {r['Station Code']}")

# 站名位置（同 core mtrLabelPos 一樣）
def box_of(s):
    pts = [p for _,p in st[s]]
    x0 = min(p[0] for p in pts)-DOT_R; y0 = min(p[1] for p in pts)-DOT_R
    return (x0, y0, max(p[0] for p in pts)+DOT_R-x0, max(p[1] for p in pts)+DOT_R-y0)
def label_rect(s):
    x,y,w,h = box_of(s); side = LABELS.get(s,'s'); g = 0.14 + LABEL_GAP.get(s,0)
    zh, en = names[s]
    W = max(len(zh)*0.3, len(en)*0.106); H = 0.52
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
def seg_hits_rect(p, q, r, half=G/2+0.03):
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

if '--ts' in sys.argv or '--write' in sys.argv:
    def P(p): return f'[{round(p[0],4)}, {round(p[1],4)}' + (f', {round(p[2],4)}]' if len(p) > 2 else ']')
    out = []
    for code in ['ISL','TWL','KTL','TKL','TML','EAL','SIL','TCL','AEL','DRL']:
        l = L[code]
        paths = ', '.join('[' + ', '.join(P(p) for p in path) + ']' for path in l['paths'])
        stas = ', '.join(f'{s}: {P(p)}' for s,p in l['stations'].items())
        dash = f", dashed: {l['dashed']}" if l['dashed'] else ''
        out.append(f"  {{ line: '{code}', paths: [{paths}], stations: {{ {stas} }}{dash} }},")
    lines_ts = '\n'.join(out)
    labels_ts = '  ' + ', '.join(f"{s}: '{v}'" for s,v in LABELS.items()) + ','
    gap_ts = '{ ' + ', '.join(f'{k}: {v}' for k, v in LABEL_GAP.items()) + ' }'
    if '--write' in sys.argv:
        if errs: sys.exit('有問題，唔寫')
        tp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src/mtr-map.ts')
        t = open(tp).read()
        t = re.sub(r'(export const MTR_MAP_LINES: readonly MtrMapLine\[\] = \[\n).*?(\n\];)', lambda m: m.group(1) + lines_ts + m.group(2), t, count=1, flags=re.S)
        t = re.sub(r'(export const MTR_MAP_LABELS: Readonly<Record<string, LabelSide>> = \{\n).*?(\n\};)', lambda m: m.group(1) + labels_ts + m.group(2), t, count=1, flags=re.S)
        t = re.sub(r'(export const MTR_MAP_LABEL_GAP: Readonly<Record<string, number>> = )\{.*?\};', lambda m: m.group(1) + gap_ts + ';', t, count=1)
        dbl_ts = '{ ' + ', '.join(f'{k}: {P(v)}' for k, v in DOUBLE.items()) + ' }'
        t = re.sub(r'(export const MTR_MAP_DOUBLE: Readonly<Record<string, Pt>> = )\{.*?\};', lambda m: m.group(1) + dbl_ts + ';', t, count=1)
        links_ts = '[' + ', '.join(f"['{a}', '{b}']" for a, b in LINKS) + ']'
        t = re.sub(r'(export const MTR_MAP_LINKS: readonly \(readonly \[string, string\]\)\[\] = )\[.*?\];', lambda m: m.group(1) + links_ts + ';', t, count=1)
        open(tp, 'w').write(t)
        print('已寫入 src/mtr-map.ts；記得再行 mtr-water.py --write')
    else:
        print('LINES>>>'); print(lines_ts)
        print('LABELS>>>'); print(labels_ts)
        print('GAP>>>'); print(gap_ts)
