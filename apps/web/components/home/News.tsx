'use client';
import { useState } from 'react';
import { filterNews, type NewsFilter, type NewsItem } from '@hknt/core';
import Icon from '@/components/Icon';
import { useNews } from '@/lib/news';

/** 消息分類掣：全部／附近（有位置先有）／港鐵 */
export function NewsChips({ value, onChange, hasPos }: { value: NewsFilter; onChange: (f: NewsFilter) => void; hasPos: boolean }) {
  const opts: { id: NewsFilter; label: string }[] = [{ id: 'all', label: '全部' }, ...(hasPos ? [{ id: 'nearby' as const, label: '附近' }] : []), { id: 'mtr', label: '港鐵' }];
  return (
    <div className="news-chips" role="tablist">
      {opts.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className="news-chip" onClick={() => onChange(o.id)}>
          {o.id === 'nearby' && <Icon name="navigate" size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 消息列表：撳一條展開全文 */
export function NewsList({ items, empty }: { items: NewsItem[]; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <p className="feed-hint card">{empty}</p>;
  return (
    <ul className="news-list">
      {items.map((n) => (
        <li key={n.id} className={`news-item card${n.closed ? ' closed' : ''}`}>
          <button onClick={() => setOpen((o) => (o === n.id ? null : n.id))} aria-expanded={open === n.id}>
            <span className="news-tags">
              {n.closed ? <span className="news-tag done">已完結</span> : <span className="news-tag live">進行中</span>}
              {n.nearby && <span className="news-tag near">附近</span>}
              {n.mtr && <span className="news-tag mtr">港鐵</span>}
              {n.bus && <span className="news-tag bus">巴士</span>}
            </span>
            <span className="news-title">{n.title}</span>
          </button>
          {open === n.id && <p className="news-text">{n.text}</p>}
        </li>
      ))}
    </ul>
  );
}

/** 交通消息頁（由首頁入，有返回掣） */
export default function News({ pos, onBack }: { pos: { lat: number; lng: number } | null; onBack: () => void }) {
  const items = useNews(pos);
  const [filter, setFilter] = useState<NewsFilter>(pos ? 'nearby' : 'all');
  return (
    <>
      <header className="app-bar">
        <button className="bar-btn" onClick={onBack} aria-label="返回">
          <Icon name="back" />
        </button>
        <div className="app-title">
          <h1>交通消息</h1>
          <span className="app-sub">運輸署</span>
        </div>
      </header>
      <div className="home-feed">
        <NewsChips value={filter} onChange={setFilter} hasPos={!!pos} />
        {items === null ? <p className="feed-hint card">載入中…</p> : <NewsList items={filterNews(items, filter)} empty={filter === 'nearby' ? '附近冇特別交通消息' : '暫時冇特別交通消息'} />}
        <p className="muted news-source">資料來源：運輸署特別交通消息。「附近」按你附近 1.5 公里內嘅站名判斷，僅供參考。</p>
      </div>
    </>
  );
}
