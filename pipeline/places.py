"""地區名（首頁大字「青衣」「香港仔」「雞地」）：OSM place 節點 → out/places.json。

只留香港嘅：離我哋最近嘅巴士站 800 米內（深圳嘅點唔會咁近），同埋拎走簡體名（深圳界外漏網）。
cache 冇（Overpass 攞唔到）就用 repo 入面嘅 places_seed.json。
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
KEEP = {'suburb', 'quarter', 'neighbourhood', 'town', 'village'}
# 常見簡體字：名入面有就當深圳（香港用繁體）；「XX社區」亦係深圳嘅叫法
SIMPLIFIED = set('湾长区门东龙马头岭园医厦广场乡镇围头岗台丰汇岛发观罗凤宁庄阳贝坝桥')


def _metres(a, b):
    dy = (a[0] - b[0]) * 111320
    dx = (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def build_places(all_stops, out_dir):
    path = os.path.join(HERE, 'cache', 'osm_places.json')
    if not os.path.exists(path):
        path = os.path.join(HERE, 'places_seed.json')
    places = json.load(open(path, encoding='utf-8'))['places']
    # 站點格網（約 1 公里一格），快啲搵附近有冇站
    grid = {}
    for s in all_stops:
        grid.setdefault((round(s['lat'] * 100), round(s['lng'] * 100)), []).append((s['lat'], s['lng']))

    def near_stop(lat, lng, limit=800):
        gy, gx = round(lat * 100), round(lng * 100)
        return any(_metres((lat, lng), p) <= limit for dy in (-1, 0, 1) for dx in (-1, 0, 1) for p in grid.get((gy + dy, gx + dx), ()))

    out, seen = [], set()
    for p in places:
        n = (p.get('n') or '').split(' ')[0].strip()  # 「桃源洞 To Yuen Tung」→ 桃源洞
        if p.get('t') not in KEEP or not n or any(c in SIMPLIFIED for c in n) or n.endswith('社區'):
            continue
        key = (n, round(p['lat'], 3), round(p['lng'], 3))
        if key in seen or not near_stop(p['lat'], p['lng']):
            continue
        seen.add(key)
        out.append({'n': n, 'en': p.get('en') or None, 't': p['t'], 'lat': round(p['lat'], 5), 'lng': round(p['lng'], 5)})
    json.dump({'places': out}, open(os.path.join(out_dir, 'places.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('地區名', len(out), '個')
    return len(out)
