'use client';
import { forwardRef } from 'react';
import { formatDistance, shortName, type Eta } from '@hknt/core';
import BusIcon from './BusIcon';
import CompanyTag from './CompanyTag';
import { COMPANIES } from '@/lib/company';
import FavButton from './FavButton';
import HereDrawer from './HereDrawer';
import type { Co } from '@/lib/data';
import Icon from './Icon';
import type { Favorite } from '@/lib/favorites';

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
};

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });

/** 一個站（時間線一行）。開定收、到站時間由 StopList 控制。 */
const StopRow = forwardRef<HTMLLIElement, Props>(function StopRow(
  { index, multiCompany, name, terminus, open, onToggle, etas, whereLabels, error, failed, now, selectedVariantId, fare, nearestMetres, travelSeconds, travelMetres, nextArrival, buses, fav, here },
  ref,
) {
  const list = etas?.map((e, i) => ({ e, where: whereLabels?.[i] ?? null })) ?? null;
  // 下一班：揀咗嘅走法（或者推斷唔到走法）最早嗰班；其餘列喺下面
  const isMine = (e: Eta) => !selectedVariantId || !e.variant?.variantId || e.variant.variantId === selectedVariantId;
  const next = list?.find((x) => isMine(x.e)) ?? null;
  const rest = list?.filter((x) => x !== next) ?? [];
  const minsOf = (e: Eta) => Math.max(0, Math.round((Date.parse(e.eta!) - now) / 60000));

  return (
    <li className={`stop${open ? ' open' : ''}${terminus ? ' terminus' : ''}`} ref={ref}>
      {buses.map((b) => (
        <span key={b.key} className={`tl-bus${b.schedule ? ' is-schedule' : ''}`} style={{ top: busTop(b), ...(b.color ? { background: b.color, color: b.ink } : {}) }} title={b.label} aria-hidden="true">
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
          {!error && list?.length === 0 && failed.length === 0 && <div className="muted">暫時冇班次</div>}
          {next && (
            <div className="eta-next">
              <span className="eta-big">
                {minsOf(next.e) === 0 ? '即將到站' : (
                  <>
                    {minsOf(next.e)}
                    <small>分鐘</small>
                  </>
                )}
              </span>
              <span className="eta-time">{next.e.eta!.slice(11, 16)}</span>
              <EtaTags e={next.e} multiCompany={multiCompany} />
              {next.where && <span className="where">{next.where}</span>}
            </div>
          )}
          {rest.length > 0 && (
            <ul className="eta-more">
              {rest.map(({ e, where }, i) => {
                const v = e.variant;
                const other = !isMine(e);
                return (
                  <li key={i} className={other ? 'eta-row-other' : undefined}>
                    <span className="eta-min">{minsOf(e) === 0 ? '即將' : `${minsOf(e)} 分`}</span>
                    <span className="eta-time">{e.eta!.slice(11, 16)}</span>
                    {/* 第三欄：公司、原定、走法、位置包埋一格，太長喺格入面斷行，唔會走去分鐘下面 */}
                    <span className="eta-meta">
                      <EtaTags e={e} multiCompany={multiCompany} />
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
            </div>
          )}
        </div>
      )}
    </li>
  );
});

export default StopRow;

/** 班次標籤：聯營線標公司；九巴「原定班次」標「原定」（時間表時間，唔係實時） */
function EtaTags({ e, multiCompany }: { e: Eta; multiCompany: boolean }) {
  return (
    <>
      {multiCompany && <CompanyTag company={e.company} compact />}
      {e.scheduled && (
        <span className="scheduled" title="原定班次：時間表時間，唔係實時">
          原定
        </span>
      )}
    </>
  );
}
