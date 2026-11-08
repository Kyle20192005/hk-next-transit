'use client';
import { forwardRef } from 'react';
import { formatDistance, lastBusText, shortName, updatedAgo, type Eta, type LastBus } from '@hknt/core';
import BusIcon from './BusIcon';
import CompanyTag from './CompanyTag';
import { COMPANIES } from '@/lib/company';
import FavButton from './FavButton';
import HereDrawer from './HereDrawer';
import type { Co } from '@/lib/data';
import Icon from './Icon';
import type { Favorite } from '@/lib/favorites';
import { usePrefs } from '@/lib/prefs';

/**
 * 時間線上嘅巴士。兩站之間嘅前半段畫喺上一個站嗰行（站點圓點以下），後半段畫喺下一個站嗰行（圓點以上）。
 * half = 'below'：t = 0–1 由圓點去到呢行底；half = 'above'：t = 0–1 由呢行頂去到圓點。
 */
export interface RowBus {
  key: number;
  /** 按時間表推算（冇實時數據）：半透明 */
  schedule?: boolean;
  half: 'below' | 'above';
  t: number;
  label: string;
  /** 公司代表色同上面圖示色 */
  color?: string;
  ink?: string;
  /** 尾班車（追蹤緊）：旁邊標「尾班」 */
  last?: boolean;
}

const busTop = (b: RowBus) =>
  b.half === 'below'
    ? `calc(var(--tl-dot-y) + (100% - var(--tl-dot-y)) * ${b.t.toFixed(3)})`
    : `calc(var(--tl-dot-y) * ${b.t.toFixed(3)})`;

type Props = {
  index: number;
  /** 聯營線：每班車標明公司 */
  multiCompany: boolean;
  name: string;
  terminus: boolean;
  open: boolean;
  onToggle: () => void;
  /** 打開咗先有：到站時間 */
  etas: Eta[] | null;
  /** 每班車而家喺邊（同 etas 對應），例如「距離 3 個站 · 1.2 公里」 */
  whereLabels: (string | null)[] | null;
  error: string | null;
  /** 攞唔到數據嘅公司（例如城巴 API 出錯） */
  failed: string[];
  now: number;
  selectedVariantId: string | null;
  /** 由打開咗嘅站去呢個站要幾多秒（只有後面嘅站先有） */
  travelSeconds: number | null;
  /** 打開咗先有：呢個站嘅尾班車（時間表估算） */
  lastBus: LastBus | null;
  /** etas 入面邊班係尾班（StopList 計：追蹤緊嘅尾班車優先，否則按時間認）；-1 = 冇 */
  lastEtaIndex: number;
  /** 呢個站上車嘅車費；joyYou = null 即係唔適用樂悠咭 */
  fare: { adult: string; joyYou: string | null } | null;
  /** 呢個係用戶最近嘅站：同用戶相距幾多米 */
  nearestMetres: number | null;
  /** 由打開咗嘅站沿路線去呢個站有幾遠（米） */
  travelMetres: number | null;
  /** 下一班車預計幾時到呢個站（毫秒） */
  nextArrival: number | null;
  /** 喺呢行時間線上顯示嘅巴士 */
  buses: RowBus[];
  /** 收藏呢個站用（終點站冇） */
  fav: Omit<Favorite, 'at'> | null;
  /** 「喺度搭得」：呢個站嘅位置同而家睇緊嘅路線 */
  here: { lat: number; lng: number; name: string; current: { co: Co; route: string; dir: 'O' | 'I' } } | null;
  /** 揀緊落車站：呢個站撳得（喺打開咗嘅站下面） */
  pickable: boolean;
  /** 呢個站係揀咗嘅落車站 */
  isAlight: boolean;
  /** 打開咗嘅站：落車站摘要 */
  alight: { name: string; summary: string } | null;
  /** 打開咗嘅站：揀緊落車站 */
  picking: boolean;
  onPickAlight: () => void;
  onClearAlight: () => void;
  /** 到站時間幾時攞到（毫秒）；clockNow 每 5 秒更新，用嚟寫「N 秒前更新」 */
  updatedAt: number | null;
  clockNow: number;
  onRefresh: () => void;
  onShare: () => void;
  /** 分享之後嘅提示（例如「已複製連結」） */
  shareNote: string | null;
};

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });

/** 一個站（時間線一行）。開定收、到站時間由 StopList 控制。 */
const StopRow = forwardRef<HTMLLIElement, Props>(function StopRow(
  { index, multiCompany, name, terminus, open, onToggle, etas, whereLabels, error, failed, now, selectedVariantId, fare, lastBus, lastEtaIndex, nearestMetres, travelSeconds, travelMetres, nextArrival, buses, fav, here, pickable, isAlight, alight, picking, onPickAlight, onClearAlight, updatedAt, clockNow, onRefresh, onShare, shareNote },
  ref,
) {
  // 尾班車：實時班次入面認到邊班係尾班就標「尾班」，提示行改用實時時間
  const lastIdx = etas ? lastEtaIndex : -1;
  const list = etas?.map((e, i) => ({ e, where: whereLabels?.[i] ?? null, isLast: i === lastIdx })) ?? null;
  // 下一班：揀咗嘅走法（或者推斷唔到走法）最早嗰班；其餘列喺下面
  const isMine = (e: Eta) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId;
  const next = list?.find((x) => isMine(x.e)) ?? null;
  const rest = list?.filter((x) => x !== next) ?? [];
  const last = lastBusText(lastBus, now, lastIdx >= 0 ? Date.parse(etas![lastIdx]!.eta!) : null);
  const minsOf = (e: Eta) => Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));
  // 設定「到站時間顯示」：鐘數模式大字係鐘數，旁邊細字先係分鐘
  const clock = usePrefs().etaFormat === 'clock';

  return (
    <li className={`stop${open ? ' open' : ''}${terminus ? ' terminus' : ''}${pickable ? ' pickable' : ''}${isAlight ? ' alight' : ''}`} ref={ref}>
      {buses.map((b) => (
        <span key={b.key} className={`tl-bus${b.schedule ? ' is-schedule' : ''}${b.last ? ' is-last' : ''}`} style={{ top: busTop(b), ...(b.color ? { background: b.color, color: b.ink } : {}) }} title={b.label} aria-hidden="true">
          <BusIcon />
        </span>
      ))}
      <button onClick={onToggle} aria-expanded={open}>
        <span className="seq">{index + 1}</span>
        <span className="tl" aria-hidden="true">
          <span className="tl-dot" />
        </span>
        <span className="stop-name">
          <span>
            {name}
            {nearestMetres !== null && (
              <span className="nearest-tag">
                <Icon name="pin" size={12} /> 最近 · {formatDistance(nearestMetres)}
              </span>
            )}
            {isAlight && <span className="nearest-tag alight-tag">落車</span>}
          </span>
          {travelSeconds !== null && travelSeconds > 0 && (
            <span className="travel" title="由打開咗嘅站出發（行車時間係實測平均，僅供參考）">
              +{Math.max(1, Math.round(travelSeconds / 60))} 分
              {travelMetres !== null && travelMetres > 0 && <span className="muted"> · {formatDistance(travelMetres)}</span>}
              {nextArrival !== null && <span className="muted"> · 約 {hhmm(nextArrival)}</span>}
            </span>
          )}
        </span>
        {fare && (
          <span className="fare" aria-label={`車費 ${fare.adult}${fare.joyYou ? `，樂悠咭 ${fare.joyYou}` : ''}`}>
            <span className="fare-adult">{fare.adult}</span>
            {fare.joyYou && <span className="fare-joy">樂悠 {fare.joyYou}</span>}
          </span>
        )}
      </button>
      {open && (
        <div className="etas" aria-live="polite">
          {error && <div className="muted">載入失敗：{error}</div>}
          {!error && list === null && <div className="muted">載入中…</div>}
          {!error && list?.length === 0 && failed.length === 0 && !last?.gone && <div className="muted">暫時冇班次</div>}
          {next && (
            <div className="eta-next">
              <span className="eta-big">
                {minsOf(next.e) === 0 ? '即將到站' : clock ? next.e.eta!.slice(11, 16) : (
                  <>
                    {minsOf(next.e)}
                    <small>分鐘</small>
                  </>
                )}
              </span>
              <span className="eta-time">{clock ? (minsOf(next.e) === 0 ? next.e.eta!.slice(11, 16) : `${minsOf(next.e)} 分鐘`) : next.e.eta!.slice(11, 16)}</span>
              <EtaTags e={next.e} multiCompany={multiCompany} isLast={next.isLast} />
              {next.where && <span className="where">{next.where}</span>}
            </div>
          )}
          {rest.length > 0 && (
            <ul className="eta-more">
              {rest.map(({ e, where, isLast }, i) => {
                const v = e.variant;
                const other = !isMine(e);
                return (
                  <li key={i} className={other ? 'eta-row-other' : undefined}>
                    <span className="eta-min">{minsOf(e) === 0 ? '即將' : clock ? e.eta!.slice(11, 16) : `${minsOf(e)} 分`}</span>
                    <span className="eta-time">{clock ? (minsOf(e) === 0 ? e.eta!.slice(11, 16) : `${minsOf(e)} 分`) : e.eta!.slice(11, 16)}</span>
                    {/* 第三欄：公司、原定、走法、位置包埋一格，太長喺格入面斷行，唔會走去分鐘下面 */}
                    <span className="eta-meta">
                      <EtaTags e={e} multiCompany={multiCompany} isLast={isLast} />
                      {/* 揀咗嘅走法唔使再標；其他走法先標出嚟 */}
                      {other && v?.name && (
                        <span className={`badge${v.special ? ' special' : ''}`} title={v.reason}>
                          {v.special ? shortName({ name: v.name }) : '正常路線'}
                          {v.confidence === 'likely' ? '（推斷）' : ''}
                        </span>
                      )}
                      {/* 細行唔使「距離」兩個字，等佢同公司標籤擠得落同一行 */}
                      {where && <span className="where">{where.replace(/^距離 /, '')}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* 尾班車：仲有車就提一提（30 分鐘內強調）；過咗而且真係冇班次就講「今日已經冇車」同下次頭班 */}
          {last && (!last.gone || (list?.length === 0 && failed.length === 0)) && (
            <div className={`last-bus${last.urgent ? ' urgent' : ''}${last.gone ? ' gone' : ''}`}>
              <Icon name="clock" size={15} /> {last.text}
            </div>
          )}
          {/* 落車站：摘要（幾點到、幾多個站、車程） */}
          {alight && !picking && (
            <div className="alight-line">
              <span>
                <b>落車：{alight.name}</b>
                <br />
                <span className="muted">{alight.summary}</span>
              </span>
              <button className="alight-clear" onClick={onClearAlight} aria-label="取消落車站">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {picking && <div className="alight-line picking">撳下面一個站做落車站</div>}
          {updatedAt !== null && (
            <div className="eta-updated">
              {updatedAgo(updatedAt, Math.max(clockNow, updatedAt))}
              <button className="link-btn" onClick={onRefresh} aria-label="重新整理到站時間">
                <Icon name="refresh" size={14} /> 重新整理
              </button>
            </div>
          )}
          {failed.length > 0 && (
            <div className="eta-failed" role="status">
              <Icon name="warning" size={16} /> {failed.map((c) => COMPANIES[c as keyof typeof COMPANIES]?.name ?? c).join('、')}資料暫時攞唔到，可能少咗班次，稍後會自動再試
            </div>
          )}
          {/* 動作列：喺到站時間下面，唔好同大字搶位 */}
          {(fav || here) && (
            <div className="etas-actions">
              {here && <HereDrawer lat={here.lat} lng={here.lng} name={here.name} current={here.current} />}
              {fav && <FavButton target={fav} variant="inline" />}
              {fav && (
                <button className={`fav-inline${picking ? ' on' : ''}`} onClick={onPickAlight} aria-pressed={picking}>
                  <Icon name="pin" size={15} /> {picking ? '取消揀落車站' : alight ? '改落車站' : '揀落車站'}
                </button>
              )}
              <button className="fav-inline" onClick={onShare}>
                <Icon name="share" size={15} /> 分享
              </button>
              {shareNote && <span className="share-note" role="status">{shareNote}</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
});

export default StopRow;

/** 班次標籤：聯營線標公司；九巴「原定班次」標「原定」（時間表時間，唔係實時） */
function EtaTags({ e, multiCompany, isLast = false }: { e: Eta; multiCompany: boolean; isLast?: boolean }) {
  return (
    <>
      {isLast && (
        <span className="last-tag" title="尾班車（按時間表估算邊班係尾班）">
          尾班
        </span>
      )}
      {multiCompany && <CompanyTag company={e.company} compact />}
      {e.scheduled && (
        <span className="scheduled" title="原定班次：時間表時間，唔係實時">
          原定
        </span>
      )}
    </>
  );
}
