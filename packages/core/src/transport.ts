/**
 * 交通工具分類（「路線」分頁頂部一行）。網頁同 App 共用。
 * ready = false：未做，介面顯示「功能即將推出」。
 */
export type TransportMode = 'bus' | 'rail' | 'minibus' | 'ferry' | 'tram';

/** color：首頁捷徑嘅代表色（圖示用呢隻色，底色用同色淺色） */
export const TRANSPORT_MODES: { id: TransportMode; label: string; ready: boolean; color: string }[] = [
  { id: 'bus', label: '巴士', ready: true, color: '#E89A00' },
  { id: 'rail', label: '港鐵・輕鐵', ready: true, color: '#D7282F' },
  { id: 'minibus', label: '小巴', ready: false, color: '#1E9E5A' },
  { id: 'ferry', label: '渡輪', ready: false, color: '#1E78C8' },
  { id: 'tram', label: '電車', ready: true, color: '#007A4D' },
];

/** 顏色加透明度（#RRGGBB → rgba），淺色底用 */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
