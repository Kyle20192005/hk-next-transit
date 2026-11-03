'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface VariantItem {
  id: string;
  href: string;
  label: string;
  special: boolean;
  running: boolean;
  status: string;
  /** 例如「今日 06:00–09:54 由總站開出」 */
  window: string | null;
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
        <Row item={selected} n={selectedIndex + 1} />
        {items.length > 1 && (
          <span className="variant-chevron" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
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

function Row({ item, n }: { item: VariantItem; n: number }) {
  return (
    <>
      <span className={`variant-no${item.running ? ' running' : ''}`}>{n}</span>
      <span className="variant-body">
        <span className="variant-title">
          {item.special && <span className="badge special">特別班</span>}
          <strong>{item.label}</strong>
        </span>
        <span className={`variant-status ${item.running ? 'running' : 'idle'}`}>{item.status}</span>
        {item.window && <span className="muted">{item.window}</span>}
      </span>
    </>
  );
}
