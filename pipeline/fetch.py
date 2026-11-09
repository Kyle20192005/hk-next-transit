"""步驟 1：下載所有原始數據到 pipeline/cache/
- 政府 GTFS（走法、時間表、日曆）
- 運輸署路線資料 JSON_BUS.json（specialType 特別班標記）
- CSDI 巴士路線走線（MultiLineString）
- 城巴 API：路線、路線站點、站點
- 九巴 API：路線、路線站點、站點
- 新大嶼山巴士、港鐵巴士：路線、站點、車費
- 港鐵巴士走線：OpenStreetMap（政府 CSDI 冇港鐵巴士走線；ODbL，要註明「© OpenStreetMap 貢獻者」）
- 站到站平均行車時間（hk-bus-time-between-stops）
- 專線小巴（全部可選：失敗只係今次冇小巴，唔會令成個更新失敗）：
  運輸署 JSON_GMB.json（站序、站名、座標、全程車費）、CSDI 專線小巴走線（GMB_ROUTE_LINE）、
  專線小巴 API 路線資料（data.etagmb.gov.hk，走法名稱「正常班次」「特別班次」等）
用法: python3 pipeline/fetch.py [--skip-existing]

data.gov.hk（rt.data.gov.hk）冇公開請求上限，但同一個 IP 問得太密會回 403（2026-11-08 喺 VPS 用 32 條線程即刻俾人擋）。
所以所有去 rt.data.gov.hk 嘅請求共用一個限速（RT_RPS，預設每秒 8 個），403／429 會等耐啲再試。
城巴站資料（站名、座標）好少變：設定 CTB_STOP_CACHE（例如 /state/ctb-stops.json）就重用上次嘅，
每次只問新站，同埋最舊嘅 CTB_STOP_REFRESH 個（預設 400）。
專線小巴 API（data.etagmb.gov.hk）同 tracker 同一個 IP、上限未量：限速 GMB_RPS（預設每秒 3 個）。
設定 GMB_STATE_DIR（VPS：/state/gmb）就記住上次成功嘅小巴檔：路線資料每次只問有改過嘅 route_id
（同埋最耐冇問過嘅 GMB_ROUTE_REFRESH 條，預設 20），任何一個小巴來源下載失敗都用返上次成功嗰份。
冇 GMB_STATE_DIR（例如 GitHub Actions）而 cache 都冇就全部重新問（大約 575 個請求，每秒 3 個約 3–4 分鐘）。
"""
import io, json, os, shutil, sys, time, zipfile, threading, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
SKIP = '--skip-existing' in sys.argv
UA = {'User-Agent': 'hk-next-transit-pipeline/0.1'}
RT_RPS = float(os.environ.get('RT_RPS', '8'))
CTB_STOP_CACHE = os.environ.get('CTB_STOP_CACHE')
CTB_STOP_REFRESH = int(os.environ.get('CTB_STOP_REFRESH', '400'))
GMB_RPS = float(os.environ.get('GMB_RPS', '3'))      # 同 tracker 同一個 IP；未量上限，保守
GMB_STATE = os.environ.get('GMB_STATE_DIR')          # VPS：/state/gmb，記住上次成功嘅小巴檔
GMB_ROUTE_REFRESH = int(os.environ.get('GMB_ROUTE_REFRESH', '20'))   # 增量更新時順便重新問最耐冇問過嘅幾多條


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
GMB_LIMIT = RateLimit(GMB_RPS)

GTFS_URL = 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip'
TD_BUS_URL = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
# 專線小巴：站序、站名、座標、全程車費（同 API、GTFS 同一套 8 位數站 ID）
TD_GMB_URL = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_GMB.json'
CSDI_WFS = ('https://portal.csdi.gov.hk/server/services/common/td_rcd_1638844988873_41214/MapServer/WFSServer'
            '?service=wfs&version=2.0.0&request=GetFeature&typenames=csdi:FB_ROUTE_LINE&outputFormat=geojson')
# 專線小巴走線：每個 route_id + route_seq 一條（MultiLineString，只有一段）
CSDI_GMB_WFS = ('https://portal.csdi.gov.hk/server/services/common/td_rcd_1697082463580_57453/MapServer/WFSServer'
                '?service=wfs&version=2.0.0&request=GetFeature&typenames=csdi:GMB_ROUTE_LINE&outputFormat=geojson')
CTB = 'https://rt.data.gov.hk/v2/transport/citybus'
# 九巴：有「全部」endpoint，三次 call 就攞晒
KMB = 'https://data.etabus.gov.hk/v1/transport/kmb'
NLB = 'https://rt.data.gov.hk/v2/transport/nlb'
# 專線小巴 API（運輸署）：CloudFront 後面，重複網址會 cache
GMB = 'https://data.etagmb.gov.hk'
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
# 香港電車站（data.gov.hk 開放數據）：行駛方向、站代號、站名（中、英各一個檔）；路線同時間表喺 GTFS（agency TRAM）
TRAM_STOPS_URL = 'https://static.data.gov.hk/tramways/datasets/tram_stops/summary_tram_stops_{}.csv'


def http(url, timeout=120, tries=6):
    limiter = RT_LIMIT if 'rt.data.gov.hk' in url else GMB_LIMIT if 'data.etagmb.gov.hk' in url else None
    for i in range(tries):
        if limiter:
            limiter.wait()
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


def fetch_tram_stops():
    for lang in ('tc', 'en'):
        path = os.path.join(CACHE, f'tram_stops_{lang}.csv')
        if done(path):
            continue
        open(path, 'wb').write(http(TRAM_STOPS_URL.format(lang)))
    print('電車站 ok')


def fetch_td_bus():
    path = os.path.join(CACHE, 'td_bus.json')
    if done(path):
        return
    open(path, 'wb').write(http(TD_BUS_URL, 600))
    print('JSON_BUS ok')


def csdi_features(url, page=500):
    """CSDI WFS 分頁攞晒所有 feature"""
    feats = []
    while True:
        d = json.loads(http(f'{url}&count={page}&startIndex={len(feats)}', 600))
        feats += d['features']
        if len(d['features']) < page:
            return feats


def fetch_csdi_lines():
    path = os.path.join(CACHE, 'csdi_lines.json')
    if done(path):
        return
    feats = csdi_features(CSDI_WFS)
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


# ---------------- 專線小巴（全部可選） ----------------
def write_json(path, data):
    """先寫暫存檔再改名：寫到一半出錯唔會留低爛檔"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def gmb_state(name):
    return os.path.join(GMB_STATE, name) if GMB_STATE else None


def with_state(name, fn):
    """專線小巴來源：成功就將 cache/<name> 抄去 GMB_STATE（上次成功嗰份）；
    失敗就用返 GMB_STATE 嗰份，冇先報錯（fetch 當可選，build 會跳過小巴）"""
    path, state = os.path.join(CACHE, name), gmb_state(name)
    try:
        fn(path)
    except Exception as e:
        if state and os.path.exists(state):
            shutil.copyfile(state, path)
            print(f'⚠️ 用上次成功嘅 {name}（今次下載失敗：{e}）')
            return
        raise
    if state and os.path.exists(path):
        try:   # /state 寫唔到唔好令下載失敗
            os.makedirs(GMB_STATE, exist_ok=True)
            shutil.copyfile(path, state + '.tmp')
            os.replace(state + '.tmp', state)
        except OSError as e:
            print(f'專線小巴 {name} 寫唔到去 {GMB_STATE}：', e)


def _td_gmb(path):
    if done(path):
        return
    raw = http(TD_GMB_URL, 600)
    n = len(json.loads(raw.decode('utf-8-sig'))['features'])
    if n < 5000:   # 2026-11：13106 個（路線站點）；太少即係下載唔完整
        raise RuntimeError(f'JSON_GMB 只有 {n} 個路線站點')
    with open(path + '.tmp', 'wb') as f:
        f.write(raw)
    os.replace(path + '.tmp', path)
    print('JSON_GMB', n, '個路線站點')


def fetch_td_gmb():
    with_state('td_gmb.json', _td_gmb)


def _csdi_gmb_lines(path):
    if done(path):
        return
    feats = csdi_features(CSDI_GMB_WFS)
    if len(feats) < 500:   # 2026-11：1167 條
        raise RuntimeError(f'CSDI 專線小巴走線只有 {len(feats)} 條')
    write_json(path, {'type': 'FeatureCollection', 'features': feats})
    print('CSDI 專線小巴走線', len(feats))


def fetch_csdi_gmb_lines():
    with_state('csdi_gmb_lines.json', _csdi_gmb_lines)


def gmb_get(path):
    return json.loads(http(f'{GMB}{path}', 60))['data']


def _gmb_routes(path):
    """專線小巴 API 路線資料（走法名稱、方向起訖點）：{'routes': {route_id: {at, lastUpdate, data}}}。
    有上次嘅（GMB_STATE 或者 cache）就增量：/last-update/route 一次，再只問新嘅、改過嘅 route_id；
    冇就 /route 攞所有號碼，再逐個 /route/{地區}/{號碼}（一次攞晒嗰個號碼所有 route_id）"""
    if done(path):
        return
    import urllib.parse
    prev = None
    for p in (gmb_state('gmb_routes.json'), path):
        if p and os.path.exists(p):
            try:
                prev = json.load(open(p, encoding='utf-8'))['routes']
                break
            except Exception as e:   # 爛咗就全部重新問
                print('專線小巴路線 cache 讀唔到：', e)
    updates = {str(x['route_id']): x['last_update_date'] for x in gmb_get('/last-update/route')}
    if len(updates) < 300:   # 2026-11：約 780 個 route_id
        raise RuntimeError(f'/last-update/route 只有 {len(updates)} 個 route_id')
    now = int(time.time())
    # 線程數細：真正限速靠 GMB_LIMIT（同 tracker 同一個 IP）
    with ThreadPoolExecutor(3) as ex:
        if prev:
            changed = [r for r, t in updates.items() if r not in prev or prev[r].get('lastUpdate') != t]
            seen = set(changed)
            stale = sorted((r for r in updates if r in prev and r not in seen),
                           key=lambda r: prev[r].get('at', 0))[:GMB_ROUTE_REFRESH]
            todo = changed + stale
            got = list(ex.map(lambda r: gmb_get(f'/route/{r}'), todo))
            routes = {r: prev[r] for r in updates if r in prev}   # 唔再喺 last-update 嘅 = 取消咗
            how = f'增量，今次問咗 {len(todo)} 個 route_id'
        else:
            pairs = [(reg, code) for reg, codes in gmb_get('/route')['routes'].items() for code in codes]
            got = list(ex.map(lambda rc: gmb_get(f'/route/{rc[0]}/{urllib.parse.quote(rc[1])}'), pairs))
            routes = {}
            how = f'全部重新問，{len(pairs)} 個號碼'
    for objs in got:
        for obj in objs or []:
            rid = str(obj['route_id'])
            routes[rid] = {'at': now, 'lastUpdate': updates.get(rid), 'data': obj}
    if len(routes) < 300:
        raise RuntimeError(f'專線小巴路線只有 {len(routes)} 個 route_id')
    write_json(path, {'routes': routes})
    print('專線小巴路線', len(routes), '個 route_id（' + how + '）')


def fetch_gmb_routes():
    with_state('gmb_routes.json', _gmb_routes)


# 可選：失敗只會警告（今次可能冇專線小巴），唔會令成個數據更新失敗
OPTIONAL = {'fetch_td_gmb', 'fetch_csdi_gmb_lines', 'fetch_gmb_routes'}

if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    t = time.time()
    failed, warned = [], []

    def run(f):
        try:
            f()
        except Exception as e:  # 記低，全部做完先一齊報；唔好令 build.py 讀唔到檔先爆
            (warned if f.__name__ in OPTIONAL else failed).append(f'{f.__name__}: {e}')

    ths = [threading.Thread(target=run, args=(f,)) for f in (
        fetch_gtfs, fetch_td_bus, fetch_csdi_lines, fetch_ctb, fetch_kmb, fetch_nlb, fetch_mtrb, fetch_osm_mtrb,
        fetch_osm_places, fetch_journey_times, fetch_tram_stops, fetch_td_gmb, fetch_csdi_gmb_lines, fetch_gmb_routes)]
    for th in ths: th.start()
    for th in ths: th.join()
    if warned:
        print('⚠️ 專線小巴下載失敗（今次可能冇小巴或者少咗走線、走法名，其他照樣更新）：', *warned, sep='\n  ')
    if any('403' in x for x in failed + warned):
        print('  403 Forbidden：data.gov.hk／data.etagmb.gov.hk 擋咗呢個 IP（問得太密），等一陣（例如 30–60 分鐘）再試，'
              '或者減細 RT_RPS／GMB_RPS')
    if failed:
        print('下載失敗：', *failed, sep='\n  ')
        sys.exit(1)
    print(f'完成 {time.time() - t:.0f}s')
