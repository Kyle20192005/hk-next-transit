"""
香港電車：站（data.gov.hk 電車站開放數據）+ 路線、時間表（運輸署 GTFS，agency TRAM）。

兩個地方用：
- build.py：每日生成 out/tram.json（每條路線每個方向嘅站、估計到站秒數、開車時間）
- packages/core/tools/tram-data.py：生成 core 嘅 tram-data.ts（站名、座標、次序，路綫圖同搜尋用）

站 ID 用電車公司嘅站代號（例如 02W 西行、01E 東行、105–112 跑馬地環綫），
總站開放數據寫「T」，按名同官網「下一班電車」嘅代號對返（一個總站可以有兩個代號，例如上環西行到站 WM、東行開出 WMT）。
GTFS 站名例如「英皇道(健康東街)(西行方向)」：同方向入面先用括號入面嘅街名對，唔得再用路名；跑馬地環綫冇方向，
按喺路線入面喺跑馬地總站前（南行）定後（北行）分。
"""
import collections, csv, math, os, re

# 總站：開放數據寫「T」，用中文名對；codes = 官網到站代號（ETA 用），第一個係主要
TERMINI = {
    '筲箕灣總站': ('SKT', ['SKT']),
    '北角總站': ('NPT', ['NPT']),
    '銅鑼灣總站': ('CBT', ['CBT']),
    '上環 (西港城) 總站': ('WMT', ['WM', 'WMT']),
    '石塘咀總站': ('WST', ['WST']),
    '堅尼地城總站': ('KTT', ['KTT']),
    '跑馬地總站': ('HVT', ['HVT_K', 'HVT_B']),
}
DIRS = {'西行': 'W', '東行': 'E', '南行': 'S', '北行': 'N'}
# GTFS 名同開放數據對唔到嘅（括號入面嘅街名指去另一個站）
GTFS_OVERRIDE = {'春秧街(北角道)(東行方向)': '67E'}
# GTFS 總站名 → 站 ID
GTFS_TERMINI = {'筲箕灣總站': 'SKT', '北角總站': 'NPT', '銅鑼灣總站': 'CBT', '上環街市(西港城)總站': 'WMT',
                '屈地街(石塘咀)總站': 'WST', '堅尼地城總站': 'KTT', '跑馬地總站': 'HVT'}
TRAM_FARE_NOTE = '持有樂悠咭嘅 60 至 64 歲乘客車費兩元'


def clean_name(s):
    s = s.strip()
    s = re.sub(r'\s*\(\s*', '（', s)
    s = re.sub(r'\s*\)\s*', '）', s)
    return s


def load_stations(cache):
    """
    站（行車次序）：{id: {zh, en, dir, codes, terminus, alightOnly}}，同每個方向嘅站序 order[dir]。
    東行喺開放數據係由東至西排，反轉做行車次序。
    """
    def rows(lang):
        return list(csv.reader(open(os.path.join(cache, f'tram_stops_{lang}.csv'), encoding='utf-8-sig')))[1:]
    tc, en = rows('tc'), rows('en')
    stations, order = {}, collections.defaultdict(list)
    for (d_tc, code, zh), (_, _, en_name) in zip(tc, en):
        d = DIRS[d_tc]
        if code == 'D':   # 屈地街電車廠（冇代號、只係車廠）
            continue
        if code == 'T':
            sid, codes = TERMINI[zh.strip()]
            st = stations.setdefault(sid, {'zh': clean_name(zh).replace('總站', ''), 'en': en_name.replace(' Terminus', '').strip(),
                                           'dir': 'T', 'codes': codes, 'terminus': True})
        else:
            alight = '只落客' in zh
            zh2 = re.sub(r'\(.*只落客.*$', '', zh).strip()
            en2 = re.sub(r'\s*\(.*$|\s*passenger alight only.*$', '', en_name).strip()
            sid = code
            st = stations.setdefault(sid, {'zh': clean_name(zh2), 'en': en2, 'dir': d, 'codes': [code]})
            if alight:
                st['alightOnly'] = True
        order[d].append(sid)
    order['E'].reverse()
    return stations, dict(order)


def _parse_gtfs_name(name):
    """「英皇道(健康東街)(西行方向)」→ (路名, 街名, 方向)"""
    d = None
    m = re.search(r'\((東|西)行方向\)$', name)
    if m:
        d = 'E' if m.group(1) == '東' else 'W'
        name = name[:m.start()]
    m = re.match(r'^(.*?)\((.*)\)$', name)
    road, cross = (m.group(1), m.group(2)) if m else (name, None)
    return road.strip(), (cross or '').strip(), d


def _hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _hhmm(s):
    h, m = s.split(':')[:2]
    return int(h) * 60 + int(m)


def load_routes(gtfs, stations, order):
    """
    GTFS 電車路線 → [{id, zh, en, dirs: {GTFS 方向: {stops: [站 ID], offsets: [秒], schedules: [...], minutes}}}]，
    同時幫 stations 填座標（lat、lng）。配唔到嘅 GTFS 站會 raise（GTFS 改咗站要人手睇）。
    """
    routes = {r['route_id']: r for r in csv.DictReader(open(f'{gtfs}/routes.txt', encoding='utf-8-sig')) if r['agency_id'] == 'TRAM'}
    trips = [t for t in csv.DictReader(open(f'{gtfs}/trips.txt', encoding='utf-8-sig')) if t['route_id'] in routes]
    tids = {t['trip_id'] for t in trips}
    st = collections.defaultdict(list)
    for s in csv.DictReader(open(f'{gtfs}/stop_times.txt', encoding='utf-8-sig')):
        if s['trip_id'] in tids:
            st[s['trip_id']].append(s)
    gstops = {s['stop_id']: s for s in csv.DictReader(open(f'{gtfs}/stops.txt', encoding='utf-8-sig'))}
    freq = collections.defaultdict(list)
    for f in csv.DictReader(open(f'{gtfs}/frequencies.txt', encoding='utf-8-sig')):
        if f['trip_id'] in tids:
            freq[f['trip_id']].append(f)
    by_name = {}
    for sid, s in stations.items():
        if not s.get('terminus'):
            by_name.setdefault((s['dir'], s['zh']), sid)

    def match(gname, d):
        if gname in GTFS_OVERRIDE:
            return GTFS_OVERRIDE[gname]
        if gname in GTFS_TERMINI:
            return GTFS_TERMINI[gname]
        road, cross, gd = _parse_gtfs_name(gname)
        d = gd or d
        for nm in (cross, road):
            if nm and (d, nm) in by_name:
                return by_name[(d, nm)]
        raise ValueError(f'電車站配唔到：{gname}（{d}）')

    # 每條路線每個方向：最多班次嘅站序
    seqs = collections.defaultdict(collections.Counter)
    trips_by = collections.defaultdict(list)
    for t in trips:
        d = t['trip_id'].split('-')[1]
        rows = sorted(st[t['trip_id']], key=lambda x: int(x['stop_sequence']))
        seqs[(t['route_id'], d)][tuple(r['stop_id'] for r in rows)] += 1
        trips_by[(t['route_id'], d)].append((t, rows))
    out = []
    for rid in sorted(routes):
        name = routes[rid]['route_long_name'].split('(持有')[0].strip()
        r = {'id': rid, 'zh': name.replace(' - ', ' ↔ '), 'dirs': {}}
        for d in ('1', '2'):
            if (rid, d) not in seqs:
                continue
            gseq = seqs[(rid, d)].most_common(1)[0][0]
            names = [gstops[g]['stop_name'] for g in gseq]
            hv = next((i for i, n in enumerate(names) if n.startswith('跑馬地總站')), None)
            sids = []
            for i, (g, n) in enumerate(zip(gseq, names)):
                dd = None if hv is None else ('S' if i < hv else 'N')
                sid = match(n, dd)
                sids.append(sid)
                s = stations[sid]
                s.setdefault('lat', round(float(gstops[g]['stop_lat']), 6))
                s.setdefault('lng', round(float(gstops[g]['stop_lon']), 6))
            # 全程時間：GTFS 頭尾站有時間
            durs = []
            for t, rows in trips_by[(rid, d)]:
                if len(rows) == len(gseq) and rows[0]['arrival_time'] and rows[-1]['arrival_time']:
                    durs.append(_hhmm(rows[-1]['arrival_time']) - _hhmm(rows[0]['arrival_time']))
            minutes = collections.Counter(durs).most_common(1)[0][0] if durs else None
            pos = [(float(gstops[g]['stop_lat']), float(gstops[g]['stop_lon'])) for g in gseq]
            cum = [0.0]
            for a, b in zip(pos, pos[1:]):
                cum.append(cum[-1] + _hav(a, b))
            total = cum[-1] or 1
            offsets = [round(c / total * (minutes or 0) * 60) for c in cum]
            sched = collections.defaultdict(set)
            for t, _ in trips_by[(rid, d)]:
                fs = freq.get(t['trip_id'])
                if not fs:
                    sched[t['service_id']].add(_hhmm(t['trip_id'].split('-')[3][:2] + ':' + t['trip_id'].split('-')[3][2:]))
                    continue
                for f in fs:
                    x, end, step = _hhmm(f['start_time']), _hhmm(f['end_time']), max(int(f['headway_secs']) // 60, 1)
                    while x <= end:
                        sched[t['service_id']].add(x)
                        x += step
            r['dirs'][d] = {
                'stops': sids, 'offsets': offsets, 'minutes': minutes,
                'schedules': [{'serviceId': k, 'departures': sorted(v)} for k, v in sorted(sched.items())],
            }
        out.append(r)
    # GTFS 冇嘅站（電車廠：屈地街 94W、西灣河 97E）：路線喺同方向連續經過佢前後兩個站，就插返入去（時間取中間）。
    # 只限冇任何路線經過嘅站：春秧街、北角總站呢啲支綫站喺次序入面都夾喺兩個站中間，但直通車唔經（唔好插）
    used = {s for r in out for x in r['dirs'].values() for s in x['stops']}
    for r in out:
        for x in r['dirs'].values():
            sids, offsets = x['stops'], x['offsets']
            i = 0
            while i + 1 < len(sids):
                a, b = stations[sids[i]], stations[sids[i + 1]]
                da = a['dir'] if a['dir'] != 'T' else b['dir']
                ids = order.get(da, [])
                if sids[i] in ids and sids[i + 1] in ids:
                    ia, ib = ids.index(sids[i]), ids.index(sids[i + 1])
                    if ib == ia + 2 and ids[ia + 1] not in used:
                        sids.insert(i + 1, ids[ia + 1])
                        offsets.insert(i + 1, round((offsets[i] + offsets[i + 1]) / 2))
                i += 1
    # GTFS 冇嘅站（電車廠）：用同方向前後兩個站中間
    for d, ids in order.items():
        for i, sid in enumerate(ids):
            s = stations[sid]
            if 'lat' in s:
                continue
            nb = [stations[x] for x in (ids[i - 1] if i else None, ids[i + 1] if i + 1 < len(ids) else None) if x and 'lat' in stations[x]]
            if nb:
                s['lat'] = round(sum(n['lat'] for n in nb) / len(nb), 6)
                s['lng'] = round(sum(n['lng'] for n in nb) / len(nb), 6)
    return out


def build(cache, out_dir):
    """build.py 用：寫 out/tram.json，回傳用咗嘅 serviceId（calendar.json 要包埋）"""
    import json
    stations, order = load_stations(cache)
    routes = load_routes(f'{cache}/gtfs', stations, order)
    fare = None
    fa = os.path.join(cache, 'gtfs', 'fare_attributes.txt')
    if os.path.exists(fa):
        prices = [float(r['price']) for r in csv.DictReader(open(fa, encoding='utf-8-sig')) if r['fare_id'].startswith('400')]
        fare = max(prices) if prices else None
    json.dump({'routes': routes, 'fare': fare}, open(os.path.join(out_dir, 'tram.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    services = {s['serviceId'] for r in routes for d in r['dirs'].values() for s in d['schedules']}
    print(f'電車 {len(routes)} 條路線、{len(stations)} 個站，成人車費 {fare}')
    return services
