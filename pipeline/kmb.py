"""九巴（連龍運）數據：由 build.py 呼叫。

九巴同城巴唔同：九巴 API 本身用 bound + service_type 區分走法（service_type 1 = 正常，其他 = 特別班），
所以直接用九巴嘅走法，再配對最似嘅政府走法，攞返名稱、特別班標記、時間表同走線。

聯營線（政府 agency 有 CTB 同 KMB/LWB，例如 101）放喺城巴嘅路線檔：
build.py 處理完城巴之後呼叫 attach_joint()，為每個走法加九巴嘅 bound + service_type，每個站加九巴站 ID。
注意九巴同城巴嘅「去程」定義可以相反（101：九巴 O = 觀塘→堅尼地城，城巴 O = 堅尼地城→觀塘），
所以一律用站點配對，唔好假設方向一樣。
"""
import collections, json, os, re

import build as B

# 九巴站名後面嘅編號，例如「竹園邨總站 (WT916)」
KMB_CODE = re.compile(r'\s*[(（][A-Z]{1,4}\d{1,4}[)）]\s*$')


def clean(name):
    return KMB_CODE.sub('', name or '').strip()


def load_kmb():
    k = json.load(open(f'{B.CACHE}/kmb.json', encoding='utf-8'))
    stops = {s['stop']: {'nameTc': clean(s['name_tc']), 'nameEn': clean(s['name_en']).title(),
                         'lat': round(float(s['lat']), 6), 'lng': round(float(s['long']), 6)} for s in k['stop']}
    lists = collections.defaultdict(list)
    for r in sorted(k['route_stop'], key=lambda r: int(r['seq'])):
        if r['stop'] in stops:
            lists[(r['route'], r['bound'], r['service_type'])].append(r['stop'])
    info = {(r['route'], r['bound'], r['service_type']): r for r in k['route']}
    return info, stops, lists


def best_kmb(gs, rno, klists, kstops):
    """政府走法最似邊個九巴走法（route, bound, service_type）；覆蓋少過一半當配唔到"""
    keys = [k for k in klists if k[0] == rno]
    if not keys:
        return None, None
    key, m = max(((k, B.align(gs, klists[k], kstops)) for k in keys), key=lambda x: B.match_score(x[1]))
    if len(m) / len(gs) < 0.5:
        return None, None
    return key, m


def attach_joint(vs, rno, kmb):
    """
    聯營線（城巴路線檔）：每個走法加九巴嘅 bound + service_type；回傳 {城巴站 ID: 九巴站 ID}。
    vs 每個走法要有 _gs（政府站點）。
    """
    _, kstops, klists = kmb
    ctb_to_kmb = {}
    for v in vs:
        key, m = best_kmb(v['_gs'], rno, klists, kstops)
        if not key:
            continue
        v['kmb'] = {'bound': key[1], 'serviceType': key[2]}
        for i, ctb in enumerate(v['stops']):
            if ctb and i in m:
                ctb_to_kmb.setdefault(ctb, klists[key][m[i][0]])
    return ctb_to_kmb


def same_ends(a, b):
    """兩對起訖點係咪一樣（次序唔理；一邊包含另一邊都算，例如「小西灣運動場」同「小西灣」）"""
    def eq(x, y):
        return x and y and (x == y or x in y or y in x)
    (a1, a2), (b1, b2) = a, b
    return (eq(a1, b1) and eq(a2, b2)) or (eq(a1, b2) and eq(a2, b1))


def joint_by_ends(ctb_routes, kmb):
    """
    政府數據冇標聯營、但城巴同九巴都有同一個號碼而且起訖點一樣嘅路線（例如 101R、102R、X1）。
    號碼一樣但起訖點唔同嘅（例如城巴 1 同九巴 1）係兩條唔同路線，唔算。
    """
    info = kmb[0]
    n = lambda x: B.norm(clean(x or ''))
    ends = collections.defaultdict(list)
    for (rno, _, _), r in info.items():
        ends[rno].append((n(r['orig_tc']), n(r['dest_tc'])))
    return {r['route'] for r in ctb_routes
            if any(same_ends((n(r['orig_tc']), n(r['dest_tc'])), e) for e in ends.get(r['route'], []))}


def attach_ctb(variants, rno, kstops, ctb):
    """
    九巴做主幹嘅聯營線（政府冇城巴走法資料，例如 101R）：每個九巴走法配對城巴方向，回傳 {九巴站: 城巴站}。
    ctb = (cstops, clists)
    """
    cstops, clists = ctb
    kmb_to_ctb = {}
    for v in variants:
        pseudo = [{'names': {B.norm(kstops[s]['nameTc'])}, 'pos': (kstops[s]['lat'], kstops[s]['lng'])} for s in v['stops']]
        best = None
        for d in ('O', 'I'):
            l = clists.get((rno, d))
            if not l:
                continue
            m = B.align(pseudo, l, cstops)
            if not best or B.match_score(m) > B.match_score(best[1]):
                best = (d, m, l)
        if not best or len(best[1]) / len(v['stops']) < 0.5:
            continue
        d, m, l = best
        v['ctb'] = {'dir': d}
        for i, s in enumerate(v['stops']):
            if i in m:
                kmb_to_ctb.setdefault(s, l[m[i][0]])
    return kmb_to_ctb


def company_of(agency):
    return 'LWB' if 'LWB' in agency else 'KMB'


def build_kmb(ctx):
    """
    九巴／龍運自己嘅路線（唔包聯營線）：輸出 out/kmb/<路線>.json。
    ctx：special、lines、journey、freq、used_services（會加入用到嘅 serviceId）、joint（聯營路線號碼，要跳過）
    回傳 (路線索引項目, {九巴站: [[co, route, dir, dest]]})
    """
    info, kstops, klists = ctx['kmb']
    groutes, gtrips, first, gst, freq, gstops_all = B.load_gtfs(lambda a: ('KMB' in a or 'LWB' in a) and 'CTB' not in a)

    # 每個九巴走法配對最似嘅政府走法
    gov_for = {}
    for (rid, d), tid in sorted(first.items()):
        rno = groutes[rid]['route_short_name']
        if rno in ctx['joint']:
            continue
        rows = sorted(gst[tid], key=lambda r: int(r['stop_sequence']))
        gs = B.gov_stops(rows, gstops_all)
        key, m = best_kmb(gs, rno, klists, kstops)
        if not key:
            continue
        score = B.match_score(m) / max(len(gs), len(klists[key]))
        if key not in gov_for or score > gov_for[key]['score']:
            gov_for[key] = {'rid': rid, 'd': d, 'score': score, 'agency': groutes[rid]['agency_id'],
                            'name': groutes[rid]['route_long_name']}

    os.makedirs(f'{B.OUT}/kmb', exist_ok=True)
    index, by_stop = [], collections.defaultdict(list)
    by_route = collections.defaultdict(list)
    for key in klists:
        if key[0] not in ctx['joint']:
            by_route[key[0]].append(key)

    for rno, keys in sorted(by_route.items()):
        keys.sort(key=lambda k: (k[1] != 'O', int(k[2])))
        variants, rstops = [], set()
        companies = set()
        for key in keys:
            _, bound, st = key
            stops = klists[key]
            gov = gov_for.get(key)
            kinfo = info.get(key, {})
            companies.add(company_of(gov['agency']) if gov else 'KMB')
            v = {
                'id': f'{bound}{st}',
                'govRouteId': gov['rid'] if gov else None,
                'govDir': gov['d'] if gov else None,
                'name': gov['name'] if gov else f"{kinfo.get('orig_tc', '')} - {kinfo.get('dest_tc', '')}",
                # 九巴 service_type 1 = 正常，其他 = 特別班；政府有標記就跟政府
                'special': ctx['special'].get(gov['rid'], st != '1') if gov else st != '1',
                'stops': stops,
                'stopDirs': [bound] * len(stops),
                'stopMatch': ['A'] * len(stops),
                'expSeq': {},
                'kmb': {'bound': bound, 'serviceType': st},
                'schedules': [],
                'line': None,
                'lineAligned': False,
            }
            for i, s in enumerate(stops):
                v['expSeq'].setdefault(f'{bound}:{s}', i + 1)
            if gov:
                sched = B.variant_schedule(gtrips[(gov['rid'], gov['d'])], freq)
                ctx['used_services'].update(sched)
                v['schedules'] = [{'serviceId': k, 'departures': sorted(x)} for k, x in sorted(sched.items())]
                seg = ctx['lines'].get((gov['rid'], gov['d']))
                v['line'] = [B.simplify(x) for x in seg] if seg else None
            v['segSeconds'], v['segMeasured'] = B.segment_times(v, kstops, ctx['journey'])
            # 由總站開出到每個站嘅秒數：用行車時間累計
            acc = [0]
            for x in v['segSeconds']:
                acc.append(acc[-1] + x)
            v['offsets'] = acc
            variants.append(v)
            rstops.update(stops)

        # 每個方向用 service_type 最細（通常係 1 = 正常）嗰個做預設站點列表
        directions = {}
        for key in keys:
            directions.setdefault(key[1], klists[key])
        main = info.get(keys[0], {})
        route_stops = {s: dict(kstops[s]) for s in sorted(rstops)}
        if rno in ctx.get('joint_kmb_primary', set()):
            for ks, cs in attach_ctb(variants, rno, kstops, ctx['ctb']).items():
                route_stops[ks]['ctb'] = cs
            if any('ctb' in v for v in variants):
                companies.add('CTB')
                ctx['kmb_primary_done'].add(rno)
        co = sorted(companies)
        data = {
            'company': 'KMB', 'companies': co, 'route': rno,
            'origTc': clean(main.get('orig_tc')), 'destTc': clean(main.get('dest_tc')),
            'origEn': main.get('orig_en', '').title(), 'destEn': main.get('dest_en', '').title(),
            'stops': route_stops,
            'directions': directions,
            'ctbOnlyStops': [],
            'variants': variants,
        }
        json.dump(data, open(f'{B.OUT}/kmb/{rno}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'co': 'kmb', 'companies': co, 'route': rno, 'origTc': data['origTc'], 'destTc': data['destTc'],
                      'dirs': sorted(directions, reverse=True), 'variants': len(variants),
                      'special': sum(v['special'] for v in variants)})
        for d, l in directions.items():
            dest = kstops[l[-1]]['nameTc'] if l else ''
            for sid in dict.fromkeys(l[:-1]):  # 終點站唔使列
                by_stop[sid].append(['kmb', rno, d, dest])

    print(f'九巴／龍運路線 {len(index)}（唔計聯營），配到政府走法嘅九巴走法 {len(gov_for)}')
    return index, by_stop, kstops
