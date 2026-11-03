import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fmtMinutes,
  serviceWindow,
  shortName,
  sortVariants,
  statusText,
  variantStops,
  variantsForDir,
  type Dir,
  variantLabel,
} from '@hknt/core';
import { getCalendar, getCtbRoute } from '@/lib/data';
import StopRow from '@/components/StopRow';
import RouteMap, { type MapLine, type MapStop } from '@/components/RouteMapLazy';

type Props = {
  params: Promise<{ route: string }>;
  searchParams: Promise<{ dir?: string; v?: string }>;
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

export default async function RoutePage({ params, searchParams }: Props) {
  const [{ route }, { dir: dirParam, v: vParam }] = await Promise.all([params, searchParams]);
  const [data, calendar] = await Promise.all([getCtbRoute(route), getCalendar()]);
  if (!data) notFound();

  const now = new Date();
  const dirs = (['O', 'I'] as Dir[]).filter((d) => data.directions[d]?.length);
  const dir: Dir = dirs.includes(dirParam as Dir) ? (dirParam as Dir) : (dirs[0] ?? 'O');

  // 走法：現正服務嘅排先；預設揀第一個，用戶可以用 ?v= 揀其他
  const sorted = sortVariants(variantsForDir(data, dir), calendar, now);
  const selected = sorted.find((x) => x.variant.id === vParam)?.variant ?? sorted[0]?.variant;

  // 站點：有政府走法就跟走法；冇就用城巴嘅合併列表
  const stops: { dir: Dir; stopId: string }[] = selected
    ? variantStops(selected)
    : (data.directions[dir] ?? []).map((stopId) => ({ dir, stopId }));
  const dest = data.stops[stops[stops.length - 1]?.stopId ?? '']?.nameTc;

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
      segments: x.variant.line!.map((seg) => seg.map(([lng, lat]) => [lat, lng] as [number, number])),
    }));

  return (
    <main>
      <h1>城巴 {data.route}</h1>
      <div className="muted">{data.origTc} ⇄ {data.destTc}</div>

      {dirs.length > 1 && (
        <nav className="tabs" aria-label="方向">
          {dirs.map((d) => {
            const ids = data.directions[d]!;
            return (
              <Link key={d} href={`?dir=${d}`} aria-current={d === dir ? 'page' : undefined} replace scroll={false}>
                往 {data.stops[ids[ids.length - 1]!]?.nameTc}
              </Link>
            );
          })}
        </nav>
      )}
      {dirs.length === 1 && <p>往 {dest}</p>}

      {sorted.length > 0 && (
        <nav className="card variants" aria-label="走法">
          {sorted.map(({ variant: v, status }, i) => {
            const w = serviceWindow(v, calendar, now);
            const active = v.id === selected?.id;
            return (
              <Link
                key={v.id}
                href={`?dir=${dir}&v=${v.id}`}
                className={`variant${active ? ' active' : ''}`}
                aria-current={active ? 'true' : undefined}
                replace
                scroll={false}
              >
                <span className={`variant-no${status.state === 'running' ? ' running' : ''}`}>{i + 1}</span>
                <span className="variant-body">
                  <span className="variant-title">
                    {v.special && <span className="badge special">特別班</span>}
                    <strong>{variantLabel(v)}</strong>
                  </span>
                  <span className={`variant-status ${status.state === 'running' ? 'running' : 'idle'}`}>
                    {statusText(status)}
                  </span>
                  {w && (
                    <span className="muted">
                      今日 {fmtMinutes(w[0])}–{w[1] >= 1440 ? '翌日 ' : ''}
                      {fmtMinutes(w[1])} 由總站開出
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {mapStops.length > 0 && <RouteMap key={`${dir}-${selected?.id}`} lines={mapLines} stops={mapStops} />}

      <ol className="stops card">
        {stops.map((s, i) => (
          <StopRow
            key={`${s.dir}-${s.stopId}-${i}`}
            index={i}
            route={data.route}
            stopId={s.stopId}
            dir={s.dir}
            name={data.stops[s.stopId]?.nameTc ?? s.stopId}
            selectedVariantId={selected?.id ?? null}
          />
        ))}
      </ol>
    </main>
  );
}

