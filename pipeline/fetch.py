"""步驟 1：下載所有原始數據到 pipeline/cache/
- 政府 GTFS（走法、時間表、日曆）
- 運輸署路線資料 JSON_BUS.json（specialType 特別班標記）
- CSDI 巴士路線走線（MultiLineString）
- 城巴 API：路線、路線站點、站點
用法: python3 pipeline/fetch.py [--skip-existing]
"""
import io, json, os, sys, time, zipfile, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
SKIP = '--skip-existing' in sys.argv
UA = {'User-Agent': 'hk-next-transit-pipeline/0.1'}

GTFS_URL = 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip'
TD_BUS_URL = 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json'
CSDI_WFS = ('https://portal.csdi.gov.hk/server/services/common/td_rcd_1638844988873_41214/MapServer/WFSServer'
            '?service=wfs&version=2.0.0&request=GetFeature&typenames=csdi:FB_ROUTE_LINE&outputFormat=geojson')
CTB = 'https://rt.data.gov.hk/v2/transport/citybus'


def http(url, timeout=120, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
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


def fetch_ctb():
    path = os.path.join(CACHE, 'ctb.json')
    if done(path):
        return
    get = lambda u: json.loads(http(u, 30))['data']
    routes = get(f'{CTB}/route/ctb')
    jobs = [f'{CTB}/route-stop/CTB/{r["route"]}/{d}' for r in routes for d in ('inbound', 'outbound')]
    with ThreadPoolExecutor(32) as ex:
        rs = [x for lst in ex.map(get, jobs) if lst for x in lst]
    ids = sorted({x['stop'] for x in rs})
    with ThreadPoolExecutor(32) as ex:
        stops = list(ex.map(lambda s: get(f'{CTB}/stop/{s}'), ids))
    json.dump({'route': routes, 'route_stop': rs, 'stop': [s for s in stops if s]},
              open(path, 'w'), ensure_ascii=False)
    print('城巴', len(routes), '路線', len(rs), '路線站點', len(ids), '站')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    t = time.time()
    ths = [threading.Thread(target=f) for f in (fetch_gtfs, fetch_td_bus, fetch_csdi_lines, fetch_ctb)]
    for th in ths: th.start()
    for th in ths: th.join()
    print(f'完成 {time.time() - t:.0f}s')
