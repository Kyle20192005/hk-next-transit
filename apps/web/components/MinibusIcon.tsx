/** 專線小巴圖示（正面：圓車頂、車頂路線牌、大擋風玻璃）；用 currentColor，跟外面嘅字色。App 版 Icon.tsx 嘅 MinibusGlyph 同一條路徑 */
export const MINIBUS_PATH =
  'M5 17c0 .8.3 1.5.9 2v1.2a.8.8 0 0 0 .8.8h1.1a.8.8 0 0 0 .8-.8V19h6.8v1.2a.8.8 0 0 0 .8.8h1.1a.8.8 0 0 0 .8-.8V19c.6-.5.9-1.2.9-2V9.5C19 6 16.5 4.5 12 4.5S5 6 5 9.5V17Zm3-.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm8 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6ZM17 12H7V9.5c0-1.6 1.6-2.6 5-2.6s5 1 5 2.6V12ZM9.5 2h5a.5.5 0 0 1 .5.5V4h-6V2.5a.5.5 0 0 1 .5-.5Z';

export default function MinibusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d={MINIBUS_PATH} />
    </svg>
  );
}
