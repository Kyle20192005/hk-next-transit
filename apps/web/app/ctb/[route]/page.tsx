import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fmtMinutes,
  serviceWindow,
  smoothLine,
  stopCumMetres,
  type LatLng,
  sortVariants,
  statusText,
  variantLabel,
  variantStops,
  variantsForDir,
  type Dir,
} from '@hknt/core';
import { getCalendar, getCtbRoute } from '@/lib/data';
import StopList from '@/components/StopList';
import VariantPicker, { type VariantItem } from '@/components/VariantPicker';
import RouteMap, { type MapLine, type MapStop } from '@/components/RouteMapLazy';

type Props = {
  params: Promise<{ route: string }>;
  /** dir：方向；v：走法；stop：打開時自動打開嘅站（由「附近」撳入嚟） */
  searchParams: Promise<{ dir?: string; v?: string; stop?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { route } = await params;
  const data = await getCtbRoute(route);
  if (!data) return { title: '搵唔到路線' };
  return {
    title: `城巴 ${data.route} 到站時間`,
    description: `城巴 ${data.route} ${data.origTc} ⇄ ${data.destTc} 實時到站時間、特別班次走法及服務時間。`,
  };
}

/**
 * 路線頁：上面（標題、方向、走法、地圖）固定，只有站點列表捲動。
 */
export default async function RoutePage({ params, searchParams }: Props) {
  const [{ route }, { dir: dirParam, v: vParam, stop: stopParam }] = await Promise.all([params, searchParams]);
  const [data, calendar] = await Promise.all([getCtbRoute(route), getCalendar()]);
  if (!data) notFound();

  const now = new Date();
  const dirs = (['O', 'I'] as Dir[]).filter((d) => data.directions[d]?.length);
  const dir: Dir = dirs.includes(dirParam as Dir) ? (dirParam as Dir) : (dirs[0] ?? 'O');

  // 走法：現正服務嘅排先；預設揀第一個，用戶可以用 ?v= 揀其他
  const sorted = sortVariants(variantsForDir(data, dir), calendar, now);
  // 指定咗站（由「附近」撳入嚟）但冇指定走法：揀第一個經過呢個站嘅走法
  const withStop = stopParam ? sorted.find((x) => `${dir}:${stopParam}` in x.variant.expSeq)?.variant : undefined;
  const selected = sorted.find((x) => x.variant.id === vParam)?.variant ?? withStop ?? sorted[0]?.variant;

  const items: VariantItem[] = sorted.map(({ variant: v, status }) => {
    const w = serviceWindow(v, calendar, now);
    return {
      id: v.id,
      href: `?dir=${dir}&v=${v.id}`,
      label: variantLabel(v),
      special: v.special,
      running: status.state === 'running',
      status: statusText(status),
      statusShort: statusText(status, true),
      window: w ? `今日 ${fmtMinutes(w[0])}–${w[1] >= 1440 ? '翌日 ' : ''}${fmtMinutes(w[1])} 由總站開出` : null,
    };
  });

  // 站點：有政府走法就跟走法；冇就用城巴嘅合併列表
  const stops = (
    selected ? variantStops(selected) : (data.directions[dir] ?? []).map((stopId) => ({ dir, stopId }))
  ).map((s) => ({ dir: s.dir, stopId: s.stopId, name: data.stops[s.stopId]?.nameTc ?? s.stopId }));
  const dest = stops[stops.length - 1]?.name;
  // 平均行車時間：攞到即時數據之前先用
  const segSeconds = selected?.segSeconds ?? null;
  const other = dirs.find((d) => d !== dir);
  const initialOpen = stopParam ? stops.findIndex((s) => s.stopId === stopParam) : -1;

  const mapStops: MapStop[] = stops.flatMap((s, i) => {
    const info = data.stops[s.stopId];
    return info ? [{ index: i, name: info.nameTc, lat: info.lat, lng: info.lng }] : [];
  });
  const mapLines: MapLine[] = sorted
    .filter((x) => x.variant.line)
    .map((x) => ({
      id: x.variant.id,
      selected: x.variant.id === selected?.id,
      special: x.variant.special,
      segments: x.variant.line!.map((seg) => smoothLine(seg.map(([lng, lat]) => [lat, lng] as [number, number]))),
    }));

  // 每個站沿走線嘅累計距離（米），用嚟顯示「仲有幾遠」
  const selLine = mapLines.find((l) => l.selected);
  const path: LatLng[] = selLine ? selLine.segments.flatMap((seg, i) => (i === 0 ? seg : seg.slice(1))) : [];
  const cumMetres = stopCumMetres(
    path,
    stops.map((s) => {
      const info = data.stops[s.stopId];
      return (info ? [info.lat, info.lng] : [0, 0]) as LatLng;
    }),
  ).map((m) => Math.round(m));

  return (
    <main className="route-page">
      <div className="route-top">
        <header className="route-bar">
          <Link href="/" className="back" aria-label="返回路線列表">
            ‹
          </Link>
          <h1>
            <small>城巴</small>
            {data.route}
          </h1>
          <span className="route-dest">
            <small>往</small>
            {dest}
          </span>
          {other && (
            <Link
              className="swap"
              href={`?dir=${other}`}
              replace
              scroll={false}
              aria-label={`轉方向：往 ${data.stops[data.directions[other]!.at(-1)!]?.nameTc}`}
            >
              ⇅
            </Link>
          )}
        </header>

        <VariantPicker key={dir} items={items} selectedId={selected?.id ?? null} />

        {mapStops.length > 0 && <RouteMap key={`${dir}-${selected?.id}`} lines={mapLines} stops={mapStops} />}
      </div>

      <div className="route-stops card">
        <StopList
          key={`${dir}-${selected?.id}`}
          route={data.route}
          stops={stops}
          selectedVariantId={selected?.id ?? null}
          special={selected?.special ?? false}
          segSeconds={segSeconds}
          cumMetres={cumMetres}
          initialOpen={initialOpen >= 0 ? initialOpen : null}
        />
        <p className="muted source">
          資料來源：運輸署、城巴（DATA.GOV.HK）。行車時間：
          <a href="https://github.com/HK-Bus-ETA/hk-bus-time-between-stops" target="_blank" rel="noopener">hk-bus-time-between-stops</a>（實驗性質，僅供參考）
        </p>
      </div>
    </main>
  );
}
