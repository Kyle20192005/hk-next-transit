import { TurboModuleRegistry } from 'react-native';
import type { ComponentType } from 'react';
import { MapPlaceholder } from './MapPlaceholder';
import type { RouteMapProps } from './mapTypes';

export type { MapBus, MapLine, MapStop, RouteMapProps } from './mapTypes';

/**
 * 地圖用 MapLibre 原生模組。Expo Go 冇呢個模組，一 import 就爆（'MLRNCameraModule' could not be found），
 * 所以先睇模組喺唔喺度，喺度先 require；唔喺度就用佔位，App 其他功能照用得。
 */
const native: ComponentType<RouteMapProps> | null = TurboModuleRegistry.get('MLRNCameraModule')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- 要等確認有原生模組先載入
    (require('./RouteMapNative') as typeof import('./RouteMapNative')).RouteMap
  : null;

export function RouteMap(props: RouteMapProps) {
  if (native) {
    const Native = native;
    return <Native {...props} />;
  }
  return <MapPlaceholder {...props} note="Expo Go 冇地圖：要用開發版本（expo run:android／EAS build）先睇到" />;
}
