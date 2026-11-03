"""新大嶼山巴士（NLB）同港鐵巴士（MTRB）：由 build.py 呼叫。

兩間公司都有自己清楚嘅走法，唔使好似城巴咁推斷：
- NLB：每個 routeId 已經係一個方向或者走法（例如 3M 有 3 個 routeId），站點列表有每站車費。
  ETA 用 routeId + stopId 查。
- MTRB：路線 CSV 每行一個 REFERENCE_ID（例如 506、506-1），車站 CSV 分 O／I。
  ETA 一次 call 攞晒成條線（routeName = ROUTE_ID），用 lineRef 分方向：O = LINE_UP、I = LINE_DOWN。

同九巴一樣，用營辦商自己嘅站 ID，再配對最似嘅政府走法攞時間表同走線。
"""
import collections, json, math, os, re

import build as B


def gov_variants(rnos):
    """政府 GTFS 入面呢啲路線號碼嘅所有走法：{路線號碼: [(rid, d, 政府站點, trips)]}"""
    groutes, gtrips, first, gst, freq, gstops_all = B.load_gtfs(
        lambda a: a in ('NLB', 'LRTFeeder', 'KMB') or a.startswith('NLB'))
    out = collections.defaultdict(list)
    for (rid, d), tid in first.items():
        rno = groutes[rid]['route_short_name']
        if rno not in rnos:
            continue
        rows = sorted(gst[tid], key=lambda r: int(r['stop_sequence']))
        out[rno].append((rid, d, B.gov_stops(rows, gstops_all), gtrips[(rid, d)], groutes[rid]['route_long_name']))
    return out, freq


def best_gov(op_stops, cands, stops_info):
    """營辦商走法最似邊個政府走法；回傳 (rid, d, gs, trips, name, {政府 index: (營辦商 index, ...)}) 或者 None"""
    best = None
    for rid, d, gs, trips, name in cands:
        m = B.align(gs, op_stops, stops_info)
        if len(m) / max(len(gs), 1) < 0.5:
            continue
        score = B.match_score(m) / max(len(gs), len(op_stops))
        if not best or score > best[0]:
            best = (score, (rid, d, gs, trips, name, m))
    return best[1] if best else None


def finish_variant(v, stops_info, gov, freq, ctx):
    """補時間表、走線、行車時間、offsets（同九巴一樣）"""
    if gov:
        rid, d, gs, trips, name, m = gov
        v['govRouteId'], v['govDir'] = rid, d
        sched = B.variant_schedule(trips, freq)
        ctx['used_services'].update(sched)
        v['schedules'] = [{'serviceId': k, 'departures': sorted(x)} for k, x in sorted(sched.items())]
        seg = ctx['lines'].get((rid, d))
        v['line'] = [B.simplify(x) for x in seg] if seg else None
        v['lineAligned'] = bool(seg) and len(seg) == len(v['stops']) - 1
    v['segSeconds'], v['segMeasured'] = B.segment_times(v, stops_info, ctx['journey'])
    acc = [0]
    for x in v['segSeconds']:
        acc.append(acc[-1] + x)
    v['offsets'] = acc


def base_variant(stops, dir_, vid, name, special):
    return {
        'id': vid, 'govRouteId': None, 'govDir': None, 'name': name, 'special': special,
        'stops': stops, 'stopDirs': [dir_] * len(stops), 'stopMatch': ['A'] * len(stops),
        'expSeq': {f'{dir_}:{s}': i + 1 for i, s in reversed(list(enumerate(stops)))},
        'schedules': [], 'line': None, 'lineAligned': False,
    }


def write_route(co, rno, data, index, by_stop, stops_info):
    os.makedirs(f'{B.OUT}/{co}', exist_ok=True)
    json.dump(data, open(f'{B.OUT}/{co}/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    index.append({'co': co, 'companies': data['companies'], 'route': rno, 'origTc': data['origTc'], 'destTc': data['destTc'],
                  'dirs': sorted(data['directions'], reverse=True), 'variants': len(data['variants']),
                  'special': sum(v['special'] for v in data['variants'])})
    for d, l in data['directions'].items():
        dest = stops_info[l[-1]]['nameTc'] if l else ''
        for sid in dict.fromkeys(l[:-1]):   # 終點站唔使列
            by_stop[sid].append([co, rno, d, dest])


# ---------------- 新大嶼山巴士 ----------------
def split_name(name):
    """「梅窩碼頭 > 東涌站巴士總站」-> ('梅窩碼頭', '東涌站巴士總站')"""
    a, _, b = name.partition('>')
    return a.strip(), b.strip()


def plain(name):
    """拎走括號：「大澳 (水口開)」-> 大澳"""
    return B.norm(re.sub(r'[(（][^)）]*[)）]', '', name))


def build_nlb(ctx):
    raw = json.load(open(f'{B.CACHE}/nlb.json', encoding='utf-8'))
    stops_info = {}
    for lst in raw['stops'].values():
        for s in lst:
            stops_info.setdefault(str(s['stopId']), {
                'nameTc': s['stopName_c'], 'nameEn': s['stopName_e'],
                'lat': round(float(s['latitude']), 6), 'lng': round(float(s['longitude']), 6)})
    by_no = collections.defaultdict(list)
    for r in raw['routes']:
        by_no[r['routeNo']].append(r)
    govs, freq = gov_variants(set(by_no))
    index, by_stop = [], collections.defaultdict(list)
    for rno, rs in sorted(by_no.items()):
        rs.sort(key=lambda r: r['routeId'])
        base_from, base_to = split_name(rs[0]['routeName_c'])
        variants, directions, allstops = [], {}, set()
        cands = govs.get(rno, [])
        # NLB 一個 routeId 嘅站點列表會合埋幾個政府走法（例如 11 號經／唔經懲教所），
        # 所以好似城巴咁：每個政府走法配去最似嘅 routeId，一個 routeId 有幾個就拆開做幾個走法
        lists = {r['routeId']: [str(s['stopId']) for s in raw['stops'][str(r['routeId'])]] for r in rs}
        owner = {}
        for c in cands:
            best = None
            for r in rs:
                sids = lists[r['routeId']]
                m = B.align(c[2], sids, stops_info)
                if len(m) / max(len(c[2]), 1) < 0.8:
                    continue
                score = B.match_score(m) / max(len(c[2]), len(sids))
                if not best or score > best[0]:
                    best = (score, r['routeId'], m)
            if best:
                owner.setdefault(best[1], []).append(c + (best[2],))
        for r in rs:
            a, b = split_name(r['routeName_c'])
            dir_ = 'O' if plain(b) == plain(base_to) or plain(a) == plain(base_from) else 'I'
            lst = raw['stops'][str(r['routeId'])]
            sids = lists[r['routeId']]
            # 車費 "0.0" 即係冇資料（例如馬場線 1R），唔好顯示 $0
            fares = {str(s['stopId']): float(s['fare']) for s in lst[:-1] if s.get('fare') not in (None, '') and float(s['fare']) > 0}
            r_special = bool(r['specialRoute']) or bool(re.search(r'[(（]', r['routeName_c']))
            # 同一組站嘅政府走法（例如上課日／非上課日）併埋，時間表合併
            groups = {}
            for rid, d, gs, trips, gname, m in owner.get(r['routeId'], []):
                key = tuple(sorted(j for j, *_ in m.values()))
                groups.setdefault(key, []).append((rid, d, gs, trips, gname, m))
            groups = sorted(groups.items(), key=lambda kv: -sum(len(x[3]) for x in kv[1]))
            parts = []
            if len(groups) <= 1:
                parts.append((sids, r['routeName_c'].replace(' > ', ' - '), r_special, groups[0][1] if groups else []))
            else:
                for key, gl in groups:
                    main = max(gl, key=lambda x: len(x[3]))
                    # 名用 NLB 自己嘅（方向啱），再加政府走法嘅括號（例如「(經北大嶼山醫院)」）
                    paren = re.search(r'[(（][^)）]*[)）]\s*$', main[4])
                    gname = r['routeName_c'].replace(' > ', ' - ') + (paren.group(0) if paren else '')
                    special = r_special or bool(re.search(r'[(（]', gname))
                    parts.append(([sids[j] for j in key], gname, special, gl))
            for i, (vs, name, special, gl) in enumerate(parts):
                vid = str(r['routeId']) if len(parts) == 1 else f"{r['routeId']}-{gl[0][0]}"
                v = base_variant(vs, dir_, vid, name, special)
                v['nlb'] = {'routeId': str(r['routeId'])}
                via = re.search(r'[(（](經[^)）]*)[)）]', name)
                if via:
                    v['nlb']['via'] = via.group(1)
                v['fares'] = {s: f for s, f in fares.items() if s in vs[:-1]}
                main = max(gl, key=lambda x: len(x[3])) if gl else None
                if main and len(gl) > 1:   # 併埋嘅政府走法：班次合併
                    main = main[:3] + ([t for x in gl for t in x[3]],) + main[4:]
                finish_variant(v, stops_info, main, freq, ctx)
                variants.append(v)
            allstops.update(sids)
            # 每個方向用第一個（最細 routeId，通常係正常）走法做預設站點列表
            if not r_special or dir_ not in directions:
                directions.setdefault(dir_, sids)
        data = {
            'company': 'NLB', 'companies': ['NLB'], 'route': rno,
            'joyYou': B.joyyou_ok(rno, base_from, base_to),
            'origTc': base_from, 'destTc': base_to, 'origEn': None, 'destEn': None,
            'stops': {s: stops_info[s] for s in sorted(allstops)},
            'directions': directions, 'ctbOnlyStops': [], 'variants': variants,
        }
        write_route('nlb', rno, data, index, by_stop, stops_info)
    print(f'新大嶼山巴士路線 {len(index)}（{len(raw["routes"])} 個走法）')
    return index, by_stop, stops_info


# ---------------- 港鐵巴士走線（OpenStreetMap） ----------------
OSM_MAX_STOP_M = 100   # 站離走線超過呢個距離就當走線唔啱（OSM 數據可能舊過實際路線）


def osm_assemble(ways):
    """將 relation 入面按次序嘅 way 駁成一條線（[lng, lat]），每條 way 按需要反轉"""
    path, last = [], None
    for i, w in enumerate(ways):
        c, (a, b) = w['c'], w['n']
        if not path:
            nxt = ways[i + 1]['n'] if i + 1 < len(ways) else []
            if a in nxt and b not in nxt:
                c, a, b = c[::-1], b, a
            path, last = list(c), b
        elif a == last:
            path += c[1:]; last = b
        elif b == last:
            path += c[::-1][1:]; last = a
        else:   # 斷開：揀近啲嗰頭駁
            if B.dist(path[-1][::-1], c[0][::-1]) <= B.dist(path[-1][::-1], c[-1][::-1]):
                path += c; last = b
            else:
                path += c[::-1]; last = a
    return path


class OsmPath:
    """走線用本地米座標，方便計投影同沿線距離"""
    def __init__(self, path):
        self.ll = path
        lat0 = path[0][1]
        self.kx, self.ky = 111320 * math.cos(math.radians(lat0)), 110540
        self.xy = [(x * self.kx, y * self.ky) for x, y in path]
        self.cum = [0.0]
        for (x1, y1), (x2, y2) in zip(self.xy, self.xy[1:]):
            self.cum.append(self.cum[-1] + math.hypot(x2 - x1, y2 - y1))

    def proj(self, k, p):
        """點 p 投影落第 k 段：(距離, t, 沿線米數)"""
        (x1, y1), (x2, y2) = self.xy[k], self.xy[k + 1]
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = 0.0 if not L2 else max(0.0, min(1.0, ((p[0] - x1) * dx + (p[1] - y1) * dy) / L2))
        return math.hypot(x1 + t * dx - p[0], y1 + t * dy - p[1]), t, self.cum[k] + t * math.sqrt(L2)

    def fit(self, pts):
        """站點按次序投影落走線（只准向前）。
        每個站嘅候選 = 走線每一段連續喺 OSM_MAX_STOP_M 內嘅路入面最近嗰點（循環線會經同一條路幾次，就有幾個候選），
        再用 DP 揀沿線位置遞增、總距離最細嘅組合。回傳 (平均距離, [(距離, 段, t, 沿線米數)]) 或者 None"""
        n = len(self.xy) - 1
        cands = []
        for lat, lng in pts:
            q = (lng * self.kx, lat * self.ky)
            runs, cur = [], None
            for k in range(n):
                h = self.proj(k, q)
                if h[0] <= OSM_MAX_STOP_M:
                    if not cur or h[0] < cur[0]:
                        cur = (h[0], k, h[1], h[2])
                elif cur:
                    runs.append(cur); cur = None
            if cur:
                runs.append(cur)
            if not runs:
                return None
            cands.append(runs)
        # dp[i][c] = (總距離, 上一個候選)
        dp = [[(c[0], None) for c in cands[0]]]
        for i in range(1, len(cands)):
            row = []
            for c in cands[i]:
                prev = [(dp[i - 1][j][0], j) for j, pc in enumerate(cands[i - 1])
                        if dp[i - 1][j][0] is not None and pc[3] <= c[3] + 1]
                row.append((min(prev)[0] + c[0], min(prev)[1]) if prev else (None, None))
            dp.append(row)
        last = [(x[0], j) for j, x in enumerate(dp[-1]) if x[0] is not None]
        if not last:
            return None
        total, j = min(last)
        out = []
        for i in range(len(cands) - 1, -1, -1):
            out.append(cands[i][j])
            j = dp[i][j][1]
        out.reverse()
        return total / len(out), out

    def point(self, k, t):
        (x1, y1), (x2, y2) = self.ll[k], self.ll[k + 1]
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]

    def segments(self, hits):
        """相鄰兩個站之間嘅走線（第 i 段 = 第 i 站 → 第 i+1 站）"""
        out = []
        for (_, k1, t1, _), (_, k2, t2, _) in zip(hits, hits[1:]):
            out.append([self.point(k1, t1)] + [list(p) for p in self.ll[k1 + 1:k2 + 1]] + [self.point(k2, t2)])
        return out


def osm_lines():
    """{路線號碼: [OsmPath]}；K53/K58 呢類直通車兩個號碼都放"""
    path = f'{B.CACHE}/osm_mtrb.json'
    if not os.path.exists(path):
        return {}
    out = collections.defaultdict(list)
    for r in json.load(open(path, encoding='utf-8'))['routes']:
        if not r['ways']:
            continue
        p = OsmPath(osm_assemble(r['ways']))
        for ref in r['tags'].get('ref', '').split('/'):
            out[ref.strip()].append(p)
    return out


def fit_line(pts, cands):
    """站點 [(lat, lng)] 揀最夾嘅走線（OsmPath），切做每兩站一段；全部唔夾回傳 None。
    兩站之間沿線距離離譜（兜大圈）就當走線唔啱"""
    best = None
    for p in cands:
        f = p.fit(pts)
        if not f or (best and f[0] >= best[0]):
            continue
        segs = p.segments(f[1])
        if all(B.dist(a, b) * 3 + 500 >= sum(B.dist(x[::-1], y[::-1]) for x, y in zip(sg, sg[1:]))
               for a, b, sg in zip(pts, pts[1:], segs)):
            best = (f[0], segs)
    return [B.simplify(sg) for sg in best[1]] if best else None


def osm_line_for(rno, stop_list, stops_info, lines):
    """揀最啱嘅 OSM 走線：同號碼優先，冇就用同一個基本號碼（K51A -> K51）；站同走線唔夾就唔用"""
    pts = [(stops_info[s]['lat'], stops_info[s]['lng']) for s in stop_list]
    base = re.sub(r'[A-Z]+$', '', rno)
    for cands in (lines.get(rno, []), [p for ref, ps in lines.items() if ref != rno and re.sub(r'[A-Z]+$', '', ref) == base for p in ps]):
        seg = fit_line(pts, cands)
        if seg:
            return seg
    return None


# ---------------- 港鐵巴士 ----------------
def build_mtrb(ctx):
    raw = json.load(open(f'{B.CACHE}/mtrb.json', encoding='utf-8'))
    fares = {r['REFERENCE_ID']: r for r in raw['mtr_bus_fares']}
    stops_by = collections.defaultdict(list)
    stops_info = {}
    for s in raw['mtr_bus_stops']:
        stops_by[(s['REFERENCE_ID'], s['DIRECTION'])].append((int(float(s['STATION_SEQNO'])), s['STATION_ID']))
        stops_info.setdefault(s['STATION_ID'], {
            'nameTc': s['STATION_NAME_CHI'], 'nameEn': s['STATION_NAME_ENG'],
            'lat': round(float(s['STATION_LATITUDE']), 6), 'lng': round(float(s['STATION_LONGITUDE']), 6)})
    by_no = collections.defaultdict(list)
    for r in raw['mtr_bus_routes']:
        by_no[r['ROUTE_ID']].append(r)
    govs, freq = gov_variants(set(by_no))
    osm = osm_lines()
    index, by_stop = [], collections.defaultdict(list)
    for rno, rs in sorted(by_no.items()):
        rs.sort(key=lambda r: (r['REFERENCE_ID'] != rno, r['REFERENCE_ID']))
        variants, directions, allstops = [], {}, set()
        main_from = main_to = None
        for r in rs:
            a, _, b = r['ROUTE_NAME_CHI'].partition('至')
            if main_from is None:
                main_from, main_to = a.strip(), b.strip()
            special = r['REFERENCE_ID'] != rno
            fare = fares.get(r['REFERENCE_ID'], {})
            adult = fare.get('FARE_OCTO_ADULT')
            for dir_, line_ref in (('O', r['LINE_UP']), ('I', r['LINE_DOWN'])):
                lst = [sid for _, sid in sorted(stops_by.get((r['REFERENCE_ID'], dir_), []))]
                if not lst or not line_ref:
                    continue
                name = f"{stops_info[lst[0]]['nameTc']} - {stops_info[lst[-1]]['nameTc']}"
                v = base_variant(lst, dir_, f"{r['REFERENCE_ID']}-{dir_}", name, special)
                v['mtrb'] = {'lineRef': line_ref}
                if adult and adult != '-':
                    v['fares'] = {s: float(adult) for s in lst[:-1]}
                gov = best_gov(lst, govs.get(rno, []), stops_info)
                finish_variant(v, stops_info, gov, freq, ctx)
                if not v['line']:   # 政府 CSDI 冇港鐵巴士走線：用 OpenStreetMap
                    seg = osm_line_for(rno, lst, stops_info, osm)
                    if seg:
                        v['line'], v['lineAligned'], v['lineSource'] = seg, True, 'osm'
                variants.append(v)
                allstops.update(lst)
                if not special or dir_ not in directions:
                    directions.setdefault(dir_, lst)
        if not variants:
            continue
        joy = (fares.get(rs[0]['REFERENCE_ID'], {}).get('FARE_OCTO_JOYU') or '-') != '-'
        data = {
            'company': 'MTRB', 'companies': ['MTRB'], 'route': rno, 'joyYou': joy,
            'origTc': main_from, 'destTc': main_to, 'origEn': None, 'destEn': None,
            'stops': {s: stops_info[s] for s in sorted(allstops)},
            'directions': directions, 'ctbOnlyStops': [], 'variants': variants,
        }
        write_route('mtrb', rno, data, index, by_stop, stops_info)
    print(f'港鐵巴士路線 {len(index)}，走法 {sum(r["variants"] for r in index)}，'
          f'配到政府走法 {sum(1 for r in index for v in json.load(open(f"{B.OUT}/mtrb/{r["route"]}.json"))["variants"] if v["govRouteId"])}，'
          f'OSM 走線 {sum(1 for r in index for v in json.load(open(f"{B.OUT}/mtrb/{r["route"]}.json"))["variants"] if v.get("lineSource") == "osm")}')
    return index, by_stop, stops_info
