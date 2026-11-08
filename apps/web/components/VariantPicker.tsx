'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export interface VariantItem {
  id: string;
  href: string;
  label: string;
  special: boolean;
  running: boolean;
  /** 冇時間表資料：狀態用灰色，唔好似「冇班次」咁用紅色 */
  unknown?: boolean;
  status: string;
  /** 收埋時用嘅簡短狀態 */
  statusShort: string;
  /** 例如「今日 06:00–09:54 由總站開出」 */
  window: string | null;
  /** 全程大約幾多分鐘（core routeMinutes） */
  duration?: number | null;
}

/** 走法選擇：平時只顯示揀咗嘅走法，撳先展開（蓋住地圖，唔會推郁版面） */
export default function VariantPicker({ items, selectedId }: { items: VariantItem[]; selectedId: string | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, items.findIndex((x) => x.id === selectedId));
  const selected = items[selectedIndex];

  // 撳外面或者按 Esc 收埋
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!selected) return null;
  return (
    <div className="variant-picker" ref={box}>
      <button
        className="variant variant-current"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={items.length < 2}
      >
        <Row item={selected} n={selectedIndex + 1} compact />
        {items.length > 1 && (
          <Icon name="chevron-down" size={20} className={`variant-chevron${open ? ' open' : ''}`} />
        )}
      </button>
      {open && (
        <div className="variant-menu card" role="listbox" aria-label="揀走法">
          {items.map((x, i) => (
            <Link
              key={x.id}
              href={x.href}
              role="option"
              aria-selected={x.id === selected.id}
              className={`variant${x.id === selected.id ? ' active' : ''}`}
              replace
              scroll={false}
              onClick={() => setOpen(false)}
            >
              <Row item={x} n={i + 1} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** compact：收埋時用，只顯示一行（編號、名稱、狀態），太長就截斷；特別班用紅色名稱代替標籤 */
function Row({ item, n, compact = false }: { item: VariantItem; n: number; compact?: boolean }) {
  if (compact) {
    return (
      <>
        <span className={`variant-no${item.running ? ' running' : ''}`}>{n}</span>
        <span className="variant-line">
          <strong className={item.special ? 'special' : undefined}>{item.label}</strong>
          <span className={`variant-status ${item.running ? 'running' : item.unknown ? 'unknown' : 'idle'}`}>{item.statusShort}</span>
          {item.duration ? <span className="variant-duration">全程約 {item.duration} 分</span> : null}
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`variant-no${item.running ? ' running' : ''}`}>{n}</span>
      <span className="variant-body">
        <span className="variant-title">
          {item.special && <span className="badge special">特別班</span>}
          <strong>{item.label}</strong>
        </span>
        <span className={`variant-status ${item.running ? 'running' : item.unknown ? 'unknown' : 'idle'}`}>{item.status}</span>
        {(item.window || item.duration) && (
          <span className="muted">
            {[item.window, item.duration ? `全程約 ${item.duration} 分鐘` : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </>
  );
}
