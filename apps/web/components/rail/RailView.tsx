'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MtrMap from './MtrMap';
import MtrStationSheet from './MtrStationSheet';
import LrtMap from './LrtMap';
import LrtStationSheet from './LrtStationSheet';
import type { MapFocus, MapInset, MapPin } from './useMapView';
import FareSheet, { FarePin, FarePopover } from './Fare';
import { formatDistance, lrtRecent, lrtRouteName, lrtStopName, mtrCardStations, mtrRecent, mtrStationName, nearestLrtStops, NO_FARE_ENDS, setFareEnd, swapFareEnds, type FareEnds, type FareRole } from '@hknt/core';
import Icon from '../Icon';
import { useNearbyStops } from '../home/Nearby';
import { addRecent } from '@/lib/recent';
import { RouteChip } from './LrtStationSheet';

/** 由首頁、搜尋揀咗嘅站：lrt = 輕鐵站（站 ID），否則港鐵站代號 */
export type RailPick = { sta: string; lrt?: boolean };
type Kind = 'mtr' | 'lrt';
const KIND_KEY = 'hknt.rail';

const NARROW = '(max-width: 767.98px)';
export const isNarrow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches;
/** 手機（窄過 768px）：面板做貼底拉板 */
export function useNarrow() {
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
 * 右上角「車費」：入選擇模式，撳站喺站上面彈出「起點｜終點」，揀齊就喺面板顯示車費（港鐵、輕鐵分開計）。
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
  /** 輕鐵：喺圖上標出嘅路線（站面板撳路線號碼） */
  const [route, setRoute] = useState<string | null>(null);
  /** 車費計算模式：起點、終點，同埋彈出緊「起點｜終點」嘅站 */
  const [fare, setFare] = useState(false);
  const [ends, setEnds] = useState<FareEnds>(NO_FARE_ENDS);
  const [pending, setPending] = useState<string | null>(null);

  const saveKind = (k: Kind) => {
    setKindState(k);
    setRoute(null);
    // 港鐵、輕鐵分開計：轉圖就清走起點終點
    setEnds(NO_FARE_ENDS);
    setPending(null);
    try {
      sessionStorage.setItem(KIND_KEY, k);
    } catch {
      /* 唔記得都冇所謂 */
    }
  };
  const setKind = (k: Kind) => {
    saveKind(k);
    setSta(null);
    setFocus(null);
    movedNear.current = false;
  };
  /** 轉去另一幅圖嘅站（搜尋、首頁、面板「轉乘」）：飛去（放大置中）再打開 */
  const jump = (k: Kind, s: string) => {
    if (k !== kind) saveKind(k);
    setFocus({ sta: s, zoom: true });
    // 車費模式：搜尋到嘅站彈出「起點｜終點」揀
    if (fare) return setPending(s);
    setSta(s);
    if (isNarrow()) setAll(false);
  };
  const toggleFare = () => {
    setFare((f) => !f);
    setEnds(NO_FARE_ENDS);
    setPending(null);
    setSta(null);
  };
  const pickRole = (role: FareRole) => {
    if (!pending) return;
    setEnds((e) => setFareEnd(e, pending, role));
    setPending(null);
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
    if (pick) jump(pick.lrt ? 'lrt' : 'mtr', pick.sta);
    // jump 每次 render 都係新 function，只跟 pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const onStation = useCallback(
    (c: string) => {
      setFocus({ sta: c, zoom: false });
      // 車費模式：撳站唔開到站面板，喺站上面彈出「起點｜終點」（再撳一次收埋）
      if (fare) return setPending((p) => (p === c ? null : c));
      setSta(c);
      if (isNarrow()) setAll(false);
    },
    [fare],
  );
  const onClose = useCallback(() => setSta(null), []);

  // 打開咗嘅港鐵站、輕鐵站記入首頁「最近睇過」
  useEffect(() => {
    if (sta) addRecent(kind === 'lrt' ? lrtRecent(sta) : mtrRecent(sta));
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
  }, [sta, kind, fare]);

  const name = (s: string) => (kind === 'lrt' ? lrtStopName(s) : mtrStationName(s));
  const nearIds = near.map((n) => n.sta);
  // 車費：起點、終點標記；撳咗嘅站彈出選單（同一個站就只出選單）
  const pins: MapPin[] = !fare
    ? []
    : [
        ...(['from', 'to'] as const).filter((r) => ends[r] && ends[r] !== pending).map((r) => ({ key: r, sta: ends[r]!, node: <FarePin role={r} /> })),
        ...(pending ? [{ key: `pop-${pending}`, sta: pending, node: <FarePopover onPick={pickRole} /> }] : []),
      ];
  const shownSel = fare ? pending : sta;

  return (
    <div className="mtr-wrap" ref={wrap}>
      {kind === 'mtr' ? (
        <MtrMap key="mtr" selected={shownSel} onStation={onStation} focus={focus} inset={inset} near={nearIds} pins={pins} />
      ) : (
        <LrtMap key="lrt" selected={shownSel} onStation={onStation} focus={focus} inset={inset} near={nearIds} route={route} pins={pins} />
      )}
      {/* 車費計算：港鐵、輕鐵分開（面板喺右邊時移開，唔好俾面板遮住） */}
      <button className={fare ? 'rail-fare-btn on' : 'rail-fare-btn'} style={{ right: 10 + inset.right }} onClick={toggleFare} aria-pressed={fare} aria-label={fare ? '結束車費計算' : '車費計算'}>
        <Icon name="ticket" size={18} />
        車費
      </button>
      <div className="rail-overlay">
        <div className="rail-switch" role="tablist" aria-label="港鐵或者輕鐵">
          <button role="tab" aria-selected={kind === 'mtr'} onClick={() => kind !== 'mtr' && setKind('mtr')}>
            <Icon name="train" size={18} />
            港鐵
          </button>
          <button role="tab" aria-selected={kind === 'lrt'} onClick={() => kind !== 'lrt' && setKind('lrt')}>
            <Icon name="lrt" size={18} />
            輕鐵
          </button>
        </div>
        {kind === 'lrt' && route && (
          <span className="lrt-route-tag">
            <RouteChip r={route} />
            {lrtRouteName(route)}
            <button onClick={() => setRoute(null)} aria-label="唔再標出路線">
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
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
      {fare && <FareSheet ref={panel} lrt={kind === 'lrt'} ends={ends} onSwap={() => setEnds(swapFareEnds)} onClear={() => (setEnds(NO_FARE_ENDS), setPending(null))} onClose={toggleFare} sheet={sheet} />}
      {!fare && sta && kind === 'mtr' && <MtrStationSheet ref={panel} sta={sta} onClose={onClose} tab={tab} onTab={setTab} all={all} onAll={setAll} sheet={sheet} onXfer={(s) => jump('lrt', s)} />}
      {!fare && sta && kind === 'lrt' && <LrtStationSheet ref={panel} sta={sta} onClose={onClose} all={all} onAll={setAll} sheet={sheet} onXfer={(s) => jump('mtr', s)} route={route} onRoute={setRoute} />}
    </div>
  );
}
