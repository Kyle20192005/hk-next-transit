import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

/**
 * 「路綫圖 N」logo 圖案（冇底色）：放喺黃色標題列。起點站空心（用標題列底色填），下一站白色。
 * 原稿 docs/brand/；網頁版 apps/web/components/Logo.tsx。
 */
export function Logo({ size = 28 }: { size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={(size * 744) / 672} viewBox="176 140 672 744">
      <Path d="M300 742 V300 L724 724 V282" fill="none" stroke={t.onBrand} strokeWidth={124} strokeLinejoin="round" />
      <Circle cx={300} cy={760} r={92} fill={t.brand} stroke={t.onBrand} strokeWidth={56} />
      <Circle cx={724} cy={264} r={92} fill="#ffffff" stroke={t.onBrand} strokeWidth={56} />
    </Svg>
  );
}
