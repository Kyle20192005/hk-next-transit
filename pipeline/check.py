"""步驟 3：發佈前檢查 pipeline/out，唔合理就唔發佈（網站繼續用舊數據）。

營辦商 API 間中會「成功」但只回傳一部分數據（例如少咗一半路線），fetch.py 唔會發現。
所以同上一版（data 分支嘅 stats.json）比較：任何一間公司嘅路線、走法、站、有時間表／走線嘅走法
少咗超過 10% 就當出錯。冇上一版就只檢查最低數量同結構。

用法: python3 pipeline/check.py [--prev <上一版數據目錄>] [--force]
  --prev   放住上一版 stats.json（或者 index.json）嘅目錄
  --force  數量大跌都照發佈（真係有大量路線取消時人手用）；結構錯誤照樣唔准發佈
檢查完會寫 out/stats.json，下次用嚟比較。
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
COS = ('ctb', 'kmb', 'nlb', 'mtrb')
# 少咗幾多當出錯：比例同絕對數量都要超過（細公司例如港鐵巴士 26 條線，少 3 條已經超過 10%）
MAX_DROP = 0.10
MIN_ABS_DROP = 3
# 冇上一版時嘅最低數量（2026-11：城巴 401、九巴約 650、新巴 39、港鐵巴士 26 條線）
MIN_ROUTES = {'ctb': 300, 'kmb': 450, 'nlb': 25, 'mtrb': 15}


def stats(out):
    """每間公司（路線檔位置）嘅數量，同結構錯誤"""
    errors = []
    idx = json.load(open(f'{out}/index.json', encoding='utf-8'))
    s = {co: {'routes': 0, 'variants': 0, 'stops': 0, 'withSchedule': 0, 'withLine': 0, 'withFare': 0} for co in COS}
    stops = {co: set() for co in COS}
    for r in idx['routes']:
        co = r.get('co', 'ctb')
        path = f'{out}/{co}/{r["route"]}.json'
        try:
            d = json.load(open(path, encoding='utf-8'))
        except FileNotFoundError:
            errors.append(f'索引有 {co}/{r["route"]} 但冇路線檔')
            continue
        except ValueError as e:
            errors.append(f'{co}/{r["route"]} 讀唔到：{e}')
            continue
        x = s[co]
        x['routes'] += 1
        x['variants'] += len(d['variants'])
        stops[co].update(d['stops'])
        for v in d['variants']:
            x['withSchedule'] += bool(v['schedules'])
            x['withLine'] += bool(v['line'])
            x['withFare'] += bool(v.get('fares'))
            missing = [sid for sid in v['stops'] if sid and sid not in d['stops']]
            missing += [k[2:] for k in v['expSeq'] if k[2:] not in d['stops']]
            if missing:
                errors.append(f'{co}/{r["route"]} 走法 {v["id"]} 嘅站唔喺站表：{missing[:3]}')
    for co in COS:
        s[co]['stops'] = len(stops[co])
    try:
        s['allStops'] = len(json.load(open(f'{out}/stops.json', encoding='utf-8'))['stops'])
    except (FileNotFoundError, ValueError, KeyError) as e:
        errors.append(f'stops.json 讀唔到：{e}')
    return s, errors


def load_prev(prev_dir):
    """上一版：有 stats.json 用佢；舊版冇就由 index.json 數路線"""
    if not prev_dir:
        return None
    p = os.path.join(prev_dir, 'stats.json')
    if os.path.exists(p):
        return json.load(open(p, encoding='utf-8'))['counts']
    p = os.path.join(prev_dir, 'index.json')
    if os.path.exists(p):
        out = {co: {'routes': 0} for co in COS}
        for r in json.load(open(p, encoding='utf-8'))['routes']:
            out[r.get('co', 'ctb')]['routes'] += 1
        return out
    return None


def compare(now, prev):
    """回傳數量大跌嘅項目"""
    drops = []
    for co in COS:
        for k, old in (prev.get(co) or {}).items():
            new = now[co].get(k, 0)
            if old and (old - new) / old > MAX_DROP and old - new >= MIN_ABS_DROP:
                drops.append(f'{co} {k}：{old} -> {new}（少咗 {(old - new) / old:.0%}）')
    old, new = prev.get('allStops'), now.get('allStops')
    if old and new is not None and (old - new) / old > MAX_DROP:
        drops.append(f'全部站：{old} -> {new}')
    return drops


def main(argv):
    prev_dir = argv[argv.index('--prev') + 1] if '--prev' in argv else None
    force = '--force' in argv
    now, errors = stats(OUT)
    for co in COS:
        print(f"{co}: " + '，'.join(f'{k} {v}' for k, v in now[co].items()))
    print('全部站', now.get('allStops'))

    problems = list(errors)
    low = [f'{co} 只有 {now[co]["routes"]} 條線（最少 {n}）' for co, n in MIN_ROUTES.items() if now[co]['routes'] < n]
    prev = load_prev(prev_dir)
    drops = compare(now, prev) if prev else []
    if not prev:
        print('冇上一版數據可以比較，只檢查最低數量同結構')
    if force and (low or drops):
        print('⚠️ --force：以下數量問題照樣發佈')
        for x in low + drops:
            print('  ', x)
    else:
        problems += low + drops

    if problems:
        print(f'\n❌ 檢查唔通過（{len(problems)} 項），唔發佈：')
        for x in problems[:50]:
            print('  ', x)
        return 1
    json.dump({'counts': now}, open(f'{OUT}/stats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n✅ 檢查通過，已寫 out/stats.json')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
