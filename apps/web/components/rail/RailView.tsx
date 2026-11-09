'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MtrMap from './MtrMap';
import MtrStationSheet from './MtrStationSheet';
import LrtMap from './LrtMap';
import LrtStationSheet from './LrtStationSheet';
import type { MapFocus, MapInset } from './useMapView';
import { formatDistance, lrtStopName, mtrCardStations, mtrRecent, mtrStationName, nearestLrtStops } from '@hknt/core';
import Icon from '../Icon';
import { useNearbyStops } from '../home/Nearby';
import { addRecent } from '@/lib/recent';

/** 由首頁、搜尋揀咗嘅站：lrt = 輕鐵站（站 ID），否則港鐵站代號 */
export type RailPick = { sta: string; lrt?: boolean };
type Kind = 'mtr' | 'lrt';
const KIND_KEY = 'hknt.rail';

const NARROW = '(max-width: 767.98px)';
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches;
/** 手機（窄過 768px）：面板做貼底拉板 */
function useNarrow() {
  const [n, setN] = useState(isNarrow);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const f = () => setN(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return n;
}
const readKind = (): Kind => {
  try {
    return sessionStorage.getItem(KIND_KEY) === 'lrt' ? 'lrt' : 'mtr';
  } catch {
    return 'mtr';
  }
};

/**
 * 「路線」分頁 → 港鐵・輕鐵：左上角切換港鐵／輕鐵路綫圖（記住上次揀邊個），撳站（或者喺標題列搜尋）睇到站時間。
 * 面板唔遮成幅圖：量佢遮咗幾多（inset）俾地圖，地圖將個站移去淨低嘅地方。
 */
export default function RailView({ pick }: { pick: RailPick | null }) {
  const [kind, setKindState] = useState<Kind>(readKind);
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // 揀咗邊條綫、展唔展開班次表：轉站都記住
  const [tab, setTab] = useState<string | null>(null);
  const sheet = useNarrow();
  // 闊螢幕預設展開班次表；手機每次揀新站都由半開開始（方便繼續撳地圖）
  const [all, setAll] = useState(() => !isNarrow());
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [inset, setInset] = useState<MapInset>({ right: 0, bottom: 0 });

  const setKind = (k: Kind) => {
    setKindState(k);
    setSta(null);
    setFocus(null);
    movedNear.current = false;
    try {
      sessionStorage.setItem(KIND_KEY, k);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };

  // 附近嘅站（用首頁嗰份定位，有快取）：800 米內嘅都標，冇就標 2 公里內最近一個
  const { state: nearby } = useNearbyStops(true);
  const near =
    nearby.kind !== 'ok'
      ? []
      : kind === 'mtr'
        ? mtrCardStations(nearby.mtr, 800, 3)
        : (() => {
            const all2 = nearestLrtStops(nearby.lat, nearby.lng, 2000, 3);
            const close = all2.filter((n) => n.distance <= 800);
            return close.length ? close : all2.slice(0, 1);
          })();
  const nearKey = `${kind}:${near.map((n) => n.sta).join(',')}`;
  // 第一次知道附近有咩站：唔喺畫面就移過去（唔變大細）；已經揀咗站就唔郁
  const movedNear = useRef(false);
  useEffect(() => {
    const first = nearKey.split(':')[1]?.split(',')[0];
    if (!first || movedNear.current || sta) return;
    movedNear.current = true;
    setFocus({ sta: first, zoom: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey]);

  // 標題列搜尋、首頁揀咗站：轉去嗰幅圖，飛去（放大置中）再打開
  useEffect(() => {
    if (!pick) return;
    const k: Kind = pick.lrt ? 'lrt' : 'mtr';
    setKindState(k);
    try {
      sessionStorage.setItem(KIND_KEY, k);
    } catch {
      /* 唔記得都冇所謂 */
    }
    setSta(pick.sta);
    setFocus({ sta: pick.sta, zoom: true });
    if (isNarrow()) setAll(false);
  }, [pick]);

  const onStation = useCallback((c: string) => {
    setSta(c);
    setFocus({ sta: c, zoom: false });
    if (isNarrow()) setAll(false);
  }, []);
  const onClose = useCallback(() => setSta(null), []);

  // 打開咗嘅港鐵站記入首頁「最近睇過」
  useEffect(() => {
    if (sta && kind === 'mtr') addRecent(mtrRecent(sta));
  }, [sta, kind]);

  // 面板遮住咗嘅位：手機喺下面（量高度），闊螢幕喺右邊（量闊度）
  useLayoutEffect(() => {
    const w = wrap.current;
    const el = panel.current;
    const set = (v: MapInset) => setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
    if (!w || !el) {
      set({ right: 0, bottom: 0 });
      return;
    }
    const update = () => {
      const a = w.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      set(b.width > a.width * 0.6 ? { right: 0, bottom: Math.max(0, a.bottom - b.top) } : { right: Math.max(0, a.right - b.left), bottom: 0 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(w);
    return () => ro.disconnect();
  }, [sta, kind]);

  const name = (s: string) => (kind === 'lrt' ? lrtStopName(s) : mtrStationName(s));
  const nearIds = near.map((n) => n.sta);

  return (
    <div className="mtr-wrap" ref={wrap}>
      {kind === 'mtr' ? (
        <MtrMap key="mtr" selected={sta} onStation={onStation} focus={focus} inset={inset} near={nearIds} />
      ) : (
        <LrtMap key="lrt" selected={sta} onStation={onStation} focus={focus} inset={inset} near={nearIds} />
      )}
      <div className="rail-overlay">
        <div className="rail-switch" role="tablist" aria-label="港鐵或者輕鐵">
          <button role="tab" aria-selected={kind === 'mtr'} onClick={() => kind !== 'mtr' && setKind('mtr')}>
            港鐵
          </button>
          <button role="tab" aria-selected={kind === 'lrt'} onClick={() => kind !== 'lrt' && setKind('lrt')}>
            輕鐵
          </button>
        </div>
        {near[0] && (
          <button
            className="mtr-near-pill"
            onClick={() => {
              setSta(near[0]!.sta);
              setFocus({ sta: near[0]!.sta, zoom: true });
            }}
            aria-label={`附近${kind === 'lrt' ? '輕鐵' : '港鐵'}站：${name(near[0].sta)}，${formatDistance(near[0].distance)}`}
          >
            <Icon name="navigate" size={16} />
            附近：{name(near[0].sta)}
            <span className="muted">· {formatDistance(near[0].distance)}</span>
          </button>
        )}
      </div>
      {sta && kind === 'mtr' && <MtrStationSheet ref={panel} sta={sta} onClose={onClose} tab={tab} onTab={setTab} all={all} onAll={setAll} sheet={sheet} />}
      {sta && kind === 'lrt' && <LrtStationSheet ref={panel} sta={sta} onClose={onClose} all={all} onAll={setAll} sheet={sheet} />}
    </div>
  );
}
