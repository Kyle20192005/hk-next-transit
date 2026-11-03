import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fmtMinutes, serviceWindow, type Dir, type Variant } from '@hknt/core';
import { getCalendar, getCtbRoute } from '@/lib/data';
import { shortName, variantsForDir } from '@/lib/variant';
import StopRow from '@/components/StopRow';

type Props = { params: Promise<{ route: string }>; searchParams: Promise<{ dir?: string }> };

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
  const [{ route }, { dir: dirParam }] = await Promise.all([params, searchParams]);
  const [data, calendar] = await Promise.all([getCtbRoute(route), getCalendar()]);
  if (!data) notFound();

  const dirs = (['O', 'I'] as Dir[]).filter((d) => data.directions[d]?.length);
  const dir: Dir = dirs.includes(dirParam as Dir) ? (dirParam as Dir) : (dirs[0] ?? 'O');
  const stopIds = data.directions[dir] ?? [];
  const lastStop = stopIds.length ? data.stops[stopIds[stopIds.length - 1]!] : undefined;
  const variants = variantsForDir(data, dir);
  const now = new Date();

  return (
    <main>
      <h1>城巴 {data.route}</h1>
      <div className="muted">{data.origTc} ⇄ {data.destTc}</div>

      {dirs.length > 1 && (
        <nav className="tabs" aria-label="方向">
          {dirs.map((d) => {
            const ids = data.directions[d]!;
            const dest = data.stops[ids[ids.length - 1]!]?.nameTc;
            return (
              <Link key={d} href={`?dir=${d}`} aria-current={d === dir ? 'page' : undefined} replace scroll={false}>
                往 {dest}
              </Link>
            );
          })}
        </nav>
      )}
      {dirs.length === 1 && <p>往 {lastStop?.nameTc}</p>}

      {variants.length > 0 && (
        <section className="card variants" aria-label="走法">
          {variants.map((v) => {
            const w = serviceWindow(v, calendar, now);
            return (
              <div className="variant" key={v.id}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge${v.special ? ' special' : ''}`}>{v.special ? '特別班' : '正常'}</span>
                  <strong>{shortName(v)}</strong>
                </div>
                <div className="muted">
                  {w ? `今日 ${fmtMinutes(w[0])}–${w[1] >= 1440 ? '翌日 ' : ''}${fmtMinutes(w[1])} 由總站開出` : '今日冇班次'}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <ol className="stops card">
        {stopIds.map((sid, i) => {
          const served = variants.filter((v) => `${dir}:${sid}` in v.expSeq);
          // 只有「有走法行經呢段路但唔停呢個站」先標示；起點或終點唔同（例如中途開出嘅特別班）唔算
          const skipped = variants.filter((v) => !served.includes(v) && passesThrough(v, dir, stopIds, i));
          const partial = served.length > 0 && skipped.length > 0;
          const only = partial ? served.map(shortName) : [];
          const onlySpecial = partial && served.every((v) => v.special);
          return (
            <StopRow
              key={`${sid}-${i}`}
              seq={i + 1}
              route={data.route}
              stopId={sid}
              dir={dir}
              name={data.stops[sid]?.nameTc ?? sid}
              onlyVariants={only}
              onlySpecial={onlySpecial}
            />
          );
        })}
      </ol>
    </main>
  );
}

/** 走法喺城巴列表入面嘅範圍包唔包第 i 個站（即係行經呢段路） */
function passesThrough(v: Variant, dir: Dir, list: string[], i: number): boolean {
  const idx = v.stops
    .map((s, k) => (s && v.stopDirs[k] === dir ? list.indexOf(s) : -1))
    .filter((x) => x >= 0);
  return idx.length > 0 && Math.min(...idx) < i && i < Math.max(...idx);
}
