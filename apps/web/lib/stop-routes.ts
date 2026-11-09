import 'server-only';
import type { StopLiveDeps } from '@hknt/core';
import { getAllStops, getIndex, getRoute } from './data';
import { liveFetch } from './live-fetch';

/**
 * `/api/stop-etas`、`/api/here` 用嘅數據來源（邏輯喺 core `stopEtas`／`hereRoutes`，同 tracker 共用）。
 * 專線小巴要請求有 `gmb=1` 先出：每個 API 自己傳 `{ gmb: gmbOptIn(searchParams) }`。
 */
export const stopLiveDeps: StopLiveDeps = { getRoute, getIndex, getAllStops, fetcher: liveFetch };
