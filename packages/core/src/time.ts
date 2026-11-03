const HK_OFFSET_MS = 8 * 3600 * 1000;

/** 香港日期 YYYYMMDD、星期（0 = 星期一）同由午夜起計嘅分鐘 */
export function hkParts(d: Date): { ymd: string; weekday: number; minutes: number } {
  const hk = new Date(d.getTime() + HK_OFFSET_MS);
  const ymd =
    hk.getUTCFullYear().toString() +
    String(hk.getUTCMonth() + 1).padStart(2, '0') +
    String(hk.getUTCDate()).padStart(2, '0');
  return {
    ymd,
    weekday: (hk.getUTCDay() + 6) % 7,
    minutes: hk.getUTCHours() * 60 + hk.getUTCMinutes() + hk.getUTCSeconds() / 60,
  };
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
