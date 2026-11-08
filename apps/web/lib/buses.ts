import { createBusesClient } from '@hknt/core';

/**
 * 巴士位置：設咗 NEXT_PUBLIC_TRACKER_URL（香港 VPS 嘅 tracker）就先問 tracker，出錯自動退返本站 /api/buses。
 * 網址要喺 Vercel 環境變數設定，改咗要重新部署（NEXT_PUBLIC_ 喺 build 時寫入）。
 */
export const busesClient = createBusesClient({ trackerBase: process.env.NEXT_PUBLIC_TRACKER_URL, fallbackBase: '' });
