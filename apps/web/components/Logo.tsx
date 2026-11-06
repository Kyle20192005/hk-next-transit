/**
 * 「路綫圖 N」logo 圖案（冇底色）：放喺黃色標題列。起點站空心（用標題列底色 --brand 填），下一站白色。
 * 原稿 docs/brand/；App 版 apps/mobile/src/components/Logo.tsx。
 */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={(size * 744) / 672} viewBox="176 140 672 744" aria-hidden="true">
      <path d="M300 742 V300 L724 724 V282" fill="none" stroke="var(--on-brand)" strokeWidth="124" strokeLinejoin="round" />
      <circle cx="300" cy="760" r="92" fill="var(--brand)" stroke="var(--on-brand)" strokeWidth="56" />
      <circle cx="724" cy="264" r="92" fill="#ffffff" stroke="var(--on-brand)" strokeWidth="56" />
    </svg>
  );
}
