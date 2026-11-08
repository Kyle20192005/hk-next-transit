import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  lastBusAt,
  fmtMinutes,
  serviceWindow,
  runMinutes,
  routeMinutes,
  formatFare,
  joyYouFare,
  smoothLine,
  stopCumMetres,
  type LatLng,
  sortVariants,
  pickVariant,
  defaultDir,
  statusText,
  variantLabel,
  variantStops,
  variantsForDir,
  type Dir,
} from '@hknt/core';
import { getCalendar, getRoute, isCo, type Co } from '@/lib/data';
import { COMPANIES } from '@/lib/company';
import StopList from '@/components/StopList';
import SwapLink from '@/components/SwapLink';
import TimetableDrawer from '@/components/TimetableDrawer';
import FavButton from '@/components/FavButton';
import { RecordRecent } from '@/lib/recent';
import Icon from '@/components/Icon';
import VariantPicker, { type VariantItem } from '@/components/VariantPicker';
import RouteMap, { type MapLine, type MapStop } from '@/components/RouteMapLazy';

type Props = {
  /** co：ctb（城巴同聯營線）或 kmb（九巴、龍運） */
  params: Promise<{ co: string; route: string }>;
  /** dir：方向；v：走法；stop：打開時自動打開嘅站（由「附近」撳入嚟） */
  searchParams: Promise<{ dir?: string; v?: string; stop?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { co, route } = await params;
  const data = isCo(co) ? await getRoute(co, route) : null;
  if (!data) return { title: '搵唔到路線' };
  const names = companyNames(data.companies ?? [data.company]);
  return {
    title: `${names} ${data.route} 到站時間`,
    description: `${names} ${data.route} ${data.origTc} ⇄ ${data.destTc} 實時到站時間、特別班次走法及服務時間。`,
  };
}

/**
 * 路線頁：上面（標題、方向、走法、地圖）固定，只有站點列表捲動。
 */
export default async function RoutePage({ params, searchParams }: Props) {
  const [{ co: coParam, route }, { dir: dirParam, v: vParam, stop: stopParam }] = await Promise.all([params, searchParams]);
  if (!isCo(coParam)) notFound();
  const co: Co = coParam;
  const [data, calendar] = await Promise.all([getRoute(co, route), getCalendar()]);
  if (!data) notFound();
  const companies = data.companies ?? [data.company];

  const now = new Date();
  const dirs = (['O', 'I'] as Dir[]).filter((d) => data.directions[d]?.length);
  const dir: Dir = defaultDir(data, dirParam);

  // 走法：現正服務嘅排先；預設揀第一個，用戶可以用 ?v= 揀其他；指定咗站就揀第一個經過佢嘅
  // （pickVariant 同預先 fetch 共用，要一致，否則預熱嘅 /api/buses 網址對唔上）
  const sorted = sortVariants(variantsForDir(data, dir), calendar, now);
  const selected = pickVariant(sorted, dir, { variantId: vParam, stopId: stopParam });

  const items: VariantItem[] = sorted.map(({ variant: v, status }) => {
    const w = serviceWindow(v, calendar, now);
    return {
      id: v.id,
      href: `?dir=${dir}&v=${v.id}`,
      label: variantLabel(v),
      special: v.special,
      running: status.state === 'running' || status.state === 'lastRunning',
      unknown: status.state === 'unknown',
      status: statusText(status),
      statusShort: statusText(status, true),
      window: w ? `今日 ${fmtMinutes(w[0])}–${w[1] >= 1440 ? '翌日 ' : ''}${fmtMinutes(w[1])} 由總站開出` : null,
      duration: routeMinutes(v),
    };
  });

  // 站點：有政府走法就跟走法；冇就用城巴嘅合併列表
  const stops = (
    selected ? variantStops(selected) : (data.directions[dir] ?? []).map((stopId) => ({ dir, stopId }))
  ).map((s) => ({
    dir: s.dir,
    stopId: s.stopId,
    name: data.stops[s.stopId]?.nameTc ?? s.stopId,
    lat: data.stops[s.stopId]?.lat,
    lng: data.stops[s.stopId]?.lng,
  }));
  // 車費：每個站上車嘅成人車費；終點站唔使（唔會喺度上車）
  const joyYou = data.joyYou !== false;
  const fares = stops.map((s, i) => {
    const adult = i < stops.length - 1 ? selected?.fares?.[s.stopId] : undefined;
    return adult === undefined ? null : { adult: formatFare(adult), joyYou: joyYou ? formatFare(joyYouFare(adult)) : null };
  });
  // 標題列第二行：只喺唔適用樂悠咭時提示；詳細班次放喺右邊 drawer
  const serviceLine = joyYou ? null : '不設樂悠咭優惠';
  // 詳細班次 drawer：呢個方向所有走法嘅時間表，同埋用到嘅服務日曆
  // 冇時間表嘅走法（例如政府未有嘅新路線）唔放入詳細班次；全部都冇就唔出「班次」掣
  const drawerVariants = sorted
    .filter(({ variant: x }) => x.schedules.length)
    .map(({ variant: x }) => ({ id: x.id, label: variantLabel(x), special: x.special, schedules: x.schedules, runMin: runMinutes(x) }));
  const usedServices = new Set(drawerVariants.flatMap((x) => x.schedules.map((sc) => sc.serviceId)));
  const drawerCalendar = Object.fromEntries(Object.entries(calendar).filter(([id]) => usedServices.has(id)));
  const dest = stops[stops.length - 1]?.name;
  // 平均行車時間：攞到即時數據之前先用
  const segSeconds = selected?.segSeconds ?? null;
  const other = dirs.find((d) => d !== dir);
  // 轉方向時搵返對面最近嘅站：對面方向預設走法嘅站（同轉過去之後路線頁揀嘅一樣）
  const otherSel = other ? pickVariant(sortVariants(variantsForDir(data, other), calendar, now), other, {}) : null;
  const otherStops = (otherSel ? variantStops(otherSel) : other ? (data.directions[other] ?? []).map((stopId) => ({ stopId })) : []).map((s) => ({
    stopId: s.stopId,
    lat: data.stops[s.stopId]?.lat,
    lng: data.stops[s.stopId]?.lng,
  }));
  const initialOpen = stopParam ? stops.findIndex((s) => s.stopId === stopParam) : -1;
  // 尾班車：呢個方向所有走法（經過呢個站嘅）一齊計；終點站唔使（唔會喺度上車）
  const dirVariants = variantsForDir(data, dir);
  const lastBus = stops.map((s, i) => (i === stops.length - 1 ? null : lastBusAt(dirVariants, s.stopId, s.dir, calendar, now.getTime())));

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
            <Icon name="back" size={26} />
          </Link>
          <h1>
            <small>{companyNames(companies)}</small>
            {data.route}
          </h1>
          <span className="route-dest">
            <span className="route-dest-to">
              <small>往</small>
              {dest}
            </span>
            {serviceLine && <span className="route-service">{serviceLine}</span>}
          </span>
          <FavButton target={{ co, route: data.route, dir, dest: dest ?? '', companies }} />
          <RecordRecent target={{ co, route: data.route, dir, dest: dest ?? '', companies }} />
          <TimetableDrawer
            key={`${dir}-${selected?.id}`}
            variants={drawerVariants}
            selectedId={selected?.id ?? null}
            calendar={drawerCalendar}
          />
          {other && (
            <SwapLink
              other={other}
              label={`轉方向：往 ${data.stops[data.directions[other]!.at(-1)!]?.nameTc}`}
              stops={stops.map(({ lat, lng }) => ({ lat, lng }))}
              otherStops={otherStops}
            />
          )}
        </header>

        <VariantPicker key={dir} items={items} selectedId={selected?.id ?? null} />

        {mapStops.length > 0 && <RouteMap key={`${dir}-${selected?.id}`} lines={mapLines} stops={mapStops} multiCompany={companies.length > 1} company={data.company} osm={sorted.some((x) => x.variant.lineSource === 'osm')} />}
      </div>

      <div className="route-stops">
        <StopList
          co={co}
          multiCompany={companies.length > 1}
          companies={companies}
          key={`${dir}-${selected?.id}`}
          route={data.route}
          stops={stops}
          selectedVariantId={selected?.id ?? null}
          company={data.company}
          fares={fares}
          lastBus={lastBus}
          segSeconds={segSeconds}
          cumMetres={cumMetres}
          initialOpen={initialOpen >= 0 ? initialOpen : null}
        >
          <p className="muted source">
            資料來源：運輸署、{companyNames(companies)}（DATA.GOV.HK）。行車時間：
            <a href="https://github.com/HK-Bus-ETA/hk-bus-time-between-stops" target="_blank" rel="noopener">hk-bus-time-between-stops</a>（實驗性質，僅供參考）
          </p>
        </StopList>
      </div>
    </main>
  );
}

function companyNames(cos: readonly string[]): string {
  return cos.map((c) => COMPANIES[c as keyof typeof COMPANIES]?.name ?? c).join('・');
}
