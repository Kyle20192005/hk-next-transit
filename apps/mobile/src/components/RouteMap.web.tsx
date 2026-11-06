import { MapPlaceholder } from './MapPlaceholder';
import type { RouteMapProps } from './mapTypes';

export type { MapBus, MapLine, MapStop, RouteMapProps } from './mapTypes';

/**
 * 瀏覽器版（只用嚟喺開發時預覽 App 版面）：MapLibre 原生地圖唔支援 web，只畫佔位。
 * 真正用戶用網頁版（apps/web）。
 */
export function RouteMap(props: RouteMapProps) {
  return <MapPlaceholder {...props} note="地圖（手機 App 先顯示）" />;
}
