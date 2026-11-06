import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

/**
 * 地圖底圖：OpenFreeMap（OpenStreetMap 數據，免費、唔使 key、商業用途都得）嘅 Positron 風格，
 * 再自己調色（似 Apple 地圖：淺米色底、藍色海、綠色公園、白色馬路；冇黃色馬路，唔會撞城巴黃色走線）。
 * 要註明「© OpenStreetMap 貢獻者」同 OpenFreeMap。
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

interface Palette {
  background: string;
  park: string;
  wood: string;
  residential: string;
  water: string;
  building: string;
  buildingOutline: string;
  road: string;
  roadCasing: string;
  rail: string;
  place: string;
  placeHalo: string;
  waterLabel: string;
  waterHalo: string;
  roadLabel: string;
  roadHalo: string;
}

const LIGHT: Palette = {
  background: '#f4f2ed',
  park: '#d6ebcb',
  wood: '#dcebd0',
  residential: '#efece6',
  water: '#a8d4f0',
  building: '#e7e3dc',
  buildingOutline: '#dcd7cf',
  road: '#ffffff',
  roadCasing: '#ddd8cf',
  rail: '#c8c6c2',
  place: '#3d3d3d',
  placeHalo: '#f4f2ed',
  waterLabel: '#3f7aa6',
  waterHalo: 'rgba(168,212,240,0.8)',
  roadLabel: '#8a857d',
  roadHalo: '#ffffff',
};

const DARK: Palette = {
  background: '#1e2124',
  park: '#233127',
  wood: '#24312a',
  residential: '#22262a',
  water: '#1c3347',
  building: '#2b2f34',
  buildingOutline: '#33383e',
  road: '#3a3f45',
  roadCasing: '#2a2e33',
  rail: '#4a4f55',
  place: '#d6d8db',
  placeHalo: '#1e2124',
  waterLabel: '#7fb2d8',
  waterHalo: 'rgba(28,51,71,0.8)',
  roadLabel: '#9aa0a6',
  roadHalo: '#1e2124',
};

/** 香港地名用中文（OSM 嘅 name 通常係「中文 English」） */
const ZH_NAME = ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name:zh'], ['get', 'name:nonlatin'], ['get', 'name']];

/** 唔要嘅圖層：路牌（香港冇數據，會出白色方格）、行政界線、機場等 */
const DROP = /shield|boundary|subtle|highway-name-path|aeroway|waterway_line_label/;

let base: Promise<StyleSpecification> | null = null;

function fetchBase(): Promise<StyleSpecification> {
  base ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`地圖樣式載入失敗（${r.status}）`);
    return r.json() as Promise<StyleSpecification>;
  });
  base.catch(() => (base = null)); // 失敗咗下次再試
  return base;
}

export async function loadMapStyle(dark: boolean): Promise<StyleSpecification> {
  const src = await fetchBase();
  const st: StyleSpecification = structuredClone(src);
  const c = dark ? DARK : LIGHT;
  st.layers = st.layers.filter((l) => !DROP.test(l.id));
  const paint = (id: string, key: string, value: unknown) => {
    const l = st.layers.find((x) => x.id === id) as (LayerSpecification & { paint?: Record<string, unknown> }) | undefined;
    if (l) (l.paint ??= {})[key] = value;
  };
  paint('background', 'background-color', c.background);
  paint('park', 'fill-color', c.park);
  paint('landcover_wood', 'fill-color', c.wood);
  paint('landuse_residential', 'fill-color', c.residential);
  paint('water', 'fill-color', c.water);
  paint('waterway', 'line-color', c.water);
  paint('building', 'fill-color', c.building);
  paint('building', 'fill-outline-color', c.buildingOutline);
  paint('road_area_pier', 'fill-color', c.background);
  paint('road_pier', 'line-color', c.background);
  for (const id of ['highway_minor', 'highway_path']) paint(id, 'line-color', c.road);
  for (const id of ['highway_major_casing', 'highway_motorway_casing', 'highway_motorway_bridge_casing', 'tunnel_motorway_casing']) paint(id, 'line-color', c.roadCasing);
  for (const id of ['highway_major_inner', 'highway_motorway_inner', 'highway_motorway_bridge_inner', 'tunnel_motorway_inner']) paint(id, 'line-color', c.road);
  for (const id of ['railway', 'railway_transit', 'railway_service']) paint(id, 'line-color', c.rail);
  for (const id of ['railway_dashline', 'railway_transit_dashline', 'railway_service_dashline']) paint(id, 'line-color', c.background);
  for (const l of st.layers) {
    if (l.type !== 'symbol') continue;
    const layout = (l.layout ??= {}) as Record<string, unknown>;
    if (layout['text-field']) layout['text-field'] = ZH_NAME;
    // 斜體中文好難睇：一律改正體
    const font = layout['text-font'];
    if (Array.isArray(font)) layout['text-font'] = font.map((f) => (typeof f === 'string' ? f.replace('Italic', 'Regular') : f));
    const p = ((l as { paint?: Record<string, unknown> }).paint ??= {});
    if (l.id.startsWith('label_')) Object.assign(p, { 'text-color': c.place, 'text-halo-color': c.placeHalo, 'text-halo-width': 1.5, 'text-halo-blur': 0 });
    else if (l.id.startsWith('water')) Object.assign(p, { 'text-color': c.waterLabel, 'text-halo-color': c.waterHalo });
    else Object.assign(p, { 'text-color': c.roadLabel, 'text-halo-color': c.roadHalo, 'text-halo-width': 1.2 });
  }
  return st;
}

/** 第一個文字圖層：走線放喺佢下面，地名唔會俾走線遮住 */
export function firstSymbolLayer(st: StyleSpecification): string | undefined {
  return st.layers.find((l) => l.type === 'symbol')?.id;
}
