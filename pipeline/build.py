"""步驟 2：由 cache/ 生成前端用嘅數據到 out/
以城巴為主：站 ID、站名、座標用城巴 API；政府數據補充走法、時間表、走線。

輸出
  out/calendar.json        GTFS 服務日曆（邊個 serviceId 喺邊日行）
  out/ctb/index.json       城巴路線列表
  out/ctb/<路線>.json      每條路線：站點、走法、時間表、走線、ETA seq 對照
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
def load_gtfs():
    routes = {r['route_id']: r for r in csv.DictReader(open(f'{G}/routes.txt', encoding='utf-8-sig'))
              if 'CTB' in r['agency_id']}
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


def main():
    groutes, gtrips, first, gst, freq, gstops_all = load_gtfs()
    ctb_routes, cstops, clists = load_ctb()
    special = {}
    for f in json.load(open(f'{CACHE}/td_bus.json', encoding='utf-8-sig'))['features']:
        p = f['properties']
        special[str(p['routeId'])] = p['specialType'] == 1
    lines = {(str(f['properties']['ROUTE_ID']), str(f['properties']['ROUTE_SEQ'])): f['geometry']['coordinates']
             for f in json.load(open(f'{CACHE}/csdi_lines.json', encoding='utf-8'))['features']}

    # 每條城巴路線嘅候選列表：O、I，循環線多一個 O+I
    cand_lists = {}
    for (rno, d), l in clists.items():
        cand_lists[(rno, d)] = [(d, s) for s in l]
    for rno in {k[0] for k in clists}:
        if (rno, 'O') in clists and (rno, 'I') in clists:
            cand_lists[(rno, 'O+I')] = cand_lists[(rno, 'O')] + cand_lists[(rno, 'I')]

    report, unmatched_routes = [], []
    variants_by_route = collections.defaultdict(list)
    used_services = set()
    for (rid, d), tid in sorted(first.items()):
        rno = groutes[rid]['route_short_name']
        rows = sorted(gst[tid], key=lambda r: int(r['stop_sequence']))
        gs = [{'id': r['stop_id'], 'seq': int(r['stop_sequence']),
               'name': re.sub(r'^\[[^\]]*\]\s*', '', gstops_all[r['stop_id']]['stop_name'].split('|')[0]),
               'names': gtfs_names(gstops_all[r['stop_id']]['stop_name']),
               'pos': (float(gstops_all[r['stop_id']]['stop_lat']), float(gstops_all[r['stop_id']]['stop_lon']))}
              for r in rows]
        keys = [k for k in cand_lists if k[0] == rno]
        if not keys:
            unmatched_routes.append((rid, d, rno, '城巴 API 冇此路線')); continue
        best = max(((k, align(gs, [s for _, s in cand_lists[k]], cstops)) for k in keys),
                   key=lambda x: sum({'A': 4, 'B': 3, 'C': 1}[v[1]] for v in x[1].values()))
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
                mine = set(pos)
                for s in l[lo:hi + 1]:
                    if s in mine or (d, s) in orphan:
                        n += 1
                        v['expSeq'].setdefault(f'{d}:{s}', n)
        rstops = {s for l in dirs.values() for s in l} | {s for v in vs for s in v['stops'] if s}
        info = rinfo.get(rno, {})
        data = {
            'company': 'CTB', 'route': rno,
            'origTc': info.get('orig_tc'), 'destTc': info.get('dest_tc'),
            'origEn': info.get('orig_en'), 'destEn': info.get('dest_en'),
            'stops': {s: cstops[s] for s in sorted(rstops)},
            'directions': dirs,
            'ctbOnlyStops': sorted(f'{d}:{s}' for d, s in orphan),
            'variants': vs,
        }
        json.dump(data, open(f'{OUT}/ctb/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'route': rno, 'origTc': data['origTc'], 'destTc': data['destTc'],
                      'variants': len(vs), 'special': sum(v['special'] for v in vs)})
    # 城巴有但政府冇嘅路線：照出（冇走法資料）
    for rno, info in rinfo.items():
        if rno in variants_by_route: continue
        dirs = {d: clists[(rno, d)] for d in ('O', 'I') if (rno, d) in clists}
        rstops = {s for l in dirs.values() for s in l}
        json.dump({'company': 'CTB', 'route': rno, 'origTc': info['orig_tc'], 'destTc': info['dest_tc'],
                   'origEn': info['orig_en'], 'destEn': info['dest_en'],
                   'stops': {s: cstops[s] for s in sorted(rstops)}, 'directions': dirs,
                   'ctbOnlyStops': [], 'variants': []},
                  open(f'{OUT}/ctb/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'route': rno, 'origTc': info['orig_tc'], 'destTc': info['dest_tc'], 'variants': 0, 'special': 0})
    index.sort(key=lambda r: (re.sub(r'\D', '', r['route']).zfill(4) if re.match(r'^\d', r['route']) else 'Z' + r['route'], r['route']))
    json.dump({'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'routes': index},
              open(f'{OUT}/ctb/index.json', 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(load_calendar(used_services), open(f'{OUT}/calendar.json', 'w'), separators=(',', ':'))

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
    sizes = [os.path.getsize(f'{OUT}/ctb/{r["route"]}.json') for r in index]
    print(f'每條路線檔案：平均 {sum(sizes) / len(sizes) / 1024:.0f} KB，最大 {max(sizes) / 1024:.0f} KB，總共 {sum(sizes) / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
