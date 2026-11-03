'use client';
import dynamic from 'next/dynamic';

export type { MapLine, MapStop } from './RouteMap';

/** Leaflet 要用 window，所以只喺瀏覽器載入 */
const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => <div className="route-map card" aria-hidden="true" />,
});

export default RouteMap;
