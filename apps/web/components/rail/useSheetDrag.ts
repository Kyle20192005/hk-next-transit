'use client';
import { useLayoutEffect, useRef, useState, type ForwardedRef } from 'react';

type Snap = 'peek' | 'full' | 'close';
/** 全開時頂部留幾多地圖（px） */
const FULL_GAP = 56;

/**
 * 路綫圖站面板（港鐵、輕鐵共用）：手機（sheet）貼住底邊，拉柄拉上拉落。
 * 半開自動高度；向上拉全開（頂部留 FULL_GAP 地圖），向下拉關閉。郁 6px 先當拖（輕撳分頁、關閉掣照用得）。
 * 全開向下掃 → 半開；半開向下掃 → 關閉；向上掃 → 全開；慢慢放 → 近邊個用邊個；拉低過半開 70（由全開拉就要低過半開一半）→ 關閉。
 */
export function useSheetDrag({ ref, sheet, all, onAll, onClose }: { ref: ForwardedRef<HTMLElement>; sheet: boolean; all: boolean; onAll: (all: boolean) => void; onClose: () => void }) {
  const el = useRef<HTMLElement | null>(null);
  const setRefs = (n: HTMLElement | null) => {
    el.current = n;
    if (typeof ref === 'function') ref(n);
    else if (ref) ref.current = n;
  };
  /** 拖緊或者彈緊時嘅高度（px）；null = 跟狀態（半開自動高度、全開 CSS 高度） */
  const [dragH, setDragH] = useState<number | null>(null);
  const peekH = useRef(300);
  const full = sheet && all;
  // 半開時量返自己幾高（之後拉落嚟彈返去呢個高度）
  useLayoutEffect(() => {
    if (sheet && !all && dragH === null && el.current) peekH.current = el.current.offsetHeight;
  });
  const fullH = () => (el.current?.parentElement?.clientHeight ?? 600) - FULL_GAP;
  const snap = (target: Snap, from: number) => {
    if (target === 'close') return onClose();
    const to = target === 'full' ? fullH() : peekH.current;
    setDragH(to);
    const done = () => {
      setDragH(null);
      onAll(target === 'full');
    };
    const a = el.current?.animate?.([{ height: `${from}px` }, { height: `${to}px` }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (a) a.onfinish = done;
    else done();
  };
  const drag = useRef<{ id: number; y0: number; h0: number; on: boolean; y: number; t: number; v: number } | null>(null);
  const onGrabDown = (e: React.PointerEvent) => {
    if (!sheet || !el.current) return;
    drag.current = { id: e.pointerId, y0: e.clientY, h0: el.current.offsetHeight, on: false, y: e.clientY, t: e.timeStamp, v: 0 };
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.on) {
      // 郁咗 6px 先當拖（輕撳分頁、關閉掣照用得）
      if (Math.abs(dy) < 6) return;
      d.on = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.t = e.timeStamp;
    setDragH(Math.max(60, Math.min(fullH(), d.h0 - dy)));
  };
  const onGrabUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on || !el.current) return;
    const h = el.current.offsetHeight;
    const peek = peekH.current;
    const v = e.timeStamp - d.t > 120 ? 0 : d.v; // 停咗先放手唔當掃
    // 全開向下掃 → 半開；半開向下掃 → 關閉；向上掃 → 全開；慢慢放 → 近邊個用邊個；拉低過半開 70（由全開拉就要低過半開一半）→ 關閉
    const fromFull = d.h0 > peek + 20;
    let target: Snap;
    if (h < (fromFull ? peek * 0.5 : peek - 70)) target = 'close';
    else if (v > 0.4) target = fromFull ? 'peek' : 'close';
    else if (v < -0.4) target = 'full';
    else target = h > (peek + fullH()) / 2 ? 'full' : 'peek';
    snap(target, h);
  };
  const toggleAll = () => (sheet && el.current ? snap(all ? 'peek' : 'full', el.current.offsetHeight) : onAll(!all));
  const showTable = all || dragH !== null;

  const grab = { onPointerDown: onGrabDown, onPointerMove: onGrabMove, onPointerUp: onGrabUp, onPointerCancel: onGrabUp };
  return { setRefs, dragH, full, grab, toggleAll, showTable };
}
