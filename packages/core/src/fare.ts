/**
 * 樂悠咭（「兩蚊兩折」，2026-04-03 起）：
 * 成人車費 $10 或以下收 $2（車費低過 $2 就收原價）；超過 $10 收成人車費兩成，四捨五入至一毫。
 */
export function joyYouFare(adult: number): number {
  if (adult <= 10) return Math.min(2, adult);
  return Math.round(adult * 2) / 10; // = round(adult * 0.2, 1)
}

/** 車費文字：$6.6、$2、$12.9 */
export function formatFare(n: number): string {
  return `$${Number.isInteger(n) ? n : n.toFixed(1)}`;
}
