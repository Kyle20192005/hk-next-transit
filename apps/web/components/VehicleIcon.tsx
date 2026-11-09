import BusIcon, { BUS_PATH } from './BusIcon';
import MinibusIcon, { MINIBUS_PATH } from './MinibusIcon';

/** 公司用邊款車嘅圖示：專線小巴用小巴，其他（包括唔認得嘅公司）用巴士 */
export const isMinibus = (company: string | undefined) => company === 'GMB';

/** 時間線、公司標籤嘅車輛圖示（currentColor） */
export default function VehicleIcon({ company, size = 14 }: { company?: string; size?: number }) {
  return isMinibus(company) ? <MinibusIcon size={size} /> : <BusIcon size={size} />;
}

/** 地圖 marker（HTML 字串）用嘅 SVG 路徑 */
export const VEHICLE_PATH = (company: string | undefined) => (isMinibus(company) ? MINIBUS_PATH : BUS_PATH);
