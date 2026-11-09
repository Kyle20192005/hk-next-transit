'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  activeFavGroup,
  FAV_GROUP_PRESETS,
  FAV_GROUP_WINDOWS,
  favGroupWindowLabel,
  favsInGroup,
  groupFavsByRoute,
  LRT_BRAND,
  lrtDepartureRows,
  lrtRoute,
  lrtStopRoutes,
  minutesLabel,
  mtrDepartureRows,
  routeCode,
  routeTitle,
  mtrLine,
  mtrStationLines,
  newFavGroupId,
  type DepartureRow,
  type Eta,
  type FavGroupDef,
  type FavRouteGroup,
  type LrtPlatform,
  type MtrLineEtas,
} from '@hknt/core';
import CompanyTag from '@/components/CompanyTag';
import RegionTag from '@/components/RegionTag';
import Icon from '@/components/Icon';
import { warmRoute } from '@/lib/prefetch';
import { favKey, isLrtFav, isMtrFav, removeFavorite, setFavoriteGroup, useFavorites, type Favorite } from '@/lib/favorites';
import { usePrefs } from '@/lib/prefs';
import type { Co } from '@/lib/data';
import { deleteFavGroup, saveFavGroup, useFavGroups } from '@/lib/fav-groups';
import EtaInline from '@/components/EtaInline';
import { liveClient } from '@/lib/buses';

const REFRESH_MS = 30_000;

/** 打開路綫圖嗰個站（lrt = 輕鐵） */
type OnRail = (sta: string, lrt?: boolean) => void;

/**
 * 收藏：按路線分組（巴士路線、港鐵綫、輕鐵一張卡，core groupFavsByRoute），卡入面列收藏咗嘅站：
 * 巴士站直接顯示下一班；成條路線一撳就入；港鐵站顯示嗰條綫兩個方向下一班；輕鐵站顯示每條路線下一班（撳入路綫圖）。
 * 分組（例如「返工」「返屋企」，core fav-groups.ts）：頂部一行揀組，預設揀而家時段嘅組；每個收藏下面揀放入邊組。
 */
export default function Favorites({ onBrowse, onMtr }: { onBrowse: () => void; onMtr: OnRail }) {
  const list = useFavorites();
  const groups = useFavGroups();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<FavGroupDef | 'new' | null>(null);
  // 預設：而家時段嘅組（有收藏先揀），否則全部
  const active = activeFavGroup(groups, Date.now());
  const current = picked ?? (active && list.some((f) => f.group === active.id) ? active.id : 'all');
  const shown = favsInGroup(list, current, groups);
  const currentGroup = groups.find((g) => g.id === current) ?? null;

  return (
    <>
      <header className="app-bar">
        <div className="app-title">
          <h1>收藏</h1>
        </div>
      </header>
      {list.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="star" size={32} />
          </span>
          <p>
            喺巴士或小巴路線頁撳標題列嘅 <Icon name="star" size={16} /> 收藏路線，
            <br />
            或者打開一個站撳「收藏呢個站」；港鐵站、輕鐵站喺路綫圖撳站再撳 <Icon name="star" size={16} />。
          </p>
          <p className="muted">收藏咗嘅站會喺度直接顯示下一班車（只儲存喺呢部機）</p>
          <button className="primary-btn" onClick={onBrowse}>
            去路線列表
          </button>
        </div>
      ) : (
        <div className="fav-page">
          <div className="fav-groups" role="tablist" aria-label="收藏分組">
            <button role="tab" aria-selected={current === 'all'} className="news-chip" onClick={() => setPicked('all')}>
              全部 <span className="fav-count">{list.length}</span>
            </button>
            {groups.map((g) => (
              <button key={g.id} role="tab" aria-selected={current === g.id} className="news-chip" onClick={() => setPicked(g.id)}>
                {active?.id === g.id && <span className="status-dot" aria-label="而家時段" />}
                {g.name} <span className="fav-count">{list.filter((f) => f.group === g.id).length}</span>
              </button>
            ))}
            <button className="news-chip fav-group-add" onClick={() => setEditing('new')} aria-label="新增分組">
              <Icon name="plus" size={16} /> 分組
            </button>
          </div>
          {currentGroup && (
            <div className="fav-group-head">
              <span className="muted">{favGroupWindowLabel(currentGroup) ? `${favGroupWindowLabel(currentGroup)} 首頁大卡會排先` : '冇設時段'}</span>
              <button className="text-btn" onClick={() => setEditing(currentGroup)}>
                改名／時段
              </button>
            </div>
          )}
          {shown.length === 0 ? (
            <p className="feed-hint card">呢組未有收藏：喺下面「全部」入面揀收藏，再喺每個收藏下面揀「{currentGroup?.name ?? '分組'}」。</p>
          ) : (
            <div className="fav-routes">
              {groupFavsByRoute(shown).map((g) => (
                <FavRouteCard key={g.key} g={g} groups={groups} onMtr={onMtr} />
              ))}
            </div>
          )}
        </div>
      )}
      {editing && (
        <FavGroupEditor
          group={editing === 'new' ? null : editing}
          used={groups.map((g) => g.name)}
          onClose={(id) => {
            setEditing(null);
            if (id === null) setPicked('all');
            else if (id) setPicked(id);
          }}
        />
      )}
    </>
  );
}

/** 一條路線（或者港鐵綫）一張卡：頂部路線號碼／綫，下面每行一個收藏咗嘅站 */
function FavRouteCard({ g, groups, onMtr }: { g: FavRouteGroup<Favorite>; groups: FavGroupDef[]; onMtr: OnRail }) {
  const f0 = g.favs[0]!;
  const line = isMtrFav(f0) && f0.route ? mtrLine(f0.route) : undefined;
  return (
    <section className="fav-route card">
      {isLrtFav(f0) ? (
        <header className="fav-route-head">
          <span className="fav-route-bar" style={{ background: LRT_BRAND.color }} />
          <Icon name="lrt" size={20} />
          <strong className="fav-route-line">輕鐵站</strong>
          <span className="muted fav-route-sub">輕鐵</span>
        </header>
      ) : isMtrFav(f0) ? (
        <header className="fav-route-head">
          {line ? (
            <>
              <span className="fav-route-bar" style={{ background: line.color }} />
              <strong className="fav-route-line">{line.zh}</strong>
            </>
          ) : (
            <>
              <Icon name="train" size={20} />
              <strong className="fav-route-line">港鐵站</strong>
            </>
          )}
          <span className="muted fav-route-sub">港鐵</span>
        </header>
      ) : (
        <Link href={`/${f0.co}/${f0.route}?dir=${f0.dir}`} className="fav-route-head" onPointerDown={() => warmRoute(f0.co as Co, f0.route, { dir: f0.dir })}>
          <span className="route-num">{routeCode(f0.co, f0.route)}</span>
          <RegionTag co={f0.co} route={f0.route} />
          <CompanyTag companies={f0.companies} />
          <Icon name="chevron-right" size={18} className="muted fav-route-go" />
        </Link>
      )}
      <ul className="fav-route-rows">
        {g.favs.map((f) => (
          <FavItem key={favKey(f)} f={f} groups={groups} onMtr={onMtr} />
        ))}
      </ul>
    </section>
  );
}

/** 路線卡入面一行：收藏咗嘅站（站名、往邊、下一班），或者成條路線 */
export function FavItem({ f, groups = [], onMtr }: { f: Favorite; groups?: FavGroupDef[]; onMtr: OnRail }) {
  if (isMtrFav(f)) return <MtrFavItem f={f} groups={groups} onMtr={onMtr} />;
  if (isLrtFav(f)) return <LrtFavItem f={f} groups={groups} onMtr={onMtr} />;
  const co = f.co as Co;
  const href = `/${co}/${f.route}?dir=${f.dir}${f.stopId ? `&stop=${f.stopId}` : ''}`;
  return (
    <li className="fav">
      <Link href={href} className="fav-main" onPointerDown={() => warmRoute(co, f.route, { dir: f.dir, stopId: f.stopId })}>
        <span className="fav-text">
          <span className="fav-dest">
            {f.stopName ? (
              <>
                <Icon name="pin" size={15} /> {f.stopName}
              </>
            ) : (
              '成條路線'
            )}
          </span>
          <span className="fav-stop">往 {f.dest}</span>
        </span>
        {f.stopId ? <FavEtas f={f} /> : <Icon name="chevron-right" className="fav-go" />}
      </Link>
      <button className="fav-remove" onClick={() => removeFavorite(f)} aria-label={`取消收藏 ${routeTitle(f.co, f.route)}${f.stopName ? ` ${f.stopName}` : ''}`}>
        <Icon name="star-fill" size={20} />
      </button>
      <GroupPick f={f} groups={groups} label={routeTitle(f.co, f.route)} />
    </li>
  );
}

/** 每個收藏下面：放入邊個分組 */
function GroupPick({ f, groups, label }: { f: Favorite; groups: FavGroupDef[]; label: string }) {
  if (!groups.length) return null;
  return (
    <label className="fav-group-pick">
      <Icon name="folder" size={14} />
      <select value={f.group && groups.some((g) => g.id === f.group) ? f.group : ''} onChange={(e) => setFavoriteGroup(f, e.target.value || null)} aria-label={`${label} 放入分組`}>
        <option value="">未分組</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  );
}

/** 收藏咗嘅港鐵站：站名，下面嗰條綫兩個方向下一班（舊版成個站收藏：所有綫，最多 4 行）；撳入路綫圖嗰個站 */
function MtrFavItem({ f, groups, onMtr }: { f: Favorite; groups: FavGroupDef[]; onMtr: OnRail }) {
  const sta = f.stopId!;
  const { etaFormat } = usePrefs();
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.mtr(sta);
        const body = (await res.json()) as { lines?: MtrLineEtas[] };
        if (!cancelled && res.ok) setState({ rows: mtrDepartureRows(sta, body.lines ?? [], 4, f.route ? [f.route] : undefined), now: Date.now() });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sta, f.route]);
  return (
    <li className="fav fav-mtr">
      <button className="fav-main" onClick={() => onMtr(sta)}>
        <span className="fav-mtr-name">
          <Icon name="train" size={18} />
          <strong>{f.stopName}</strong>
          {!f.route && (
            <span className="fav-mtr-lines">
              {mtrStationLines(sta).map((l) => (
                <span key={l} className="mtr-chip" style={{ background: mtrLine(l)?.color, color: mtrLine(l)?.ink }}>
                  {mtrLine(l)?.zh}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="fav-mtr-rows">
          {state === null && <span className="muted">…</span>}
          {state?.rows.length === 0 && <span className="muted">{sta === 'RAC' ? '只喺賽馬日開放' : '暫時冇班次'}</span>}
          {state?.rows.map((r) => (
            <span key={r.key} className="fav-mtr-row">
              {/* 綫卡頂已經有綫色同綫名；舊版成個站收藏先要標籤分綫 */}
              {!f.route && (
                <span className="nc-badge" style={{ background: r.badge.bg, color: r.badge.ink }}>
                  {r.badge.text}
                </span>
              )}
              <span className="nc-dest">往{r.dest}</span>
              {r.platform && (
                <span className="nc-plat" style={{ background: r.badge.bg, color: r.badge.ink }}>
                  {r.platform}
                </span>
              )}
              <span className={r.nowText ? 'nc-min nc-now' : 'nc-min'}>{r.nowText ?? minutesLabel(r.at, state.now, etaFormat)}</span>
            </span>
          ))}
        </span>
      </button>
      <button className="fav-remove" onClick={() => removeFavorite(f)} aria-label={`取消收藏${f.stopName}站${f.route ? (mtrLine(f.route)?.zh ?? '') : ''}`}>
        <Icon name="star-fill" size={20} />
      </button>
      <GroupPick f={f} groups={groups} label={`${f.stopName}站`} />
    </li>
  );
}

/** 收藏咗嘅輕鐵站：站名同經過嘅路線，下面每條路線每個目的地下一班（最多 4 行，有月台）；撳入輕鐵路綫圖嗰個站 */
function LrtFavItem({ f, groups, onMtr }: { f: Favorite; groups: FavGroupDef[]; onMtr: OnRail }) {
  const sta = f.stopId!;
  const { etaFormat } = usePrefs();
  const [state, setState] = useState<{ rows: DepartureRow[]; now: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.lrt(sta);
        const body = (await res.json()) as { platforms?: LrtPlatform[] };
        const now = Date.now();
        if (!cancelled && res.ok) setState({ rows: lrtDepartureRows(sta, body.platforms ?? [], now, 4), now });
      } catch {
        /* 下次再試 */
      }
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sta]);
  return (
    <li className="fav fav-mtr">
      <button className="fav-main" onClick={() => onMtr(sta, true)}>
        <span className="fav-mtr-name">
          <Icon name="lrt" size={18} />
          <strong>{f.stopName}</strong>
          <span className="fav-mtr-lines">
            {lrtStopRoutes(sta).map((r) => (
              <span key={r} className="mtr-chip" style={{ background: lrtRoute(r)?.color, color: lrtRoute(r)?.ink }}>
                {r}
              </span>
            ))}
          </span>
        </span>
        <span className="fav-mtr-rows">
          {state === null && <span className="muted">…</span>}
          {state?.rows.length === 0 && <span className="muted">暫時冇班次</span>}
          {state?.rows.map((r) => (
            <span key={r.key} className="fav-mtr-row">
              <span className="nc-badge" style={{ background: r.badge.bg, color: r.badge.ink }}>
                {r.badge.text}
              </span>
              <span className="nc-dest">往{r.dest}</span>
              {r.platform && (
                <span className="nc-plat" style={{ background: r.badge.bg, color: r.badge.ink }}>
                  {r.platform}
                </span>
              )}
              <span className={r.nowText ? 'nc-min nc-now' : 'nc-min'}>{r.nowText ?? minutesLabel(r.at, state.now, etaFormat)}</span>
            </span>
          ))}
        </span>
      </button>
      <button className="fav-remove" onClick={() => removeFavorite(f)} aria-label={`取消收藏輕鐵${f.stopName}站`}>
        <Icon name="star-fill" size={20} />
      </button>
      <GroupPick f={f} groups={groups} label={`輕鐵${f.stopName}站`} />
    </li>
  );
}

/** 新增／修改分組：名（有建議）、時段（預設幾款）；可以刪 */
function FavGroupEditor({ group, used, onClose }: { group: FavGroupDef | null; used: string[]; onClose: (id?: string | null) => void }) {
  const suggestion = FAV_GROUP_PRESETS.find((p) => !used.includes(p.name));
  const [name, setName] = useState(group?.name ?? suggestion?.name ?? '');
  const [win, setWin] = useState(() => {
    const src = group ?? suggestion;
    const i = FAV_GROUP_WINDOWS.findIndex((w) => w.from === src?.from && w.to === src?.to);
    return i >= 0 ? i : 0;
  });
  const save = () => {
    const w = FAV_GROUP_WINDOWS[win]!;
    const id = group?.id ?? newFavGroupId();
    saveFavGroup({ id, name: name.trim().slice(0, 12), ...(w.from !== undefined && w.to !== undefined ? { from: w.from, to: w.to } : {}) });
    onClose(id);
  };
  return (
    <div className="sheet-backdrop" onClick={() => onClose()}>
      <div className="sheet card" role="dialog" aria-label={group ? '修改分組' : '新增分組'} onClick={(e) => e.stopPropagation()}>
        <h2>{group ? '修改分組' : '新增分組'}</h2>
        <label className="sheet-field">
          <span>名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="例如：返工" autoFocus />
        </label>
        {!group && (
          <div className="sheet-chips">
            {FAV_GROUP_PRESETS.filter((p) => !used.includes(p.name)).map((p) => (
              <button
                key={p.name}
                className="news-chip"
                aria-selected={name === p.name}
                onClick={() => {
                  setName(p.name);
                  const i = FAV_GROUP_WINDOWS.findIndex((w) => w.from === p.from && w.to === p.to);
                  setWin(i >= 0 ? i : 0);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="sheet-field">
          <span>時段（呢段時間首頁大卡會將呢組排先）</span>
          <div className="sheet-chips">
            {FAV_GROUP_WINDOWS.map((w, i) => (
              <button key={w.label} className="news-chip" aria-selected={win === i} onClick={() => setWin(i)}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet-actions">
          {group && (
            <button
              className="settings-btn danger"
              onClick={() => {
                if (window.confirm(`刪除「${group.name}」？入面嘅收藏唔會刪，會變返未分組。`)) {
                  deleteFavGroup(group.id);
                  onClose(null);
                }
              }}
            >
              刪除分組
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="settings-btn" onClick={() => onClose()}>
            取消
          </button>
          <button className="primary-btn" onClick={save} disabled={!name.trim()}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 收藏咗嘅站：下一兩班（同方向） */
function FavEtas({ f }: { f: Favorite }) {
  const [etas, setEtas] = useState<Eta[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await liveClient.eta(f.co, f.route, f.stopId!);
        const body = (await res.json()) as { etas?: Eta[] };
        if (!cancelled && res.ok) setEtas((body.etas ?? []).filter((e) => e.eta && e.dir === f.dir));
      } catch {
        /* 下次再試 */
      }
      if (!cancelled) setNow(Date.now());
    };
    void tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [f.co, f.route, f.stopId, f.dir]);

  if (etas === null) return <span className="fav-eta muted">…</span>;
  if (!etas.length) return <span className="fav-eta muted">冇班次</span>;
  return (
    <span className="fav-eta">
      <EtaInline ats={etas.slice(0, 3).map((e) => Date.parse(e.eta!))} now={now} restClass="muted fav-more" sep="" />
      {etas[0]?.scheduled && <span className="scheduled">原定</span>}
    </span>
  );
}
