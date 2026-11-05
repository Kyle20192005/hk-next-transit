'use client';
import Icon from './Icon';
import { useFavorite, type Favorite } from '@/lib/favorites';

/** 收藏星號。variant = bar：標題列圖示掣；inline：打開咗嘅站入面「收藏呢個站」 */
export default function FavButton({ target, variant = 'bar' }: { target: Omit<Favorite, 'at'>; variant?: 'bar' | 'inline' }) {
  const [on, toggle] = useFavorite(target);
  const label = target.stopId ? (on ? '已收藏呢個站' : '收藏呢個站') : on ? '取消收藏路線' : '收藏路線';
  if (variant === 'inline') {
    return (
      <button className={`fav-inline${on ? ' on' : ''}`} onClick={toggle} aria-pressed={on}>
        <Icon name={on ? 'star-fill' : 'star'} size={18} />
        {label}
      </button>
    );
  }
  return (
    <button className={`bar-btn${on ? ' on' : ''}`} onClick={toggle} aria-pressed={on} aria-label={label} title={label}>
      <Icon name={on ? 'star-fill' : 'star'} />
    </button>
  );
}
