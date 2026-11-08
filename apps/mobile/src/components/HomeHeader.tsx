import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadow, useTheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Brand, BRAND_ROW } from './ui';

/** 頂部一行上下嘅空位 */
const PAD = 12;

type Box = { x: number; y: number; w: number; h: number };
const box = (e: LayoutChangeEvent): Box => {
  const l = e.nativeEvent.layout;
  return { x: l.x, y: l.y, w: l.width, h: l.height };
};

/**
 * 首頁 header（一件嘢，會收縮；同網頁 components/home/HomeHeader.tsx 一樣）：頂部「logo 下一程 NextLeg」+ 大字地區 + 搜尋欄。
 * 浮喺捲動區上面（捲動內容頂留返 header 咁高嘅位）。捲上去時黃色底同捲動 1:1 收起，內容黐住佢底，收到剩頂部一行。
 * 收縮期間：大字一路縮細移位飛去頂部右邊變地區膠囊；英文名同「最近巴士站」跟黃色底收走；
 * 搜尋欄一路縮細移位變成頂部右邊搜尋掣（白色漸變做掣嘅顏色）。全部原生動畫（transform／opacity），位置靠 onLayout。
 */
export function HomeHeader({
  scrollY,
  onHeight,
  onRange,
  name,
  en,
  sub,
  pill,
  onSearch,
  status,
}: {
  scrollY: Animated.Value;
  /** header 高度（捲動內容頂要留咁多位） */
  onHeight: (h: number) => void;
  /** 收縮距離（捲幾多就收埋），首頁用嚟停喺一半時自動捲去收埋／展開 */
  onRange?: (d: number) => void;
  name: string;
  en?: string | null;
  sub: ReactNode;
  pill: string | null;
  onSearch: () => void;
  status: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [H, setH] = useState(300);
  const [bar, setBar] = useState<Box>({ x: 0, y: 0, w: 0, h: 48 });
  const [loc, setLoc] = useState<Box>({ x: 0, y: 60, w: 0, h: 100 });
  const [nameB, setNameB] = useState<Box>({ x: 0, y: 0, w: 120, h: 46 });
  const [pillB, setPillB] = useState<Box>({ x: 0, y: 0, w: 70, h: 28 });
  const [btnB, setBtnB] = useState<Box>({ x: 0, y: 0, w: 40, h: 40 });
  const [search, setSearch] = useState<Box>({ x: 16, y: 200, w: 300, h: 50 });

  // 收縮距離：收到頂部一行上下留一樣嘅位（PAD），膠囊同搜尋掣就喺 header 正中
  const D = Math.max(1, H - (bar.y + bar.h + PAD));
  useEffect(() => onRange?.(D), [D, onRange]);
  const ease = Easing.inOut(Easing.cubic);
  /** 由 from 變到 to（捲 0 → D），e = 用頭尾慢嘅節奏 */
  const lerp = (to: number, e = true, from = 0) => scrollY.interpolate({ inputRange: [0, D], outputRange: [from, to], extrapolate: 'clamp', ...(e ? { easing: ease } : {}) });
  const between = (a: number, b: number, from: number, to: number) => scrollY.interpolate({ inputRange: [a, b], outputRange: [from, to], extrapolate: 'clamp' });

  // 大字 → 地區膠囊（中心對中心，縮到膠囊字咁大）
  const nameAbs = { x: loc.x + nameB.x, y: loc.y + nameB.y };
  const pillAbs = { x: bar.x + pillB.x, y: bar.y + pillB.y };
  const nameDx = pillAbs.x + pillB.w / 2 - (nameAbs.x + nameB.w / 2);
  const nameDy = pillAbs.y + pillB.h / 2 - (nameAbs.y + nameB.h / 2);
  const nameScale = 14 / 38;
  const hasPill = !!pill;
  // 搜尋欄 → 搜尋掣
  const btnAbs = { x: bar.x + btnB.x, y: bar.y + btnB.y };
  const sDx = btnAbs.x + btnB.w / 2 - (search.x + search.w / 2);
  const sDy = btnAbs.y + btnB.h / 2 - (search.y + search.h / 2);
  const restTop = loc.y + nameB.y + nameB.h;

  return (
    <View pointerEvents="box-none" onLayout={(e) => (setH(e.nativeEvent.layout.height), onHeight(e.nativeEvent.layout.height))} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top + PAD, paddingHorizontal: 16, paddingBottom: 18, gap: 10 }}>
      {/* 黃色底：同捲動 1:1 收起；上面再墊一截，iPhone 拉落唔露灰 */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -600, bottom: 0, backgroundColor: t.brand, borderBottomLeftRadius: radius.bar, borderBottomRightRadius: radius.bar, transform: [{ translateY: lerp(-D, false) }], ...shadow }} />
      <View onLayout={(e) => setBar(box(e))} style={BRAND_ROW}>
        <Brand />
        <View style={{ flex: 1 }} />
        {pill && (
          <Animated.View onLayout={(e) => setPillB(box(e))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160, paddingVertical: 5, paddingLeft: 8, paddingRight: 10, borderRadius: 999, backgroundColor: t.onBrandSoft, opacity: between(D * 0.9, D, 0, 1) }}>
            <Icon name="navigate" size={13} color={t.onBrand} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: t.onBrand }}>
              {pill}
            </Text>
          </Animated.View>
        )}
        <Animated.View onLayout={(e) => setBtnB(box(e))} style={{ marginLeft: 6, opacity: between(D * 0.85, D, 0, 1) }}>
          <Pressable onPress={onSearch} accessibilityLabel="導航：想去邊度？" hitSlop={6} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.onBrandSoft }}>
            <Icon name="search" size={22} color={t.onBrand} />
          </Pressable>
        </Animated.View>
      </View>

      <View onLayout={(e) => setLoc(box(e))} pointerEvents="box-none" style={{ alignItems: 'center', paddingTop: 4 }}>
        <Animated.Text
          onLayout={(e) => setNameB(box(e))}
          numberOfLines={1}
          style={{
            fontSize: 38,
            fontWeight: '900',
            color: t.onBrand,
            letterSpacing: 0.5,
            opacity: hasPill ? between(D * 0.9, D, 1, 0) : between(0, Math.max(1, nameAbs.y - bar.y - bar.h), 1, 0),
            transform: hasPill
              ? [{ translateX: lerp(nameDx) }, { translateY: lerp(nameDy) }, { scale: lerp(nameScale, true, 1) }]
              : [{ translateY: lerp(-D, false) }],
          }}
        >
          {name}
        </Animated.Text>
        {/* 英文名、最近巴士站：跟黃色底收走，淡得快啲唔好同縮緊嘅大字疊埋 */}
        <Animated.View pointerEvents="box-none" style={{ alignItems: 'center', opacity: between(0, Math.max(1, (restTop - bar.y - bar.h) * 0.45), 1, 0), transform: [{ translateY: lerp(-D, false) }] }}>
          {en && <Text style={{ marginTop: -2, fontSize: 18, fontWeight: '800', color: t.onBrand, opacity: 0.85 }}>{en}</Text>}
          <View style={{ marginTop: 4 }}>{sub}</View>
        </Animated.View>
      </View>

      <Animated.View
        onLayout={(e) => setSearch(box(e))}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 50,
          paddingRight: 6,
          borderRadius: radius.m,
          backgroundColor: t.card,
          overflow: 'hidden',
          ...shadow,
          opacity: between(D * 0.85, D, 1, 0),
          transform: [
            { translateX: lerp(sDx) },
            { translateY: lerp(sDy) },
            { scaleX: lerp(btnB.w / Math.max(1, search.w), true, 1) },
            { scaleY: lerp(btnB.h / Math.max(1, search.h), true, 1) },
          ],
        }}
      >
        {/* 白色慢慢變做搜尋掣嘅顏色（黃色加少少黑） */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.brand, opacity: lerp(1) }}>
          <View style={{ flex: 1, backgroundColor: t.onBrandSoft }} />
        </Animated.View>
        <Animated.View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', opacity: between(0, D * 0.3, 1, 0) }}>
          <Pressable onPress={onSearch} accessibilityRole="search" accessibilityLabel="導航：想去邊度？" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, alignSelf: 'stretch' }}>
            <Icon name="search" size={20} color={t.muted} />
            <Text style={{ fontSize: 17, color: t.muted }}>想去邊度？</Text>
          </Pressable>
          {status}
        </Animated.View>
      </Animated.View>
    </View>
  );
}
