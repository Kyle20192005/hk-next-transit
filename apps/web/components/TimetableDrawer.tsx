'use client';
import Icon from './Icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtMinutes, serviceDaysLabel, timetableDay, timetableMarker, timetablePeriods, type Calendar } from '@hknt/core';

export interface DrawerVariant {
  id: string;
  label: string;
  special: boolean;
  schedules: { serviceId: string; departures: number[] }[];
  /** 總站行到尾站要幾多分鐘（尾班仲喺唔喺路上） */
  runMin: number;
}

type Props = {
  variants: DrawerVariant[];
  selectedId: string | null;
  /** 只包呢啲走法用到嘅 serviceId */
  calendar: Calendar;
};

const time = (m: number) => `${m >= 1440 ? '翌日 ' : ''}${fmtMinutes(m)}`;

/**
 * 詳細班次：撳標題列「班次」由右邊拉出。
 * 按服務日子分頁（預設今日），時段由時間表還原（每 N 分鐘一班），今日而家嘅時段會標示同捲到。
 */
export default function TimetableDrawer({ variants, selectedId, calendar }: Props) {
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState(selectedId ?? variants[0]?.id ?? null);
  const v = variants.find((x) => x.id === variantId) ?? variants[0];
  // 服務日：琴晚過咗午夜嘅班次未行完就仲係琴日（core timetableDay）；只喺打開時計（伺服器唔使）
  const [openedAt, setOpenedAt] = useState(0);
  const day = useMemo(() => (v && openedAt ? timetableDay(v, calendar, new Date(openedAt)) : null), [v, calendar, openedAt]);
  const today = day?.serviceIds ?? new Set<string>();
  const nowMinutes = day?.minutes ?? 0;

  // 服務日子分頁：同一組日子嘅 serviceId 併埋
  const tabs = useMemo(() => {
    const groups = new Map<string, { label: string; ids: string[]; today: boolean; order: number }>();
    for (const s of v?.schedules ?? []) {
      const c = calendar[s.serviceId];
      const label = c ? serviceDaysLabel(c.days) : '其他';
      const order = c ? c.days.findIndex(Boolean) : 9;
      const g = groups.get(label) ?? { label, ids: [], today: false, order };
      g.ids.push(s.serviceId);
      g.today ||= today.has(s.serviceId);
      groups.set(label, g);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, calendar, day]);

  const [tab, setTab] = useState<string | null>(null);
  const current = tabs.find((t) => t.label === tab) ?? tabs.find((t) => t.today) ?? tabs[0];
  const isToday = current?.today ?? false;

  const periods = useMemo(() => {
    if (!v || !current) return [];
    return timetablePeriods(v.schedules.filter((s) => current.ids.includes(s.serviceId)).flatMap((s) => s.departures));
  }, [v, current]);

  // 而家嘅時段／下一班／尾班已開出：今日（服務日）分頁先標示
  const marker = isToday && v ? timetableMarker(periods, nowMinutes, v.runMin) : null;
  const markIndex = marker?.index ?? -1;

  const nowRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => nowRow.current?.scrollIntoView({ block: 'center' }));
  }, [open, markIndex, variantId, current?.label]);

  // Esc 收埋
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!variants.length) return null;
  return (
    <>
      <button
        className="bar-btn"
        onClick={() => {
          setOpenedAt(Date.now());
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label="詳細班次"
      >
        <Icon name="clock" />
      </button>
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer" role="dialog" aria-label="詳細班次" onClick={(e) => e.stopPropagation()}>
            <header className="drawer-head">
              <strong>詳細班次</strong>
              <button className="drawer-close" onClick={() => setOpen(false)} aria-label="關閉">
                <Icon name="close" size={20} />
              </button>
            </header>

            {variants.length > 1 && (
              <select className="drawer-select" value={v?.id} onChange={(e) => setVariantId(e.target.value)} aria-label="走法">
                {variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.special ? '特別班：' : ''}
                    {x.label}
                  </option>
                ))}
              </select>
            )}

            {tabs.length > 0 ? (
              <>
                <nav className="drawer-tabs" role="tablist">
                  {tabs.map((t) => (
                    <button key={t.label} role="tab" aria-selected={t.label === current?.label} onClick={() => setTab(t.label)}>
                      {t.label}
                      {t.today && <small>今日</small>}
                    </button>
                  ))}
                </nav>
                <p className="muted drawer-note">由總站開出時間</p>
                <ol className="periods">
                  {periods.map((p, i) => {
                    const hl = i === markIndex;
                    return (
                      <li key={`${p.start}-${i}`} ref={hl ? nowRow : undefined} className={hl ? 'now' : undefined}>
                        <span className="period-time">
                          {time(p.start)}
                          {p.headway !== null && <> – {time(p.end)}</>}
                        </span>
                        <span className="period-freq">{p.headway !== null ? `每 ${p.headway} 分鐘` : ''}</span>
                        {hl && <span className="period-tag">{marker!.kind === 'now' ? '而家' : marker!.kind === 'next' ? '下一班' : '尾班已開出'}</span>}
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="muted drawer-note">呢個走法冇時間表資料</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
