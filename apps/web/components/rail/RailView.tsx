'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MtrMap, { type MtrFocus, type MtrInset } from './MtrMap';
import MtrStationSheet from './MtrStationSheet';

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

/**
 * 「路線」分頁 → 港鐵・輕鐵：路綫圖，撳站（或者喺標題列搜尋）睇到站時間（輕鐵之後加）。
 * 面板唔遮成幅圖：量佢遮咗幾多（inset）俾地圖，地圖將個站移去淨低嘅地方。
 */
export default function RailView({ pick }: { pick: { sta: string } | null }) {
  const [sta, setSta] = useState<string | null>(null);
  const [focus, setFocus] = useState<MtrFocus | null>(null);
  // 揀咗邊條綫、展唔展開班次表：轉站都記住
  const [tab, setTab] = useState<string | null>(null);
  const sheet = useNarrow();
  // 闊螢幕預設展開班次表；手機每次揀新站都由半開開始（方便繼續撳地圖）
  const [all, setAll] = useState(() => !isNarrow());
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [inset, setInset] = useState<MtrInset>({ right: 0, bottom: 0 });

  // 標題列搜尋揀咗站：飛去（放大置中）再打開
  useEffect(() => {
    if (!pick) return;
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

  // 面板遮住咗嘅位：手機喺下面（量高度），闊螢幕喺右邊（量闊度）
  useLayoutEffect(() => {
    const w = wrap.current;
    const el = panel.current;
    const set = (v: MtrInset) => setInset((o) => (Math.abs(o.right - v.right) < 1 && Math.abs(o.bottom - v.bottom) < 1 ? o : v));
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
  }, [sta]);

  return (
    <div className="mtr-wrap" ref={wrap}>
      <MtrMap selected={sta} onStation={onStation} focus={focus} inset={inset} />
      {sta && <MtrStationSheet ref={panel} sta={sta} onClose={onClose} tab={tab} onTab={setTab} all={all} onAll={setAll} sheet={sheet} />}
    </div>
  );
}
