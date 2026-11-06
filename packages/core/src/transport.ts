/**
 * 交通工具分類（「路線」分頁頂部一行）。網頁同 App 共用。
 * ready = false：未做，介面顯示「功能即將推出」。
 */
export type TransportMode = 'bus' | 'rail' | 'minibus' | 'ferry' | 'tram';

export const TRANSPORT_MODES: { id: TransportMode; label: string; ready: boolean }[] = [
  { id: 'bus', label: '巴士', ready: true },
  { id: 'rail', label: '港鐵・輕鐵', ready: false },
  { id: 'minibus', label: '小巴', ready: false },
  { id: 'ferry', label: '渡輪', ready: false },
  { id: 'tram', label: '電車', ready: false },
];
