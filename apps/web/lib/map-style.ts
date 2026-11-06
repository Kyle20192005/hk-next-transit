import type { StyleSpecification } from 'maplibre-gl';
import { MAP_STYLE_URL, restyleMap, type MapStyleJson } from '@hknt/core';

export { firstSymbolLayer } from '@hknt/core';

/** 底圖樣式：OpenFreeMap Positron + 自己調色（core `restyleMap`，App 共用） */
let base: Promise<MapStyleJson> | null = null;

function fetchBase(): Promise<MapStyleJson> {
  base ??= fetch(MAP_STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`地圖樣式載入失敗（${r.status}）`);
    return r.json() as Promise<MapStyleJson>;
  });
  base.catch(() => (base = null)); // 失敗咗下次再試
  return base;
}

export async function loadMapStyle(dark: boolean): Promise<StyleSpecification> {
  return restyleMap(await fetchBase(), dark) as unknown as StyleSpecification;
}
