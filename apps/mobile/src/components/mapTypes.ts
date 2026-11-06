/** 路線地圖嘅資料類型（原生 MapLibre、Expo Go 佔位、web 佔位共用） */
export interface MapStop {
  index: number;
  name: string;
  lat: number;
  lng: number;
}
export interface MapBus {
  key: number;
  latitude: number;
  longitude: number;
  color: string;
  ink: string;
  /** 按時間表推算：半透明 */
  schedule: boolean;
  label: string;
}
export interface MapLine {
  id: string;
  selected: boolean;
  special: boolean;
  segments: { latitude: number; longitude: number }[][];
}

export type RouteMapProps = {
  lines: MapLine[];
  stops: MapStop[];
  buses: MapBus[];
  /** 路線公司代表色（走線、箭嘴） */
  color: string;
  company: string;
  multiCompany: boolean;
  /** 有走線來自 OpenStreetMap（底圖本身已經註明 © OpenStreetMap 貢獻者） */
  osm: boolean;
  focusIndex: number | null;
  onStopPress: (index: number) => void;
  height: number;
};
