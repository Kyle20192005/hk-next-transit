import { GMB_REGION_NAME, routeRegion } from '@hknt/core';

/**
 * 專線小巴地區標籤（港島／九龍／新界）：同一個號碼三個地區都可以有（例如 2 號），所以號碼旁邊標埋。
 * 其他公司冇地區，乜都唔出。中性灰邊，唔用公司色（公司色係 CompanyTag）。
 */
export default function RegionTag({ co, route, className }: { co: string | undefined; route: string; className?: string }) {
  const region = routeRegion(co, route);
  if (!region) return null;
  return <span className={`region-tag${className ? ` ${className}` : ''}`}>{GMB_REGION_NAME[region]}</span>;
}
