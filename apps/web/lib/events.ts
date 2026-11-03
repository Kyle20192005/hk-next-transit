import type { Eta } from '@hknt/core';

/** 地圖撳站 → 站點列表打開嗰個站（detail = 站喺列表嘅 index） */
export const OPEN_STOP_EVENT = 'hknt:open-stop';
/** 站點列表打開咗一個站 → 地圖放大去嗰個站 */
export const FOCUS_STOP_EVENT = 'hknt:focus-stop';
/** 打開咗嘅站攞到到站時間 → 地圖推算巴士位置；stopIndex = null 代表收埋咗 */
export const BUS_ETAS_EVENT = 'hknt:bus-etas';

export interface BusEtasDetail {
  stopIndex: number | null;
  /** 只包揀咗嘅走法（或者推斷唔到走法）嘅班次 */
  etas: Eta[];
}
