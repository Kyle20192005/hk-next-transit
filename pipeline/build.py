"""步驟 2：由 cache/ 生成前端用嘅數據到 out/
以城巴為主：站 ID、站名、座標用城巴 API；政府數據補充走法、時間表、走線。

輸出
  out/calendar.json        GTFS 服務日曆（邊個 serviceId 喺邊日行）
  out/ctb/index.json       城巴路線列表
  out/ctb/<路線>.json      每條路線：站點、走法、時間表、走線、ETA seq 對照、站到站行車時間
  out/report/ctb_stop_map.csv  站點配對結果（A/B/C/X 分級，用嚟人手覆核）
用法: python3 pipeline/build.py
"""
import csv, collections, datetime as dt, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE, OUT = os.path.join(HERE, 'cache'), os.path.join(HERE, 'out')
G = os.path.join(CACHE, 'gtfs')
OVERRIDES = json.load(open(os.path.join(HERE, 'overrides.json'), encoding='utf-8'))


# ---------- 工具 ----------
def dist(a, b):
    """兩點距離（米），a/b = (lat, lng)"""
    dy = (a[0] - b[0]) * 111320
    dx = (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


ALIASES = (('傍', '旁'), ('滙', '匯'), ('邨', '村'), ('恆', '恒'), ('巖', '岩'), ('峯', '峰'), ('裏', '裡'))


def norm(s):
    s = re.sub(r'[\s()（）\-,，]', '', s).casefold()
    for a, b in ALIASES:
        s = s.replace(a, b)
    return s


def gtfs_names(raw):
    """'[CTB] A|[KMB+CTB] B/<BR>C' -> {A, B, C}（正規化後）"""
    out = set()
    for part in raw.split('|'):
        part = re.sub(r'^\[[^\]]*\]\s*', '', part)
        for p in part.split('<BR>'):
            p = p.strip(' /')
            if p:
                out.add(norm(p))
    return out


def same_name(gnames, cname):
    c, c1 = norm(cname), norm(cname.split(',')[0])
    return any(g == c or g == c1 for g in gnames)


def simplify(pts, tol=0.00001):
    """Douglas-Peucker，tol 約 1 米；座標保留 5 位小數（約 1 米）。
    唔好再調大：3 米會將迴旋處變成六角形、彎位變直角。"""
    if len(pts) < 3:
        return [[round(x, 5), round(y, 5)] for x, y in pts]
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-12
    far, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L
        if d > far:
            far, idx = d, i
    if far <= tol:
        return [[round(x1, 5), round(y1, 5)], [round(x2, 5), round(y2, 5)]]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def line_len(seg):
    return sum(dist((a[1], a[0]), (b[1], b[0])) for a, b in zip(seg, seg[1:]))


def hhmm_to_min(t):
    h, m = t.replace(':', '')[:2], t.replace(':', '')[2:4]
    return int(h) * 60 + int(m)


# ---------- 讀政府 GTFS ----------
def load_gtfs(agency=lambda a: 'CTB' in a):
    """政府 GTFS；agency 揀邊啲公司嘅路線（預設：有城巴份，即係城巴同聯營）"""
    routes = {r['route_id']: r for r in csv.DictReader(open(f'{G}/routes.txt', encoding='utf-8-sig'))
              if agency(r['agency_id'])}
    trips = collections.defaultdict(list)   # (route_id, dir) -> trips
    for t in csv.DictReader(open(f'{G}/trips.txt', encoding='utf-8-sig')):
        if t['route_id'] in routes:
            rid, d = t['trip_id'].split('-')[:2]
            trips[(rid, d)].append(t)
    first = {k: v[0]['trip_id'] for k, v in trips.items()}
    want = set(first.values())
    stop_times = collections.defaultdict(list)
    for r in csv.DictReader(open(f'{G}/stop_times.txt', encoding='utf-8-sig')):
        if r['trip_id'] in want:
            stop_times[r['trip_id']].append(r)
    freq = collections.defaultdict(list)
    for r in csv.DictReader(open(f'{G}/frequencies.txt', encoding='utf-8-sig')):
        freq[r['trip_id']].append(r)
    stops = {r['stop_id']: r for r in csv.DictReader(open(f'{G}/stops.txt', encoding='utf-8-sig'))}
    return routes, trips, first, stop_times, freq, stops


def load_calendar(used):
    cal = {}
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for r in csv.DictReader(open(f'{G}/calendar.txt', encoding='utf-8-sig')):
        if r['service_id'] in used:
            cal[r['service_id']] = {'days': [r[d] == '1' for d in days], 'start': r['start_date'],
                                    'end': r['end_date'], 'add': [], 'remove': []}
    for r in csv.DictReader(open(f'{G}/calendar_dates.txt', encoding='utf-8-sig')):
        if r['service_id'] in cal:
            cal[r['service_id']]['add' if r['exception_type'] == '1' else 'remove'].append(r['date'])
    return cal


def departures(trip, freq):
    """一個 GTFS trip -> 開車時間（由午夜起計分鐘，可 >1440）"""
    fs = freq.get(trip['trip_id'])
    if not fs:
        return [hhmm_to_min(trip['trip_id'].split('-')[3])]
    out = set()
    for f in fs:
        x, end, step = hhmm_to_min(f['start_time']), hhmm_to_min(f['end_time']), int(f['headway_secs']) // 60
        while x <= end:   # 包埋最後一班
            out.add(x)
            x += max(step, 1)
    return sorted(out)


def gov_stops(rows, gstops_all):
    """政府走法嘅站（按站序），帶站名（所有寫法）同座標，用嚟同營辦商嘅站配對"""
    return [{'id': r['stop_id'], 'seq': int(r['stop_sequence']),
             'name': re.sub(r'^\[[^\]]*\]\s*', '', gstops_all[r['stop_id']]['stop_name'].split('|')[0]),
             'names': gtfs_names(gstops_all[r['stop_id']]['stop_name']),
             'pos': (float(gstops_all[r['stop_id']]['stop_lat']), float(gstops_all[r['stop_id']]['stop_lon']))}
            for r in rows]


def match_score(m):
    return sum({'A': 4, 'B': 3, 'C': 1}[v[1]] for v in m.values())


def variant_schedule(trips, freq):
    """走法嘅時間表：{serviceId: 開車時間}"""
    sched = collections.defaultdict(set)
    for t in trips:
        sched[t['service_id']].update(departures(t, freq))
    return sched


def load_fares():
    """
    GTFS 分段收費：{(route_id, 方向): {上車站序: 車費}}。
    fare_id = <route_id>-<方向>-<上車站序>-<落車站序>；上車嘅車費 = 由呢個站去任何站嘅最高收費
    （香港巴士上車時按全程收費，分段收費即係後面上車平啲）。
    """
    out = collections.defaultdict(dict)
    for r in csv.DictReader(open(f'{G}/fare_attributes.txt', encoding='utf-8-sig')):
        parts = r['fare_id'].split('-')
        if len(parts) != 4:
            continue
        rid, d, o, _ = parts
        price = float(r['price'])
        cur = out[(rid, d)].get(int(o))
        if cur is None or price > cur:
            out[(rid, d)][int(o)] = price
    return out


def joyyou_ok(rno, orig='', dest=''):
    """
    樂悠咭（$2 計劃）適唔適用。運輸署（2026-04-03 起）：專營巴士不適用於
    往返機場嘅 A、NA 線、馬場線、新增長途路線、指定旅遊路線同預約／包車路線。
    政府數據冇呢個標記，所以按路線號碼同名稱判斷（「新增長途路線」冇清單，判斷唔到）。
    """
    r = rno.upper()
    if r.startswith('A') or r.startswith('NA'):
        return False                                   # 機場
    if re.fullmatch(r'\d+[A-Z]?R', r) or '馬場' in (orig or '') + (dest or ''):
        return False                                   # 馬場線（101R、1R…）
    if re.fullmatch(r'H\d+[A-Z]?', r):
        return False                                   # 城巴旅遊路線（H1、H2、H2K…）
    if any(k in (orig or '') + (dest or '') for k in ('包車', '夜遊', '預約')):
        return False                                   # 預約／包車
    return True


# ---------- 讀城巴 ----------
def load_ctb():
    c = json.load(open(f'{CACHE}/ctb.json', encoding='utf-8'))
    stops = {s['stop']: {'nameTc': s['name_tc'], 'nameEn': s['name_en'],
                         'lat': round(float(s['lat']), 6), 'lng': round(float(s['long']), 6)} for s in c['stop']}
    lists = collections.defaultdict(list)
    for r in sorted(c['route_stop'], key=lambda r: int(r['seq'])):
        if r['stop'] in stops:
            lists[(r['route'], r['dir'])].append(r['stop'])
    return c['route'], stops, lists


# ---------- 站點配對 ----------
def weight(g, cstop):
    """A 同名 <=60m；B 同名 60-500m（政府座標偏差，信城巴）；C 唔同名但 <=60m（要覆核）"""
    d = dist(g['pos'], (cstop['lat'], cstop['lng']))
    n = same_name(g['names'], cstop['nameTc'])
    if n and d <= 60: return 4, 'A', d
    if n and d <= 500: return 3, 'B', d
    if d <= 60: return 1, 'C', d
    return 0, None, d


def align(gstops, cands, cstops):
    """加權 LCS：政府走法 = 城巴列表嘅子序列。回傳 {政府 index: (城巴 index, 級別, 距離)}"""
    n, m = len(gstops), len(cands)
    W = [[weight(g, cstops[c]) for c in cands] for g in gstops]
    S = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            S[i][j] = max(S[i + 1][j], S[i][j + 1], W[i][j][0] + S[i + 1][j + 1] if W[i][j][0] else 0)
    out, i, j = {}, 0, 0
    while i < n and j < m:
        if W[i][j][0] and S[i][j] == W[i][j][0] + S[i + 1][j + 1]:
            out[i] = (j, W[i][j][1], W[i][j][2]); i += 1; j += 1
        elif S[i + 1][j] >= S[i][j + 1]:
            i += 1
        else:
            j += 1
    return out


def variant_stop_order(v):
    """走法實際停嘅城巴站（同 @hknt/core 嘅 variantStops 一樣）：按方向先後、再按 expSeq"""
    order = []
    for d in v['stopDirs']:
        if d and d not in order:
            order.append(d)
    items = sorted(((k[0], k[2:], n) for k, n in v['expSeq'].items()), key=lambda x: (order.index(x[0]), x[2]))
    return [sid for _, sid, _ in items]


def segment_times(v, cstops, journey):
    """
    每段站到站行車時間（秒），對應 variant_stop_order 相鄰兩個站。
    有實測數據（hk-bus-time-between-stops）就用；冇就用距離除以呢個走法實測段嘅平均車速。
    回傳 (秒數列表, 係咪實測列表)
    """
    stops = variant_stop_order(v)
    pos = lambda sid: (cstops[sid]['lat'], cstops[sid]['lng'])
    pairs = list(zip(stops, stops[1:]))
    dists = [dist(pos(a), pos(b)) for a, b in pairs]
    # 實測異常（例如 682B 189 米要 43 分鐘，應該係混咗總站等車時間）：超過 10 分鐘而平均車速低過 1.5 米/秒就唔用
    measured = [t if not (t and t > 600 and d / t < 1.5) else None
                for t, d in zip((journey.get(a, {}).get(b) for a, b in pairs), dists)]
    ok = [(t, d) for t, d in zip(measured, dists) if t and t > 0]
    speed = (sum(d for _, d in ok) / sum(t for t, _ in ok)) if ok and sum(t for t, _ in ok) > 0 else 5.0  # 米/秒，約 18 km/h
    # 最少 5 秒：兩個站座標一樣（距離 0）會計出 0 秒，前端推算位置要除以佢
    secs = [max(5, round(t) if t and t > 0 else round(d / speed)) for t, d in zip(measured, dists)]
    return secs, [bool(t and t > 0) for t in measured]


def fill_lines_from_csdi(lines_by_no):
    """
    走法冇走線（配唔到政府走法，或者政府走法冇 CSDI 走線，例如 GTFS 未有嘅新路線）：
    喺 CSDI 搵同號碼、同公司嘅走線，站按次序投影落去切段（others.fit_line，站要喺 100 米內）。
    """
    import others as O
    paths = {k: [O.OsmPath([p for i, sg in enumerate(segs) for p in (sg if i == 0 else sg[1:])]) for segs in v if segs]
             for k, v in lines_by_no.items()}
    done = total = 0
    for group in ('ctb', 'kmb', 'nlb'):
        for fn in sorted(os.listdir(f'{OUT}/{group}')):
            if fn in ('index.json', 'stops.json'):
                continue
            path = f'{OUT}/{group}/{fn}'
            d = json.load(open(path, encoding='utf-8'))
            cands = paths.get((group, fn[:-5]), [])
            changed = False
            for v in d['variants']:
                if v['line']:
                    continue
                total += 1
                order = variant_stop_order(v)
                if not cands or len(order) < 2:
                    continue
                seg = O.fit_line([(d['stops'][x]['lat'], d['stops'][x]['lng']) for x in order], cands)
                if seg:
                    v['line'], v['lineAligned'], changed = seg, len(seg) == len(v['stops']) - 1, True
                    done += 1
            if changed:
                json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'冇政府走線嘅走法 {total}，用 CSDI 同號碼走線補到 {done}')


def main():
    groutes, gtrips, first, gst, freq, gstops_all = load_gtfs()
    ctb_routes, cstops, clists = load_ctb()
    special = {}
    for f in json.load(open(f'{CACHE}/td_bus.json', encoding='utf-8-sig'))['features']:
        p = f['properties']
        special[str(p['routeId'])] = p['specialType'] == 1
    # 站到站行車時間（第三方，可能冇）：{ 起點站: { 下一站: 秒 } }
    jt_path = f'{CACHE}/journey_times.json'
    journey = json.load(open(jt_path, encoding='utf-8')) if os.path.exists(jt_path) else {}
    fares = load_fares()
    full_fare = {}
    for f in json.load(open(f'{CACHE}/td_bus.json', encoding='utf-8-sig'))['features']:
        full_fare.setdefault(str(f['properties']['routeId']), f['properties'].get('fullFare'))
    import kmb as K   # 九巴（連龍運）；放喺呢度 import，避免循環 import
    kmbdata = K.load_kmb()
    # 聯營路線（政府 agency 同時有城巴同九巴／龍運）：放喺城巴路線檔，九巴唔再另外出
    joint_rnos = {r['route_short_name'] for r in csv.DictReader(open(f'{G}/routes.txt', encoding='utf-8-sig'))
                  if 'CTB' in r['agency_id'] and ('KMB' in r['agency_id'] or 'LWB' in r['agency_id'])}
    joint_rnos |= K.joint_by_ends(ctb_routes, kmbdata)
    actual_joint = set()   # 真係配對到九巴嘅聯營線（九巴唔再另外出）
    csdi = json.load(open(f'{CACHE}/csdi_lines.json', encoding='utf-8'))['features']
    lines = {(str(f['properties']['ROUTE_ID']), str(f['properties']['ROUTE_SEQ'])): f['geometry']['coordinates'] for f in csdi}
    # (路線檔位置, 路線號碼) -> CSDI 走線：走法配唔到政府走線時用（GTFS 未有嘅新路線，例如 770，CSDI 可能已經有）
    lines_by_no = collections.defaultdict(list)
    for f in csdi:
        cc, rno_ = str(f['properties'].get('COMPANY_CODE', '')), str(f['properties']['ROUTE_NAMEE']).strip()
        for group, codes in (('ctb', ('CTB',)), ('kmb', ('KMB', 'LWB')), ('nlb', ('NLB',))):
            if any(c in cc for c in codes):
                lines_by_no[(group, rno_)].append(f['geometry']['coordinates'])
    del csdi

    # 每條城巴路線嘅候選列表：O、I，循環線多一個 O+I
    cand_lists = {}
    for (rno, d), l in clists.items():
        cand_lists[(rno, d)] = [(d, s) for s in l]
    # 循環線：城巴 O 列表尾同 I 列表頭可以重疊（例如 78 嘅華貴邨至田灣商場兩邊都有）。
    # 城巴到站時間將重疊段當 I，站序就接住呢班車 O 段繼續數（78：華貴邨 I seq 11；95C 由利南道開：
    # O 18 個站，置富徑 I seq 19），所以駁埋時重疊段用 I 嗰份；走法嘅 I 站預期 seq 接住 O 數（見下面 expSeq）。
    # I 列表頭可以多咗一兩個其他走法嘅起點站先到重疊段（95C：I 頭係洛陽街，之後先係置富徑…），
    # 呢啲站唔入 O+I（佢哋喺 O 段前面已經出過），而且重疊最少 2 個站先算，免得撞啱同一個站
    loop_overlap = {}
    for rno in {k[0] for k in clists}:
        if (rno, 'O') in clists and (rno, 'I') in clists:
            o, i_ = clists[(rno, 'O')], clists[(rno, 'I')]
            k, j = max(((k, -j) for j in range(3) for k in range(1 if j == 0 else 2, min(len(o), len(i_) - j))
                        if o[-k:] == i_[j:j + k]), default=(0, 0))
            j = -j
            loop_overlap[rno] = k
            cand_lists[(rno, 'O+I')] = cand_lists[(rno, 'O')][:len(o) - k] + cand_lists[(rno, 'I')][j if k else 0:]

    report, unmatched_routes = [], []
    variants_by_route = collections.defaultdict(list)
    used_services = set()
    for (rid, d), tid in sorted(first.items()):
        rno = groutes[rid]['route_short_name']
        rows = sorted(gst[tid], key=lambda r: int(r['stop_sequence']))
        gs = gov_stops(rows, gstops_all)
        keys = [k for k in cand_lists if k[0] == rno]
        if not keys:
            unmatched_routes.append((rid, d, rno, '城巴 API 冇此路線')); continue
        best = max(((k, align(gs, [s for _, s in cand_lists[k]], cstops)) for k in keys),
                   key=lambda x: match_score(x[1]))
        key, m = best
        if len(m) / len(gs) < 0.5:
            unmatched_routes.append((rid, d, rno, f'覆蓋只得 {len(m) / len(gs):.0%}')); continue
        cl = cand_lists[key]
        stops, match = [], []
        for i, g in enumerate(gs):
            ov = OVERRIDES['stop'].get(f'{rid}-{d}:{g["seq"]}')
            if ov is not None:   # 人手修正優先
                stops.append(ov or None); match.append('M')
            elif i in m:
                stops.append(cl[m[i][0]]); match.append(m[i][1])
            else:
                stops.append(None); match.append('X')
            s = stops[-1]
            report.append([rid, d, rno, g['seq'], g['id'], g['name'], s[0] if s else '', s[1] if s else '',
                           cstops[s[1]]['nameTc'] if s else '', match[-1],
                           round(dist(g['pos'], (cstops[s[1]]['lat'], cstops[s[1]]['lng']))) if s else ''])

        # 走線：每段 = 第 i 站 -> 第 i+1 站
        seg = lines.get((rid, d))
        seg_ok = bool(seg) and len(seg) == len(gs) - 1
        # 行車時間：總站開出 -> 每個站（秒），按走線長度（冇就用直線距離）比例分配
        run = (hhmm_to_min(rows[-1]['arrival_time']) - hhmm_to_min(rows[0]['departure_time'])) * 60
        lens = [line_len(s) for s in seg] if seg_ok else [dist(a['pos'], b['pos']) for a, b in zip(gs, gs[1:])]
        cum = [0.0]
        for x in lens: cum.append(cum[-1] + x)
        offsets = [round(run * c / (cum[-1] or 1)) for c in cum]

        sched = collections.defaultdict(set)
        for t in gtrips[(rid, d)]:
            sched[t['service_id']].update(departures(t, freq))
        used_services.update(sched)

        variants_by_route[rno].append({
            'id': f'{rid}-{d}', 'govRouteId': rid, 'govDir': d, 'name': groutes[rid]['route_long_name'],
            'special': special.get(rid, False),
            'stops': [s[1] if s else None for s in stops],
            'stopDirs': [s[0] if s else None for s in stops],   # 每個站屬城巴 O 定 I（循環線會兩樣都有）
            'stopMatch': match,
            'offsets': offsets,
            'schedules': [{'serviceId': k, 'departures': sorted(v)} for k, v in sorted(sched.items())],
            'line': [simplify(s) for s in seg] if seg else None,
            'lineAligned': seg_ok,
            '_gs': gs, '_agency': groutes[rid]['agency_id'],   # 暫存：聯營配對九巴用，輸出前刪走
            # 每個站上車嘅車費（城巴站 ID -> 港元）；分段收費冇資料就用全程車費
            'fares': {s[1]: fares.get((rid, d), {}).get(g['seq'], full_fare.get(rid))
                      for s, g in zip(stops, gs) if s and (fares.get((rid, d), {}).get(g['seq']) or full_fare.get(rid))},
        })

    # 城巴獨有站 + 每個走法預期嘅 ETA seq
    os.makedirs(f'{OUT}/ctb', exist_ok=True)
    index = []
    rinfo = {r['route']: r for r in ctb_routes}
    for rno, vs in sorted(variants_by_route.items()):
        dirs = {d: clists[(rno, d)] for d in ('O', 'I') if (rno, d) in clists}
        used = {(d, s) for v in vs for d, s in zip(v['stopDirs'], v['stops']) if s}
        orphan = {(d, s) for d, l in dirs.items() for s in l if (d, s) not in used}
        for v in vs:
            v['expSeq'] = {}
            for d, l in dirs.items():
                # 城巴 ETA 嘅 seq = 呢班車實際走法入面嘅站序；城巴獨有站都計
                pos = {}
                for k, (sd, s) in enumerate(zip(v['stopDirs'], v['stops'])):
                    if sd == d and s in l:
                        pos.setdefault(s, l.index(s))
                if not pos: continue
                lo, hi, n = min(pos.values()), max(pos.values()), 0
                # 有重疊嘅循環線：O 段一路行到重疊段先轉 I，中間城巴獨有站都要計（50M：屯門站-C1出口）
                if d == 'O' and 'I' in v['stopDirs'] and loop_overlap.get(rno) and 'I' in dirs:
                    hi = max(hi, len(l) - loop_overlap[rno] - 1)
                # 有重疊嘅循環線：I 段嘅 seq 接住呢個走法 O 段數落去（O 喺 dirs 先處理）
                if d == 'I' and 'O' in v['stopDirs'] and loop_overlap.get(rno) and 'O' in dirs:
                    n = max((x for key, x in v['expSeq'].items() if key.startswith('O:')), default=0)
                mine = set(pos)
                for s in l[lo:hi + 1]:
                    if s in mine or (d, s) in orphan:
                        n += 1
                        v['expSeq'].setdefault(f'{d}:{s}', n)
            v['segSeconds'], v['segMeasured'] = segment_times(v, cstops, journey)
        rstops = {s for l in dirs.values() for s in l} | {s for v in vs for s in v['stops'] if s}
        info = rinfo.get(rno, {})
        route_stops = {s: dict(cstops[s]) for s in sorted(rstops)}   # 複製：聯營會加 kmb 欄位
        companies = ['CTB']
        if rno in joint_rnos:
            c2k = K.attach_joint(vs, rno, kmbdata)
            if c2k:   # 城巴獨有站（政府冇）都要配九巴站，否則九巴時段冇班次
                c2k.update(K.fill_ctb_only(dirs, rno, c2k, cstops, kmbdata))
            for sid, kid in c2k.items():
                if sid in route_stops:
                    route_stops[sid]['kmb'] = kid
            if any('kmb' in v for v in vs):
                actual_joint.add(rno)
                cos = {K.company_of(v['_agency']) for v in vs if 'KMB' in v['_agency'] or 'LWB' in v['_agency']}
                companies = sorted({'CTB'} | (cos or {'KMB'}))
        for v in vs:
            v.pop('_gs', None); v.pop('_agency', None)
        data = {
            'company': 'CTB', 'companies': companies, 'route': rno,
            'joyYou': joyyou_ok(rno, info.get('orig_tc'), info.get('dest_tc')),
            'origTc': info.get('orig_tc'), 'destTc': info.get('dest_tc'),
            'origEn': info.get('orig_en'), 'destEn': info.get('dest_en'),
            'stops': route_stops,
            'directions': dirs,
            'ctbOnlyStops': sorted(f'{d}:{s}' for d, s in orphan),
            'variants': vs,
        }
        json.dump(data, open(f'{OUT}/ctb/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'co': 'ctb', 'companies': companies, 'route': rno, 'origTc': data['origTc'], 'destTc': data['destTc'],
                      'dirs': sorted(dirs, reverse=True), 'variants': len(vs), 'special': sum(v['special'] for v in vs)})
    # 城巴有但政府冇嘅路線：照出（冇走法資料）
    for rno, info in rinfo.items():
        if rno in variants_by_route: continue
        dirs = {d: clists[(rno, d)] for d in ('O', 'I') if (rno, d) in clists}
        rstops = {s for l in dirs.values() for s in l}
        # 政府未有（例如新路線 770）：每個方向用城巴站點列表做一個走法，冇時間表、車費同走線，
        # 但有行車時間，巴士位置追蹤、站間時間照用得
        vs = []
        for d, l in dirs.items():
            if len(l) < 2:
                continue
            v = {'id': f'ctb-{d}', 'govRouteId': None, 'govDir': None,
                 'name': f"{cstops[l[0]]['nameTc']} - {cstops[l[-1]]['nameTc']}", 'special': False,
                 'stops': list(l), 'stopDirs': [d] * len(l), 'stopMatch': ['A'] * len(l),
                 'expSeq': {f'{d}:{x}': i + 1 for i, x in reversed(list(enumerate(l)))},
                 'schedules': [], 'line': None, 'lineAligned': False}
            v['segSeconds'], v['segMeasured'] = segment_times(v, cstops, journey)
            v['offsets'] = [0]
            for x in v['segSeconds']:
                v['offsets'].append(v['offsets'][-1] + x)
            vs.append(v)
        json.dump({'company': 'CTB', 'companies': ['CTB'], 'route': rno, 'joyYou': joyyou_ok(rno, info['orig_tc'], info['dest_tc']),
                   'origTc': info['orig_tc'], 'destTc': info['dest_tc'],
                   'origEn': info['orig_en'], 'destEn': info['dest_en'],
                   'stops': {s: cstops[s] for s in sorted(rstops)}, 'directions': dirs,
                   'ctbOnlyStops': [], 'variants': vs},
                  open(f'{OUT}/ctb/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        if not vs:   # 城巴 API 有列但冇站（季節性路線，例如 9C 歌連臣角）：唔放入路線列表
            continue
        index.append({'co': 'ctb', 'companies': ['CTB'], 'route': rno, 'origTc': info['orig_tc'], 'destTc': info['dest_tc'],
                      'dirs': sorted(dirs, reverse=True), 'variants': len(vs), 'special': 0})
    route_key = lambda r: (re.sub(r'\D', '', r['route']).zfill(4) if re.match(r'^\d', r['route']) else 'Z' + r['route'], r['route'], r.get('co', ''))
    index.sort(key=route_key)
    kmb_primary_done = set()
    kmb_index, kmb_by_stop, kstops = K.build_kmb({
        'kmb': kmbdata, 'special': special, 'lines': lines, 'journey': journey,
        'used_services': used_services, 'joint': actual_joint, 'fares': fares, 'full_fare': full_fare,
        # 認到係聯營但城巴冇政府走法資料：改用九巴做主幹，加城巴站
        'joint_kmb_primary': joint_rnos - actual_joint, 'ctb': (cstops, clists), 'kmb_primary_done': kmb_primary_done,
    })
    # 新大嶼山巴士、港鐵巴士
    import others as O
    octx = {'lines': lines, 'journey': journey, 'used_services': used_services}
    other_parts = [('nlb',) + O.build_nlb(octx), ('mtrb',) + O.build_mtrb(octx)]
    # 站點索引（附近車站用）：每個城巴站有邊幾條路線、邊個方向、往邊度
    by_stop = collections.defaultdict(list)
    for (rno, d), l in clists.items():
        dest = cstops[l[-1]]['nameTc'] if l else ''
        for sid in dict.fromkeys(l[:-1]):  # 終點站唔使列（乘客唔會喺度上車）
            by_stop[sid].append([rno, d, dest])
    stops_index = [
        {'id': sid, 'n': cstops[sid]['nameTc'], 'lat': cstops[sid]['lat'], 'lng': cstops[sid]['lng'],
         'r': sorted(rs, key=lambda x: (re.sub(r'\D', '', x[0]).zfill(4), x[0], x[1]))}
        for sid, rs in sorted(by_stop.items())
    ]
    # 九巴做主幹嘅聯營線：城巴嗰條唔再喺統一索引出（路線檔照留，舊 App 用）
    index_all = [r for r in index if r['route'] not in kmb_primary_done] + kmb_index + [r for _, idx, _, _ in other_parts for r in idx]
    json.dump({'stops': stops_index}, open(f'{OUT}/ctb/stops.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # 統一站點索引（兩間公司）：r = [co, 路線, 方向, 往邊度]
    all_stops = [dict(e, co='ctb', r=[['ctb'] + x for x in e['r'] if x[0] not in kmb_primary_done]) for e in stops_index]
    all_stops = [e for e in all_stops if e['r']]
    all_stops += [
        {'id': sid, 'co': 'kmb', 'n': kstops[sid]['nameTc'], 'lat': kstops[sid]['lat'], 'lng': kstops[sid]['lng'],
         'r': sorted(rs, key=lambda x: (re.sub(r'\D', '', x[1]).zfill(4), x[1], x[2]))}
        for sid, rs in sorted(kmb_by_stop.items())
    ]
    for co, _, ob, oinfo in other_parts:
        all_stops += [
            {'id': sid, 'co': co, 'n': oinfo[sid]['nameTc'], 'lat': oinfo[sid]['lat'], 'lng': oinfo[sid]['lng'],
             'r': sorted(rs, key=lambda x: (re.sub(r'\D', '', x[1]).zfill(4), x[1], x[2]))}
            for sid, rs in sorted(ob.items())
        ]
    json.dump({'stops': all_stops}, open(f'{OUT}/stops.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    from places import build_places
    build_places(all_stops, OUT)
    generated = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    json.dump({'generatedAt': generated, 'routes': sorted(index_all, key=route_key)},
              open(f'{OUT}/index.json', 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump({'generatedAt': generated, 'routes': index},
              open(f'{OUT}/ctb/index.json', 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(load_calendar(used_services), open(f'{OUT}/calendar.json', 'w'), separators=(',', ':'))

    fill_lines_from_csdi(lines_by_no)

    os.makedirs(f'{OUT}/report', exist_ok=True)
    with open(f'{OUT}/report/ctb_stop_map.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['gov_route_id', 'gov_dir', 'route', 'stop_seq', 'gov_stop_id', 'gov_name',
                    'ctb_dir', 'ctb_stop', 'ctb_name', 'class', 'dist_m'])
        w.writerows(report)
    cls = collections.Counter(r[9] for r in report)
    total = sum(cls.values())
    print(f'城巴路線 {len(index)}，有政府走法 {len(variants_by_route)}，走法 {sum(map(len, variants_by_route.values()))}')
    print('站點配對 ' + '  '.join(f'{k}:{cls[k]} ({cls[k] / total:.1%})' for k in 'ABCXM' if cls[k]))
    print('配唔到嘅政府走法', len(unmatched_routes))
    segs = [m for vs in variants_by_route.values() for v in vs for m in v['segMeasured']]
    print(f'站到站行車時間：實測 {sum(segs)}/{len(segs)}（{sum(segs) / max(len(segs), 1):.1%}），其餘用距離估算')
    sizes = [os.path.getsize(f'{OUT}/ctb/{r["route"]}.json') for r in index]
    print(f'每條路線檔案：平均 {sum(sizes) / len(sizes) / 1024:.0f} KB，最大 {max(sizes) / 1024:.0f} KB，總共 {sum(sizes) / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
