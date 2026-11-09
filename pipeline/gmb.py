"""專線小巴（GMB）：由 build.py 呼叫，輸出 out/gmb/<地區>-<號碼>.json（例如 NT-2、KLN-25MS）。

數據（全部用同一套 8 位數站 ID，唔使好似城巴咁配對站）：
- JSON_GMB.json（運輸署）：每個 route_id + route_seq 嘅站序、站名、座標、地區、全程車費。站序以佢為準：
  同 API 一致；GTFS 大約遲一個星期（2026-11 有 40 個方向站序舊咗，新 route_id 冇時間表）。
- GTFS（agency GMB）：時間表、日曆、分段車費。車費 key 係 GTFS 站序，用 GTFS 第一班車嘅站序對返站 ID。
- CSDI GMB_ROUTE_LINE：每個 route_id + route_seq 一條走線，站按次序投影落去切段（others.OsmPath）。
- API 路線資料（fetch.py 存 gmb_routes.json，可選）：走法描述（正常班次、特別班次、經…）同每個方向嘅起訖點。
  冇就用 JSON_GMB 嘅起訖點同 specialType（specialType 唔可靠，只係後備）。

路線檔：一個「地區 + 號碼」一個檔（號碼喺唔同地區會重複，例如 2 號三區都有；route_id 改組會變，所以唔用佢做 key），
每個 (route_id, route_seq) 一個走法（id = `<route_id>-<route_seq>`，`gmb: {routeId, routeSeq}`）。
方向：主走法（「正常班次」）seq 1 = O、seq 2 = I；其他 route_id 按同主走法邊個方向似啲定（共同站 + 終點喺附近，
dir_score）；循環線（得一個 seq、頭尾同一個站）一律 O。`gmb.routeSeq` 係真正嘅 seq（ETA 用），唔一定同方向一樣。
特別班：API 描述唔係「正常…」／「經…」嘅（短程、額外、通宵、特快…）；主走法一定唔係（有啲號碼本身就係短程線）。
同一方向幾個特別班顯示名一樣就加「由 X 開出」等分開（disambiguate）。
重複站（循環線頭尾同一個站，或者中途再經同一個站）：走法只留第一次（stops、offsets、segSeconds、走線 index 對齊），
expSeq = 第一次嘅 stop_seq（core 用嚟揀返第一次嘅 ETA）；中間嘅走線同行車時間併入下一段，
循環線最後返總站嗰段走線加喺尾做多一段（lineAligned false）。
樂悠咭：專線小巴全部當適用（唔好用 build.joyyou_ok：佢嘅「…R」馬場規則會錯殺 20R、60R）。
"""
import collections, json, math, os, re

import build as B
import others as O

REGIONS = ('HKI', 'KLN', 'NT')
CODE_RE = re.compile(r'[A-Z0-9]{1,5}')   # 同 core SAFE_ROUTE 一樣（地區-號碼，號碼最多 5 個字）
NORMAL = '正常班次'
# 走線預先簡化（度，約 1 米，同其他公司走線一樣）；切段後再用 B.simplify 簡化同捨入
LINE_TOL = 0.00001
# 兩站之間沿走線距離比直線遠好多（> 3 倍 + 500 米）：小巴好多時真係兜一個圈（例如 56A 喺皇后大道東掉頭，
# 對面兩個站相隔 16 米、沿線 680 米），所以唔好好似港鐵巴士 OSM 走線咁一律唔用。有實測行車時間就睇車速
# （> 20 米/秒 = 72 km/h 即係站投影錯咗位），冇就最多遠 3 公里
DETOUR_MAX_SPEED = 20
DETOUR_MAX_EXTRA_M = 3000
# GTFS 分段車費低過 JSON_GMB 全程車費幾多以內當係 GTFS 未跟加價（見 fares_for）；2026-11 加價最多約 12%
FARE_SCALE_MAX = 1.15


# ---------------- 讀數據 ----------------
def clean(name):
    """站名、地名：全形空格（「伊利沙伯醫院路,\u3000近\u3000…」）同多個空格變一個"""
    return re.sub(r'\s+', ' ', name or '').strip()


def load_td_gmb():
    """JSON_GMB → {(route_id, route_seq): 走法}；站序唔係 1..n 嘅唔用"""
    raw = json.load(open(f'{B.CACHE}/td_gmb.json', encoding='utf-8-sig'))
    groups = collections.defaultdict(list)
    for f in raw['features']:
        p = f['properties']
        groups[(str(p['routeId']), int(p['routeSeq']))].append((p, f['geometry']['coordinates']))
    pats, bad = {}, []
    for key, rows in sorted(groups.items()):
        rows.sort(key=lambda x: x[0]['stopSeq'])
        p = rows[0][0]
        region, code = str(p['district']).strip().upper(), str(p['routeNameE']).strip().upper()
        if ([x[0]['stopSeq'] for x in rows] != list(range(1, len(rows) + 1)) or len(rows) < 2
                or region not in REGIONS or not CODE_RE.fullmatch(code)):
            bad.append(f'{key[0]}-{key[1]}')
            continue
        pats[key] = {
            'region': region, 'code': code, 'specialType': p.get('specialType'), 'fullFare': p.get('fullFare'),
            'locStart': (clean(p.get('locStartNameC')), clean(p.get('locStartNameE'))),
            'locEnd': (clean(p.get('locEndNameC')), clean(p.get('locEndNameE'))),
            # (stop_seq, 站 ID, 中文名, 英文名, lat, lng)
            'stops': [(x['stopSeq'], str(x['stopId']), clean(x['stopNameC']), clean(x['stopNameE']),
                       round(float(c[1]), 6), round(float(c[0]), 6)) for x, c in rows],
        }
    if bad:
        print(f'專線小巴：JSON_GMB 有 {len(bad)} 個走法站序唔完整或者號碼唔啱，唔用：', ', '.join(bad[:10]))
    if not pats:
        raise RuntimeError('JSON_GMB 冇任何走法')
    return pats


def load_api_routes():
    """API 路線資料 {route_id: routeObj}；冇（下載失敗）就 {}，走法名改用 JSON_GMB"""
    path = f'{B.CACHE}/gmb_routes.json'
    if not os.path.exists(path):
        print('專線小巴：冇 API 路線資料（gmb_routes.json），走法名用 JSON_GMB')
        return {}
    try:
        return {str(rid): x['data'] for rid, x in json.load(open(path, encoding='utf-8'))['routes'].items()}
    except Exception as e:  # noqa: BLE001 — 可選數據，壞咗唔好令小巴冇晒
        print('專線小巴：API 路線資料讀唔到，走法名用 JSON_GMB：', e)
        return {}


def simplify(pts, tol):
    """Douglas-Peucker（用堆疊唔遞歸：成條走線可以有幾千點）。頭尾同一點（循環線）用點距離"""
    if len(pts) < 3:
        return [list(p) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        far, idx = 0.0, None
        for i in range(a + 1, b):
            x, y = pts[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L if L else math.hypot(x - x1, y - y1)
            if d > far:
                far, idx = d, i
        if idx is not None and far > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [list(p) for p, k in zip(pts, keep) if k]


def load_lines():
    """CSDI 專線小巴走線 {(route_id, route_seq): [[lng, lat], …]}；冇（下載失敗）就 {}，地圖用虛線"""
    path = f'{B.CACHE}/csdi_gmb_lines.json'
    if not os.path.exists(path):
        print('專線小巴：冇 CSDI 走線（csdi_gmb_lines.json），地圖用虛線')
        return {}
    out = {}
    for f in json.load(open(path, encoding='utf-8'))['features']:
        p, g = f['properties'], f.get('geometry') or {}
        parts = g.get('coordinates') or []
        if g.get('type') == 'LineString':
            parts = [parts]
        pts = []
        for part in parts:   # 2026-11 全部都係一段
            for pt in part:
                if not pts or pts[-1] != pt[:2]:
                    pts.append(pt[:2])
        if len(pts) >= 2:
            out[(str(p['ROUTE_ID']), int(p['ROUTE_SEQ']))] = simplify(pts, LINE_TOL)
    return out


# ---------------- 工具 ----------------
def lcs(a, b):
    """兩個站 ID 列表嘅最長公共子序列長度"""
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b):
            cur.append(prev[j] + 1 if x == y else max(prev[j + 1], cur[j]))
        prev = cur
    return prev[-1]


def first_visits(ids):
    """每個站第一次出現嘅位置（重複站只留第一次）"""
    seen, keep = set(), []
    for i, s in enumerate(ids):
        if s not in seen:
            seen.add(s)
            keep.append(i)
    return keep


def join(parts):
    pts = [list(p) for p in parts[0]]
    for sg in parts[1:]:
        pts += [list(p) for p in sg[1:]]
    return pts


def plausible(straight, along, secs):
    """兩站之間沿走線距離合唔合理（見 DETOUR_MAX_SPEED）"""
    if straight * 3 + 500 >= along:
        return True
    if secs:
        return along / secs <= DETOUR_MAX_SPEED
    return along <= straight * 3 + DETOUR_MAX_EXTRA_M


def cut_line(path, stops, journey):
    """全部站（按真實次序，連重複站）投影落走線（others.OsmPath，只准向前），切做每兩個位置一段；
    有站離走線 > 100 米、或者某段兜得唔合理就 None（地圖用虛線）"""
    if not path:
        return None
    pts = [(s[4], s[5]) for s in stops]
    op = O.OsmPath(path)
    f = op.fit(pts)
    if not f:
        return None
    segs = op.segments(f[1])
    for a, b, sg in zip(stops, stops[1:], segs):
        along = sum(B.dist(x[::-1], y[::-1]) for x, y in zip(sg, sg[1:]))
        if not plausible(B.dist(a[4:6], b[4:6]), along, journey.get(a[1], {}).get(b[1])):
            return None
    return segs


def merge(items, keep, n, combine):
    """位置段（第 i 段 = 第 i 個位置 → 第 i+1 個）併成保留站之間嘅段（例如 A B C B D：C → D = C→B + B→D）；
    最後一個保留站之後仲有段（循環線返總站）就併做一段，放喺尾"""
    out = [combine(items[a:b]) for a, b in zip(keep, keep[1:])]
    tail = items[keep[-1]:n - 1]
    return out, (combine(tail) if tail else None)


# ---------------- 走法 ----------------
def raw_desc(api):
    """走法描述，拎走空格；「特别」（簡體，運輸署打錯）改返「特別」"""
    return re.sub(r'\s+', '', (api or {}).get('description_tc') or '').replace('特别', '特別')


def clean_desc(api):
    """API 走法描述 → 走法名尾括號入面嘅字。core shortName 只認最後一對括號，所以入面唔可以再有括號：
    「特別班次(不經雅緻洋房)」→「特別班次，不經雅緻洋房」；「正常班次 (經培民街)」→「經培民街」；「正常班次」→ 空"""
    d = re.sub(r'^正常(班次|路線)', '', raw_desc(api))
    return '，'.join(p for p in re.split(r'[()（）,，]+', d) if p)


def is_normal(api):
    """正常走法：「正常班次」「正常路線」（連括號）、「循環線」，或者只係講經／不經／繞邊度（例如「經華富邨」）。
    其他（特別、短程、額外、通宵、輔助、特快、早上班次…，2026-11 有一百幾種寫法）當特別班：
    core variantLabel 會顯示描述（「短程班次」），唔係全部都叫「正常路線」分唔到"""
    d = clean_desc(api)
    return raw_desc(api).startswith('正常') or d in ('', '循環線') or bool(re.match(r'(經|不經|繞)', d))


def short_name(name):
    """同 core shortName 一樣：走法名最後一對括號入面嘅字"""
    m = re.search(r'[（(]([^）)]+)[）)]\s*$', name)
    return m.group(1) if m else name


def no_paren(name):
    return re.sub(r'\s*[(（][^)）]*[)）]', '', name).strip()


def disambiguate(variants, parts):
    """同一個方向幾個特別班顯示名一樣（例如 101M 四個「短程班次」由唔同地方開）：描述後面加「由 X 開出」、
    「往 X」、「經 X」或者連括號嘅終點（邊個分得開用邊個），否則揀走法、到站時間標籤都分唔到。parts = {走法 id: (起點, 終點, 描述)}"""
    groups = collections.defaultdict(list)
    for v in variants:
        if v['special'] and parts[v['id']][2]:
            groups[(v['stopDirs'][0], short_name(v['name']))].append(v)
    for vs in groups.values():
        if len(vs) < 2:
            continue
        via = lambda o, d: '，'.join(re.findall(r'[(（]((?:不經|經|繞)[^)）]*)[)）]', f'{o} {d}'))
        full = lambda o, d: '往' + re.sub(r'[()（）\s]+', '', re.sub(r'[(（]循環線[)）]', '', d))   # 柴灣(曉翠街) → 柴灣曉翠街
        for make in (lambda o, d: f'由{no_paren(o)}開出', lambda o, d: f'往{no_paren(d)}', via, full):
            extra = {v['id']: make(*parts[v['id']][:2]) for v in vs}
            if all(extra.values()) and len(set(extra.values())) == len(vs):
                for v in vs:
                    o, d, desc = parts[v['id']]
                    v['name'] = f'{o} - {d}({desc}，{extra[v["id"]]})'
                break


def variant_names(pat, seq, api):
    """(起點, 終點, 起點英文, 終點英文, 描述, 係咪特別班)。冇 API 資料就用 JSON_GMB（specialType 唔可靠，只係後備）"""
    d = next((x for x in (api or {}).get('directions') or [] if x.get('route_seq') == seq), None)
    if d:
        names = tuple(re.sub(r'\s+', ' ', d.get(k) or '').strip() for k in ('orig_tc', 'dest_tc', 'orig_en', 'dest_en'))
    else:   # JSON_GMB 起訖點係 seq 1 嘅方向
        (o, oe), (e, ee) = pat['locStart'], pat['locEnd']
        names = (o, e, oe, ee) if seq == 1 else (e, o, ee, oe)
    if api:
        return names + (clean_desc(api), not is_normal(api))
    return names + ('', pat['specialType'] == 1)


def fares_for(pat, gtfs_rows, sect, keep_ids):
    """每個站上車嘅成人車費：GTFS 分段收費（GTFS 站序 → 站 ID，用 GTFS 第一班車），冇就全程車費。0 = 冇資料。
    GTFS 加價跟得慢（2026-11：164 個走法最高分段車費低過 JSON_GMB 全程車費，差 2–12%，JSON_GMB 7 至 11 月更新）：
    最高分段車費低過全程車費、差距喺 FARE_SCALE_MAX 內，就當 GTFS 未更新，全部分段按比例加（捨入到一毫，最高嗰段 = 全程車費）；
    差太遠（例如 NT 55K 短程班 GTFS $5.2、JSON_GMB 寫成條線 $11.5）就照用 GTFS。
    回傳 (車費, 有冇按比例調整)"""
    out = {}
    if sect and gtfs_rows:
        for r in gtfs_rows:   # 重複站用第一次
            price = sect.get(int(r['stop_sequence']))
            if price and price > 0 and r['stop_id'] in keep_ids:
                out.setdefault(r['stop_id'], price)
    full = float(pat['fullFare'] or 0)
    if not out:
        return ({s: full for s in keep_ids} if full > 0 else {}), False
    top = max(out.values())
    if full > 0 and top + 0.05 < full <= top * FARE_SCALE_MAX:
        k = full / top
        return {s: math.floor(p * k * 10 + 0.5 + 1e-9) / 10 for s, p in out.items()}, True
    return out, False


def build_variant(rid, seq, pat, dir_, api, is_main, gtfs, ctx, lines, stops_info, stats):
    gtrips, first, gst, freq = gtfs
    P = [s[1] for s in pat['stops']]
    keep = first_visits(P)
    ids = [P[k] for k in keep]
    orig, dest, _, _, desc, special = variant_names(pat, seq, api)
    # 主走法一定唔係特別班：有啲號碼本身就係「短程班次」「特快班次」（例如港島 16X、22X），
    # 唔係咁成條線都會變紅色時間線、叫「特別班」
    special = special and not is_main
    name = f'{orig} - {dest}' + (f'({desc})' if desc else '')

    # 時間表：GTFS（新 route_id 未有 → []，介面寫「冇時間表資料」）
    trips = gtrips.get((rid, str(seq)), [])
    sched = B.variant_schedule(trips, freq)
    ctx['_services'].update(sched)

    # 行車時間：按真實站序（連重複站）計，再併成保留站之間
    secs, meas = B.pair_times(P, stops_info, ctx['journey'])
    seg_secs, _ = merge(secs, keep, len(P), sum)
    seg_meas, _ = merge(meas, keep, len(P), all)
    offsets = [0]
    for x in seg_secs:
        offsets.append(offsets[-1] + x)

    # 走線
    line, aligned = None, False
    segs = cut_line(lines.get((rid, seq)), pat['stops'], ctx['journey'])
    if segs:
        body, tail = merge(segs, keep, len(P), join)
        line = [B.simplify(sg) for sg in body + ([tail] if tail else [])]
        aligned = not tail
    stats['line'] += bool(line)
    stats['noLine'] += (rid, seq) in lines and not line

    # 車費：上車站 = 真實站序最後一個之前嘅（循環線總站都計）
    boardable = set(P[:-1])
    fk = (rid, str(seq))
    fares, scaled = fares_for(pat, sorted(gst.get(first.get(fk), []), key=lambda r: int(r['stop_sequence'])),
                              ctx['fares'].get(fk), boardable)
    stats['fareScaled'] += scaled

    ctx['_parts'][f'{rid}-{seq}'] = (orig, dest, desc)
    return {
        'id': f'{rid}-{seq}', 'govRouteId': rid, 'govDir': str(seq), 'name': name, 'special': special,
        'stops': ids, 'stopDirs': [dir_] * len(ids), 'stopMatch': ['A'] * len(ids),
        'expSeq': {f'{dir_}:{P[k]}': pat['stops'][k][0] for k in keep},
        'offsets': offsets, 'segSeconds': seg_secs, 'segMeasured': seg_meas,
        'schedules': [{'serviceId': k, 'departures': sorted(x)} for k, x in sorted(sched.items())],
        'line': line, 'lineAligned': aligned,
        'fares': fares,
        'gmb': {'routeId': rid, 'routeSeq': seq},
    }, boardable


def dir_score(l, m, stops_info):
    """走法（站 ID 列表）同主走法某個方向有幾似：共同站（LCS）為主，終點喺附近（300 米內）加多啲，起點加少啲。
    只靠 LCS 唔夠：西貢 2 號「北港 → 西貢」同主走法兩個方向都只係共用西貢總站，要睇終點先知係回程"""
    if not m:
        return -1
    near = lambda a, b: B.dist(*((stops_info[x]['lat'], stops_info[x]['lng']) for x in (a, b))) <= 300
    return lcs(l, m) * 2 + 3 * near(l[-1], m[-1]) + near(l[0], m[0])


def orient(rid_seqs, main_o, main_i, pats, stops_info):
    """唔係主 route_id 嘅走法放邊個方向（dir_score）：兩個 seq 就揀「seq1 → O、seq2 → I」定對調；
    一個 seq：循環線（頭尾同一個站）一律 O，否則似主走法 I 多啲先放 I"""
    ids = {s: [x[1] for x in pats[(r, s)]['stops']] for r, s in rid_seqs}
    score = lambda l, m: dir_score(l, m, stops_info)
    if len(ids) == 2:
        a, b = ids[1], ids[2]
        direct = score(a, main_o) + score(b, main_i)
        swap = score(a, main_i) + score(b, main_o)
        return {1: 'I', 2: 'O'} if swap > direct else {1: 'O', 2: 'I'}
    (s, l), = ids.items()
    if l[0] == l[-1]:
        return {s: 'O'}
    return {s: 'I' if score(l, main_i) > score(l, main_o) else 'O'}


def orient_all(main, order, rids, pats, stops_info):
    """每個 route_id 每個 seq 放邊個方向：{route_id: {seq: 'O'|'I'}}。主走法第一個 seq = O、第二個 = I；
    其他先排有兩個 seq 嘅（佢哋自己定到兩個方向），再排得一個 seq 嘅。主走法得一個方向（例如 22S 中環 → 薄扶林花園）
    就用第一個兩個 seq 走法嘅 I，再冇就用主走法倒轉（循環線除外）做 I 嘅參考，否則回程特別班會擺錯去 O"""
    ids = lambda r, s: [x[1] for x in pats[(r, s)]['stops']]
    seqs = {r: sorted(rids[r]) for r in order}
    out = {main: {s: 'OI'[i] for i, s in enumerate(seqs[main])}}
    main_o = ids(main, seqs[main][0])
    main_i = ids(main, seqs[main][1]) if len(seqs[main]) > 1 else []
    others = [r for r in order if r != main]
    for r in others:
        if len(seqs[r]) == 2:
            out[r] = orient([(r, s) for s in seqs[r]], main_o, main_i, pats, stops_info)
    ref_i = main_i or next((ids(r, s) for r in others if r in out for s, d in out[r].items() if d == 'I'), None) \
        or (main_o[::-1] if main_o[0] != main_o[-1] else [])
    for r in others:
        if r not in out:
            out[r] = orient([(r, s) for s in seqs[r]], main_o, ref_i, pats, stops_info)
    return out


def build_gmb(ctx):
    pats = load_td_gmb()
    api = load_api_routes()
    lines = load_lines()
    _, gtrips, first, gst, freq, _ = B.load_gtfs(lambda a: a == 'GMB')
    gtfs = (gtrips, first, gst, freq)
    ctx = dict(ctx, _services=set(), _parts={})

    # 全部站：站名用所有走法最常見嗰個（stops.json），座標 JSON_GMB 每個站一樣
    names = collections.defaultdict(collections.Counter)
    names_en = collections.defaultdict(collections.Counter)
    stops_info = {}
    for pat in pats.values():
        for _, sid, nc, ne, lat, lng in pat['stops']:
            names[sid][nc] += 1
            names_en[sid][ne] += 1
            stops_info.setdefault(sid, {'nameTc': '', 'nameEn': '', 'lat': lat, 'lng': lng})
    for sid, x in stops_info.items():
        x['nameTc'] = names[sid].most_common(1)[0][0]
        x['nameEn'] = names_en[sid].most_common(1)[0][0]

    by_route = collections.defaultdict(lambda: collections.defaultdict(list))   # (地區, 號碼) -> route_id -> [seq]
    for (rid, seq), pat in pats.items():
        by_route[(pat['region'], pat['code'])][rid].append(seq)

    os.makedirs(f'{B.OUT}/gmb', exist_ok=True)
    index, by_stop = [], collections.defaultdict(list)
    stats = collections.Counter()
    for (region, code), rids in sorted(by_route.items()):
        key = f'{region}-{code}'
        ntrips = lambda r: sum(len(gtrips.get((r, str(s)), [])) for s in rids[r])
        nstops = lambda r: max(len(pats[(r, s)]['stops']) for s in rids[r])
        # 主走法：API「正常班次」；冇就其他正常走法（「正常路線」「經…」）；再冇就 specialType 0；之後班次最多、站最多
        pool = ([r for r in rids if raw_desc(api.get(r)) == NORMAL]
                or [r for r in rids if api.get(r) and is_normal(api.get(r))]
                or [r for r in rids if pats[(r, min(rids[r]))]['specialType'] == 0]
                or list(rids))
        main = max(pool, key=lambda r: (ntrips(r), nstops(r), -int(r)))
        order = [main] + sorted((r for r in rids if r != main), key=lambda r: (-ntrips(r), int(r)))
        dirs_of = orient_all(main, order, rids, pats, stops_info)

        variants, directions, route_stops = [], {}, {}
        for rid in order:
            seqs = sorted(rids[rid])
            dirs = dirs_of[rid]
            for seq in seqs:
                pat = pats[(rid, seq)]
                v, boardable = build_variant(rid, seq, pat, dirs[seq], api.get(rid), rid == main, gtfs, ctx, lines, stops_info, stats)
                variants.append(v)
                d = dirs[seq]
                # 方向嘅站點列表：主走法優先，冇就用班次最多嗰個（order 已經咁排）
                directions.setdefault(d, v['stops'])
                for _, sid, nc, ne, lat, lng in pat['stops']:   # 路線檔站名：主走法嘅寫法優先
                    route_stops.setdefault(sid, {'nameTc': nc, 'nameEn': ne, 'lat': lat, 'lng': lng})
                for sid in dict.fromkeys(s for s in v['stops'] if s in boardable):   # 終點站唔列（循環線總站照列）
                    by_stop[sid].append(('gmb', key, d))
        disambiguate(variants, ctx['_parts'])
        m1 = pats[(main, min(rids[main]))]
        orig, dest, orig_en, dest_en, _, _ = variant_names(m1, min(rids[main]), api.get(main))
        data = {
            'company': 'GMB', 'companies': ['GMB'], 'route': key, 'region': region, 'code': code,
            'joyYou': True,
            'origTc': orig, 'destTc': dest, 'origEn': orig_en or None, 'destEn': dest_en or None,
            'stops': {s: route_stops[s] for s in sorted(route_stops)},
            'directions': {d: directions[d] for d in ('O', 'I') if d in directions},
            'ctbOnlyStops': [], 'variants': variants,
        }
        json.dump(data, open(f'{B.OUT}/gmb/{key}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'co': 'gmb', 'companies': ['GMB'], 'route': key, 'region': region, 'code': code,
                      'origTc': orig, 'destTc': dest, 'dirs': sorted(data['directions'], reverse=True),
                      'variants': len(variants), 'special': sum(v['special'] for v in variants)})
        stats['routes'] += 1
        stats['variants'] += len(variants)
        stats['sched'] += sum(bool(v['schedules']) for v in variants)
        stats['fare'] += sum(bool(v['fares']) for v in variants)
        stats['rep'] += sum(len(v['stops']) < len(pats[(v['gmb']['routeId'], v['gmb']['routeSeq'])]['stops']) for v in variants)

    # stops.json：r = [co, 路線, 方向, 往邊度]；往邊度同 core gmbEtas 一樣：O 用路線 destTc、I 用 origTc
    dest_of = {r['route']: (r['destTc'], r['origTc']) for r in index}
    out_stops = collections.defaultdict(list)
    for sid, rs in by_stop.items():
        for co, key, d in dict.fromkeys(rs):
            out_stops[sid].append([co, key, d, dest_of[key][0 if d == 'O' else 1] or ''])
    ctx['used_services'].update(ctx['_services'])
    # 缺咗嘅可選來源：check.py 唔比較受影響嘅數量（例如冇 CSDI 就冇走線），免得阻住成個發佈
    missing = [n for n, ok in (('gmb_routes.json', bool(api)), ('csdi_gmb_lines.json', bool(lines))) if not ok]
    if missing:
        os.makedirs(f'{B.OUT}/report', exist_ok=True)
        open(f'{B.OUT}/report/gmb_missing.txt', 'w', encoding='utf-8').write('\n'.join(missing) + '\n')
    print(f"專線小巴路線 {stats['routes']}，走法 {stats['variants']}，有時間表 {stats['sched']}，"
          f"有走線 {stats['line']}（有 CSDI 但切唔到 {stats['noLine']}），有車費 {stats['fare']}"
          f"（GTFS 未跟加價、按全程車費比例調整 {stats['fareScaled']}），有重複站 {stats['rep']}，"
          f"站 {len(out_stops)}；API 走法名 {sum(1 for r in {k[0] for k in pats} if r in api)}/{len({k[0] for k in pats})}")
    return index, out_stops, stops_info
