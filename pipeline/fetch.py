"""步驟 1：下載所有原始數據到 pipeline/cache/
- 政府 GTFS（走法、時間表、日曆）
- 運輸署路線資料 JSON_BUS.json（specialType 特別班標記）
- CSDI 巴士路線走線（MultiLineString）
- 城巴 API：路線、路線站點、站點
- 九巴 API：路線、路線站點、站點
- 新大嶼山巴士、港鐵巴士：路線、站點、車費
- 港鐵巴士走線：OpenStreetMap（政府 CSDI 冇港鐵巴士走線；ODbL，要註明「© OpenStreetMap 貢獻者」）
- 站到站平均行車時間（hk-bus-time-between-stops）
用法: python3 pipeline/fetch.py [--skip-existing]

data.gov.hk（rt.data.gov.hk）冇公開請求上限，但同一個 IP 問得太密會回 403（2026-11-08 喺 VPS 用 32 條線程即刻俾人擋）。
所以所有去 rt.data.gov.hk 嘅請求共用一個限速（RT_RPS，預設每秒 8 個），403／429 會等耐啲再試。
城巴站資料（站名、座標）好少變：設定 CTB_STOP_CACHE（例如 /state/ctb-stops.json）就重用上次嘅，
每次只問新站，同埋最舊嘅 CTB_STOP_REFRESH 個（預設 400）。
"""
import io, json, os, sys, time, zipfile, threading, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
SKIP = '--skip-existing' in sys.argv
UA = {'User-Agent': 'hk-next-transit-pipeline/0.1'}
RT_RPS = float(os.environ.get('RT_RPS', '8'))
CTB_STOP_CACHE = os.environ.get('CTB_STOP_CACHE')
CTB_STOP_REFRESH = int(os.environ.get('CTB_STOP_REFRESH', '400'))


class RateLimit:
    """所有線程共用：每秒最多 rps 個請求（平均分佈，唔會一下子衝出去）"""

    def __init__(self, rps):
        self.gap = 1 / rps
        self.next = 0.0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            t = max(now, self.next)
            self.next = t + self.gap
        if t > now:
            time.sleep(t - now)


RT_LIMIT = RateLimit(RT_RPS)

GTFS_URL = 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip'
TD_BUS_URL = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
CSDI_WFS = ('https://portal.csdi.gov.hk/server/services/common/td_rcd_1638844988873_41214/MapServer/WFSServer'
            '?service=wfs&version=2.0.0&request=GetFeature&typenames=csdi:FB_ROUTE_LINE&outputFormat=geojson')
CTB = 'https://rt.data.gov.hk/v2/transport/citybus'
# 九巴：有「全部」endpoint，三次 call 就攞晒
KMB = 'https://data.etabus.gov.hk/v1/transport/kmb'
NLB = 'https://rt.data.gov.hk/v2/transport/nlb'
MTRB_CSV = 'https://opendata.mtr.com.hk/data'
# OpenStreetMap：港鐵巴士 network relation，再加冇入 network 嘅接駁巴士 route_master（K12、K14）
OSM_API = 'https://api.openstreetmap.org/api/0.6'
# 地區名（首頁大字「青衣」「香港仔」「雞地」）：OSM place 節點，經 Overpass 攞；幾個鏡像輪流試，全部失敗就用 repo 入面嘅 places_seed.json
OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
OSM_PLACES_QUERY = '[out:json][timeout:100];node(22.15,113.82,22.57,114.45)[place~"^(suburb|quarter|neighbourhood|town|village)$"];out;'
OSM_MTRB_NETWORK = 6482279
OSM_MTRB_EXTRA_MASTERS = [8024265, 8024263]
# 站到站平均行車時間（秒），由 HK-Bus-ETA/hk-bus-time-between-stops 計算，每小時更新
# 格式：{ 起點站ID: { 下一站ID: 秒 } }，城巴用城巴站 ID。只用數據，冇用佢嘅（GPL）程式碼。
JOURNEY_TIMES_URL = 'https://timeinterval.hkbuseta.com/times/all.json'


def http(url, timeout=120, tries=6):
    limited = 'rt.data.gov.hk' in url
    for i in range(tries):
        if limited:
            RT_LIMIT.wait()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            err = e
            # 403／429 = 問得太密：等耐啲（5、10、20、40、80 秒），唔好即刻再撞
            time.sleep(5 * 2 ** i if e.code in (403, 429) else 0.5 * 2 ** i)
        except Exception as e:  # 網絡唔穩定時重試
            err = e
            time.sleep(0.5 * 2 ** i)
    raise RuntimeError(f'下載失敗 {url}: {err}')


def done(path):
    return SKIP and os.path.exists(path)


def fetch_gtfs():
    out = os.path.join(CACHE, 'gtfs')
    if done(os.path.join(out, 'trips.txt')):
        return
    zipfile.ZipFile(io.BytesIO(http(GTFS_URL, 600))).extractall(out)
    print('GTFS ok')


def fetch_td_bus():
    path = os.path.join(CACHE, 'td_bus.json')
    if done(path):
        return
    open(path, 'wb').write(http(TD_BUS_URL, 600))
    print('JSON_BUS ok')


def fetch_csdi_lines():
    path = os.path.join(CACHE, 'csdi_lines.json')
    if done(path):
        return
    feats, page = [], 500
    while True:
        d = json.loads(http(f'{CSDI_WFS}&count={page}&startIndex={len(feats)}', 600))
        feats += d['features']
        if len(d['features']) < page:
            break
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(path, 'w'))
    print('CSDI 走線', len(feats))


def fetch_kmb():
    path = os.path.join(CACHE, 'kmb.json')
    if done(path):
        return
    get = lambda u: json.loads(http(u, 120))['data']
    data = {'route': get(f'{KMB}/route/'), 'route_stop': get(f'{KMB}/route-stop/'), 'stop': get(f'{KMB}/stop/')}
    json.dump(data, open(path, 'w'), ensure_ascii=False)
    print('九巴', len(data['route']), '路線（連 service_type）', len(data['route_stop']), '路線站點', len(data['stop']), '站')


def fetch_nlb():
    """新大嶼山巴士：路線列表，再逐個 routeId 攞站（每個 routeId 已經係一個方向或者走法，站有車費）"""
    path = os.path.join(CACHE, 'nlb.json')
    if done(path):
        return
    routes = json.loads(http(f'{NLB}/route.php?action=list', 60))['routes']
    with ThreadPoolExecutor(4) as ex:  # rt.data.gov.hk：同城巴共用限速
        stops = list(ex.map(lambda r: json.loads(http(f"{NLB}/stop.php?action=list&routeId={r['routeId']}", 60))['stops'], routes))
    json.dump({'routes': routes, 'stops': {str(r['routeId']): s for r, s in zip(routes, stops)}},
              open(path, 'w'), ensure_ascii=False)
    print('新大嶼山巴士', len(routes), 'routeId')


def fetch_mtrb():
    """港鐵巴士及接駁巴士：路線、車站、車費（三個 CSV）"""
    path = os.path.join(CACHE, 'mtrb.json')
    if done(path):
        return
    import csv as _csv
    out = {}
    for name in ('mtr_bus_routes', 'mtr_bus_stops', 'mtr_bus_fares'):
        text = http(f'{MTRB_CSV}/{name}.csv', 60).decode('utf-8-sig')
        out[name] = list(_csv.DictReader(io.StringIO(text)))
    json.dump(out, open(path, 'w'), ensure_ascii=False)
    print('港鐵巴士', len(out['mtr_bus_routes']), '路線', len(out['mtr_bus_stops']), '路線站點')


def fetch_osm_mtrb():
    """港鐵巴士走線（OSM route relation）：每條 relation 存 tags 同按次序嘅 way（座標 + 頭尾 node ID）"""
    path = os.path.join(CACHE, 'osm_mtrb.json')
    if done(path):
        return
    get = lambda x: json.loads(http(f'{OSM_API}/{x}', 60))['elements']
    net = get(f'relation/{OSM_MTRB_NETWORK}.json')[0]
    masters = [m['ref'] for m in net['members'] if m['type'] == 'relation'] + OSM_MTRB_EXTRA_MASTERS
    with ThreadPoolExecutor(4) as ex:   # OSM API 唔好問得太密
        rids = sorted({m['ref'] for ms in ex.map(lambda i: get(f'relation/{i}.json')[0]['members'], dict.fromkeys(masters))
                       for m in ms if m['type'] == 'relation'})

        def full(rid):
            els = get(f'relation/{rid}/full.json')
            nodes = {e['id']: [e['lon'], e['lat']] for e in els if e['type'] == 'node'}
            ways = {e['id']: e['nodes'] for e in els if e['type'] == 'way'}
            rel = next(e for e in els if e['type'] == 'relation' and e['id'] == rid)
            return {'id': rid, 'tags': rel.get('tags', {}),
                    'ways': [{'n': [ways[m['ref']][0], ways[m['ref']][-1]], 'c': [nodes[n] for n in ways[m['ref']]]}
                             for m in rel['members'] if m['type'] == 'way' and m['role'] in ('', 'forward', 'backward') and m['ref'] in ways]}
        routes = list(ex.map(full, rids))
    json.dump({'routes': routes}, open(path, 'w'), ensure_ascii=False)
    print('OSM 港鐵巴士走線', len(routes), '條')


def fetch_osm_places():
    """地區名：OSM place 節點（中文名、英文名、種類、座標）。第三方：攞唔到就用 places_seed.json，唔好令 pipeline 失敗"""
    path = os.path.join(CACHE, 'osm_places.json')
    if done(path):
        return
    import urllib.parse
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': OSM_PLACES_QUERY}).encode(), headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            places = [{'n': t.get('name:zh-Hant') or t.get('name:zh-HK') or t.get('name:zh') or t.get('name'), 'en': t.get('name:en'),
                       't': t['place'], 'lat': e['lat'], 'lng': e['lon']} for e in data['elements'] for t in [e.get('tags', {})]]
            places = [p for p in places if p['n']]
            if len(places) < 500:
                raise RuntimeError(f'太少：{len(places)}')
            json.dump({'places': places}, open(path, 'w'), ensure_ascii=False)
            print('OSM 地區名', len(places), '個')
            return
        except Exception as e:
            print('OSM 地區名下載失敗', url, e)
    print('OSM 地區名全部鏡像失敗，build 時用 places_seed.json')


def fetch_journey_times():
    path = os.path.join(CACHE, 'journey_times.json')
    if done(path):
        return
    try:
        data = http(JOURNEY_TIMES_URL, 120)
        json.loads(data)  # 確認係有效 JSON 先寫
        open(path, 'wb').write(data)
        print('行車時間 ok')
    except Exception as e:  # 第三方數據：攞唔到就用舊嘅或者用距離估算，唔好令成個 pipeline 失敗
        print('行車時間下載失敗，build 時會用距離估算：', e)


def fetch_ctb():
    path = os.path.join(CACHE, 'ctb.json')
    if done(path):
        return
    get = lambda u: json.loads(http(u, 30))['data']
    routes = get(f'{CTB}/route/ctb')
    jobs = [f'{CTB}/route-stop/CTB/{r["route"]}/{d}' for r in routes for d in ('inbound', 'outbound')]
    # 線程數細：真正限速靠 RT_LIMIT（data.gov.hk 同一個 IP 問得太密會 403）
    with ThreadPoolExecutor(6) as ex:
        rs = [x for lst in ex.map(get, jobs) if lst for x in lst]
    ids = sorted({x['stop'] for x in rs})

    # 站資料：重用上次（CTB_STOP_CACHE），只問新站同最舊嘅一批
    known = {}
    if CTB_STOP_CACHE and os.path.exists(CTB_STOP_CACHE):
        try:
            known = json.load(open(CTB_STOP_CACHE))
        except Exception as e:
            print('城巴站 cache 讀唔到，全部重新下載：', e)
    missing = [s for s in ids if s not in known]
    stale = sorted((s for s in ids if s in known), key=lambda s: known[s].get('at', 0))[:CTB_STOP_REFRESH]
    todo = missing + stale
    with ThreadPoolExecutor(6) as ex:
        got = list(ex.map(lambda s: get(f'{CTB}/stop/{s}'), todo))
    now = int(time.time())
    for s, d in zip(todo, got):
        if d:
            known[s] = {'at': now, 'data': d}
    stops = [known[s]['data'] for s in ids if s in known]
    if CTB_STOP_CACHE:
        try:  # cache 寫唔到（例如 /state 冇寫入權限）唔好令成個更新失敗
            tmp = CTB_STOP_CACHE + '.tmp'
            json.dump({s: known[s] for s in ids if s in known}, open(tmp, 'w'), ensure_ascii=False)
            os.replace(tmp, CTB_STOP_CACHE)
        except OSError as e:
            print('城巴站 cache 寫唔到：', e)
    json.dump({'route': routes, 'route_stop': rs, 'stop': stops},
              open(path, 'w'), ensure_ascii=False)
    print('城巴', len(routes), '路線', len(rs), '路線站點', len(ids), '站（今次問咗', len(todo), '個，其餘用 cache）')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    t = time.time()
    ths = [threading.Thread(target=f) for f in (fetch_gtfs, fetch_td_bus, fetch_csdi_lines, fetch_ctb, fetch_kmb, fetch_nlb, fetch_mtrb, fetch_osm_mtrb, fetch_osm_places, fetch_journey_times)]
    for th in ths: th.start()
    for th in ths: th.join()
    print(f'完成 {time.time() - t:.0f}s')
