import type { TrackedBus } from '@hknt/core';

/** 地圖撳站 → 站點列表打開嗰個站（detail = 站喺列表嘅 index） */
export const OPEN_STOP_EVENT = 'hknt:open-stop';
/** 站點列表打開咗一個站 → 地圖放大去嗰個站 */
export const FOCUS_STOP_EVENT = 'hknt:focus-stop';
/** 成條線嘅巴士位置更新咗 → 地圖重畫 */
export const BUSES_EVENT = 'hknt:buses';

export interface BusesDetail {
  buses: TrackedBus[];
  /** 同 ETA 一致嘅每段行車時間（秒） */
  segSeconds: number[];
  /** 打開咗邊個站（地圖用嚟調整畫面同顯示 tooltip）；冇就 null */
  openIndex: number | null;
}

/** 最新一次巴士位置：地圖係延遲載入，載入時用嚟補返之前錯過咗嘅更新 */
let lastBuses: BusesDetail | null = null;
export function publishBuses(detail: BusesDetail) {
  lastBuses = detail;
  window.dispatchEvent(new CustomEvent<BusesDetail>(BUSES_EVENT, { detail }));
}
export function latestBuses(): BusesDetail | null {
  return lastBuses;
}

/** 最後一次「地圖放大去某個站」：地圖延遲載入時補返（例如由「附近」撳入嚟、一開頁就打開咗站） */
let lastFocus: number | null = null;
export function publishFocus(index: number) {
  lastFocus = index;
  window.dispatchEvent(new CustomEvent(FOCUS_STOP_EVENT, { detail: index }));
}
export function latestFocus(): number | null {
  return lastFocus;
}
