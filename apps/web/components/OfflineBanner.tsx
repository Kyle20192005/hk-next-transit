'use client';
import { useSyncExternalStore } from 'react';
import Icon from './Icon';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** 冇網絡：頂部一條提示（到站時間停咗更新，唔好俾人以為仲係最新） */
export default function OfflineBanner() {
  const offline = useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="alert">
      <Icon name="warning" size={16} /> 冇網絡連線：到站時間暫停更新，顯示緊舊資料
    </div>
  );
}
