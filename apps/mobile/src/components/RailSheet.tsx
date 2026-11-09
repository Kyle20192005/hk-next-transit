import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, PanResponder, View, type LayoutChangeEvent } from 'react-native';

type Snap = 'peek' | 'full' | 'close';
/** 手機拉板：全開幾高、半開最高幾高（px） */
export type SheetSize = { full: number; peekMax: number };

/**
 * 路綫圖站面板（港鐵、輕鐵共用）：手機貼底拉板（同網頁 useSheetDrag 一樣嘅規則）。
 * 回傳：sizeStyle（放落 Animated.View）、layout（onLayout）、live（俾 SheetGrab）、toggleAll、showTable。
 */
export function useRailSheet({ sheet, all, onAll, onClose, onLayout }: { sheet: SheetSize | null; all: boolean; onAll: (all: boolean) => void; onClose: () => void; onLayout?: (e: LayoutChangeEvent) => void }) {
  const [height] = useState(() => new Animated.Value(0));
  /** 高度由動畫控制（拖緊、彈緊）；否則半開自動高度、全開 sheet.full */
  const [anim, setAnim] = useState(false);
  const peekH = useRef(300);
  const curH = useRef(0);
  const snap = useCallback(
    (target: Snap, from: number) => {
      if (target === 'close' || !sheet) return onClose();
      const to = target === 'full' ? sheet.full : peekH.current;
      height.setValue(from);
      setAnim(true);
      Animated.timing(height, { toValue: to, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
        onAll(target === 'full');
        setAnim(false);
      });
    },
    [sheet, onClose, onAll, height],
  );
  // 手勢 callback 用嘅最新值（PanResponder 只建一次，喺 SheetGrab 入面）
  const live = useRef<GrabLive | null>(null);
  useLayoutEffect(() => {
    live.current = { sheet, snap, curH: () => curH.current, peekH: () => peekH.current, height, setAnim };
  }, [sheet, snap, height]);
  const toggleAll = () => (sheet ? snap(all ? 'peek' : 'full', curH.current) : onAll(!all));
  const showTable = all || anim;
  const sizeStyle = !sheet ? null : anim ? { height } : all ? { height: sheet.full } : { maxHeight: sheet.peekMax };
  const layout = (e: LayoutChangeEvent) => {
    curH.current = e.nativeEvent.layout.height;
    // 半開時量返自己幾高（之後拉落嚟彈返去呢個高度）
    if (sheet && !all && !anim) peekH.current = e.nativeEvent.layout.height;
    onLayout?.(e);
  };

  return { sizeStyle, layout, live, toggleAll, showTable };
}

type GrabLive = {
  sheet: SheetSize | null;
  snap: (target: Snap, from: number) => void;
  curH: () => number;
  peekH: () => number;
  height: Animated.Value;
  setAnim: (on: boolean) => void;
};

/**
 * 拉柄、站名、分頁嗰部分：手機可以拉上拉落（同網頁一樣嘅規則）。郁咗 6px 而且係直向先當拖，輕撳分頁、關閉掣照用得；
 * 放手時：全開向下掃 → 半開；半開向下掃 → 關閉；向上掃 → 全開；慢慢放 → 近邊個用邊個；拉低過半開 70（由全開拉就要低過半開一半）→ 關閉。
 */
export function SheetGrab({ live, children }: { live: RefObject<GrabLive | null>; children: React.ReactNode }) {
  const [responder] = useState(() => {
    let h0 = 0;
    const clampH = (h: number) => Math.max(60, Math.min(live.current?.sheet?.full ?? h, h));
    const end = (dy: number, vy: number) => {
      const L = live.current;
      if (!L?.sheet) return;
      const h = clampH(h0 - dy);
      const peek = L.peekH();
      const fromFull = h0 > peek + 20;
      let target: Snap;
      if (h < (fromFull ? peek * 0.5 : peek - 70)) target = 'close';
      else if (vy > 0.4) target = fromFull ? 'peek' : 'close';
      else if (vy < -0.4) target = 'full';
      else target = h > (peek + L.sheet.full) / 2 ? 'full' : 'peek';
      L.snap(target, h);
    };
    const want = (dx: number, dy: number) => !!live.current?.sheet && Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx);
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => want(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => want(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const L = live.current!;
        L.height.stopAnimation();
        h0 = L.curH();
        L.height.setValue(h0);
        L.setAnim(true);
      },
      onPanResponderMove: (_, g) => live.current?.height.setValue(clampH(h0 - g.dy)),
      onPanResponderRelease: (_, g) => end(g.dy, g.vy),
      onPanResponderTerminate: (_, g) => end(g.dy, g.vy),
    });
  });
  return <View {...responder.panHandlers}>{children}</View>;
}

