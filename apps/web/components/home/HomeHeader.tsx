'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Icon from '@/components/Icon';
import Logo from '@/components/Logo';

/**
 * 首頁 header（一件嘢，會收縮）：頂部「logo 下一程 NextLeg」一行 + 大字地區 + 搜尋欄。
 *
 * 捲上去時 header 嘅黃色底同捲動 1:1 向上收（下面內容黐住佢底，唔會捲入佢下面、唔會留空白黃色），
 * 收到剩返頂部一行就停。收縮期間（p = 0 → 1）入面嘅嘢唔係淡走，而係變形：
 * - 大字地區名一路縮細、移位，飛去頂部右邊變成地區膠囊；英文名同「最近巴士站」一行跟住黃色底收走
 * - 搜尋欄一路縮細、移位，變成頂部右邊個搜尋掣
 * 位置用 offsetLeft／offsetTop 量（唔受 transform 影響），每格用 requestAnimationFrame 直接改 style，唔 setState。
 * 電腦版（≥ 768px）冇頂部一行（分頁列就係 header），冇目標位：大字同搜尋欄喺頂部碰到邊之前淡出。
 * App 版 apps/mobile/src/components/HomeHeader.tsx。
 */
/** 頂部一行上下嘅空位（同 CSS .hh 嘅 padding-top 一樣） */
const PAD = 12;

export default function HomeHeader({
  scroller,
  name,
  en,
  sub,
  pill,
  onSearch,
  status,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  /** 大字（地區名／站頭名／定位中…） */
  name: string;
  en?: string | null;
  /** 大字下面一行（最近巴士站、錯誤＋再試等） */
  sub: ReactNode;
  /** 收起後頂部嘅地區膠囊；冇就唔變膠囊（大字淡走） */
  pill: string | null;
  onSearch: () => void;
  /** 搜尋欄右邊（交通消息燈號） */
  status: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const nameEl = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLDivElement>(null);
  const searchInner = useRef<HTMLDivElement>(null);
  const pillSlot = useRef<HTMLSpanElement>(null);
  const btnSlot = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(260);
  const frame = useRef(0);

  // 量 header 高度（俾內容留位），內容或者闊度變咗再量
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const apply = () => {
      frame.current = 0;
      const r = root.current;
      const b = bar.current;
      const n = nameEl.current;
      const s = search.current;
      if (!r || !b || !n || !s || !bg.current || !rest.current || !searchInner.current) return;
      const y = Math.max(0, sc.scrollTop);
      const barH = b.offsetParent ? b.offsetHeight : 0; // 電腦版頂部一行收埋 = 0
      // 收縮距離：收到頂部一行上下留一樣嘅位（PAD），膠囊同搜尋掣就喺 header 正中
      const D = barH ? Math.max(1, r.offsetHeight - (b.offsetTop + barH + PAD)) : Math.max(1, r.offsetHeight);
      const d = Math.min(y, D);
      const p = d / D;
      const ease = (t: number) => t * t * (3 - 2 * t); // 頭尾慢、中間快
      bg.current.style.transform = `translateY(${-d}px)`;
      r.dataset.collapsed = p > 0.98 ? '1' : '0';

      // 英文名、最近巴士站：跟黃色底一齊收走，碰到頂部一行之前淡晒
      const restTop = rest.current.offsetTop;
      rest.current.style.transform = `translateY(${-d}px)`;
      // 淡得快啲，唔好同縮緊嘅大字疊埋
      rest.current.style.opacity = String(Math.max(0, 1 - d / Math.max(1, (restTop - barH) * 0.45)));

      const ps = pillSlot.current;
      if (barH && ps && ps.offsetWidth) {
        // 大字 → 地區膠囊：中心點移過去、縮到膠囊字咁大
        const k = ease(p);
        const fromX = n.offsetLeft + n.offsetWidth / 2;
        const fromY = n.offsetTop + n.offsetHeight / 2;
        const toX = ps.offsetLeft + ps.offsetWidth / 2;
        const toY = ps.offsetTop + ps.offsetHeight / 2;
        const scale = 1 + (parseFloat(getComputedStyle(ps).fontSize) / parseFloat(getComputedStyle(n).fontSize) - 1) * k;
        n.style.transform = `translate(${(toX - fromX) * k}px, ${(toY - fromY) * k}px) scale(${scale})`;
        n.style.opacity = String(p > 0.9 ? 1 - (p - 0.9) / 0.1 : 1);
        ps.style.opacity = String(p > 0.9 ? (p - 0.9) / 0.1 : 0);
      } else {
        // 冇目標位（電腦版）：跟黃色底收走，頂部碰到邊之前淡晒
        n.style.transform = `translateY(${-d}px)`;
        n.style.opacity = String(Math.max(0, 1 - d / Math.max(1, n.offsetTop)));
      }

      const bs = btnSlot.current;
      if (barH && bs && bs.offsetWidth) {
        // 搜尋欄 → 搜尋掣：中心移過去、闊高縮到掣咁大；入面啲字頭三成就淡走
        const k = ease(p);
        const fromX = s.offsetLeft + s.offsetWidth / 2;
        const fromY = s.offsetTop + s.offsetHeight / 2;
        const toX = bs.offsetLeft + bs.offsetWidth / 2;
        const toY = bs.offsetTop + bs.offsetHeight / 2;
        const sx = 1 + (bs.offsetWidth / s.offsetWidth - 1) * k;
        const sy = 1 + (bs.offsetHeight / s.offsetHeight - 1) * k;
        s.style.transform = `translate(${(toX - fromX) * k}px, ${(toY - fromY) * k}px) scale(${sx}, ${sy})`;
        // 白色慢慢變成搜尋掣嘅半透明深色底；圓角按縮放比例反向補返，睇落一直係圓角（16 → 12）
        // 目標色 = 黃色底加 8% 黑（即係搜尋掣嘅半透明深色疊喺黃色上面），全程實色，唔會變啡
        const m = getComputedStyle(bg.current).backgroundColor.match(/\d+/g)?.map(Number) ?? [255, 199, 44];
        const mix = (i: number) => Math.round(255 + (m[i]! * 0.92 - 255) * k);
        s.style.backgroundColor = `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
        s.style.boxShadow = k > 0.2 ? 'none' : '';
        const rad = 16 - 4 * k;
        s.style.borderRadius = `${rad / sx}px / ${rad / sy}px`;
        s.style.opacity = String(p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1);
        searchInner.current.style.opacity = String(Math.max(0, 1 - p / 0.3));
        bs.style.opacity = String(p > 0.85 ? (p - 0.85) / 0.15 : 0);
        bs.style.pointerEvents = p > 0.9 ? 'auto' : 'none';
        s.style.pointerEvents = p > 0.5 ? 'none' : 'auto';
      } else {
        s.style.transform = `translateY(${-d}px)`;
        s.style.opacity = String(Math.max(0, 1 - d / Math.max(1, s.offsetTop)));
        s.style.pointerEvents = d > s.offsetTop * 0.5 ? 'none' : 'auto';
      }
    };
    // 停喺收縮一半：自動捲去收埋或者展開（跟最後捲動方向，似 iPhone 大標題）。手指仲撳住唔郁；只限有頂部一行（手機）
    let lastY = sc.scrollTop;
    let dir = 0;
    let touching = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      const r = root.current;
      const b = bar.current;
      if (touching || !r || !b || !b.offsetParent) return;
      const D = r.offsetHeight - (b.offsetTop + b.offsetHeight + PAD);
      const y = sc.scrollTop;
      if (D <= 0 || y <= 0 || y >= D - 1) return;
      sc.scrollTo({ top: dir < 0 ? 0 : D, behavior: 'smooth' });
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(snap, 140);
    };
    const onScroll = () => {
      if (!frame.current) frame.current = requestAnimationFrame(apply);
      const y = sc.scrollTop;
      if (y !== lastY) dir = y > lastY ? 1 : -1;
      lastY = y;
      later();
    };
    const onTouchStart = () => {
      touching = true;
      clearTimeout(timer);
    };
    const onTouchEnd = () => {
      touching = false;
      later();
    };
    apply();
    sc.addEventListener('scroll', onScroll, { passive: true });
    sc.addEventListener('touchstart', onTouchStart, { passive: true });
    sc.addEventListener('touchend', onTouchEnd, { passive: true });
    sc.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      sc.removeEventListener('scroll', onScroll);
      sc.removeEventListener('touchstart', onTouchStart);
      sc.removeEventListener('touchend', onTouchEnd);
      sc.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame.current);
      clearTimeout(timer);
    };
  }, [scroller, name, pill, height]);

  return (
    <>
      {/* 放喺捲動區入面：高度 0 嘅 sticky 外框黐住頂，header 浮喺內容上面 */}
      <div className="hh-sticky">
      <header className="hh" ref={root}>
        <div className="hh-bg" ref={bg} aria-hidden="true" />
        <div className="hh-bar" ref={bar}>
          <Logo size={24} />
          <h1>下一程</h1>
          <span className="app-sub">NextLeg</span>
          {pill && (
            <span className="hh-pill" ref={pillSlot} aria-hidden="true">
              <Icon name="navigate" size={13} />
              <span className="hh-pill-text">{pill}</span>
            </span>
          )}
          <button className="bar-btn hh-btn" ref={btnSlot} onClick={onSearch} aria-label="導航：想去邊度？" tabIndex={-1}>
            <Icon name="search" />
          </button>
        </div>
        <div className="hh-loc" aria-live="polite">
          <span className="hh-name" ref={nameEl}>
            {name}
          </span>
          <div className="hh-rest" ref={rest}>
            {en && <span className="hero-en">{en}</span>}
            <span className="hero-sub">{sub}</span>
          </div>
        </div>
        <div className="search-field hero-search hh-search" ref={search}>
          <div className="hh-search-inner" ref={searchInner}>
            <button className="hero-search-main" onClick={onSearch} aria-label="導航：想去邊度？">
              <Icon name="search" size={20} className="search-icon" />
              <span className="search-placeholder">想去邊度？</span>
            </button>
            {status}
          </div>
        </div>
      </header>
      </div>
      {/* 俾 header 留位：內容由 header 底開始 */}
      <div className="hh-spacer" style={{ height }} aria-hidden="true" />
    </>
  );
}
