/**
 * 統一嘅線條圖示（24×24，用 currentColor）。唔用 emoji 或者文字符號（⇅、⌫、🕒），
 * 因為唔同系統畫出嚟大細、粗幼都唔同。
 */
export type IconName =
  | 'back'
  | 'chevron-right'
  | 'chevron-down'
  | 'swap'
  | 'clock'
  | 'pin'
  | 'locate'
  | 'star'
  | 'star-fill'
  | 'search'
  | 'backspace'
  | 'close'
  | 'plus'
  | 'folder'
  | 'share'
  | 'refresh'
  | 'minus'
  | 'info'
  | 'route'
  | 'bus'
  | 'warning'
  | 'navigate'
  | 'settings'
  | 'home'
  | 'train'
  | 'minibus'
  | 'ferry'
  | 'tram';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />,
  train: (
    <>
      <rect x="5.5" y="3.5" width="13" height="13" rx="3" />
      <path d="M5.5 10.5h13M8.5 20.5l1.5-4M15.5 20.5l-1.5-4" />
      <circle cx="9" cy="13.5" r="0.9" fill="currentColor" />
      <circle cx="15" cy="13.5" r="0.9" fill="currentColor" />
    </>
  ),
  minibus: (
    <>
      <path d="M5.5 17.5H4.5a1 1 0 0 1-1-1V9a3 3 0 0 1 3-3h9.3a2 2 0 0 1 1.6.8l3.1 4.2v5.5a1 1 0 0 1-1 1h-1M9.5 17.5h5" />
      <path d="M3.5 11h17M10 6v5" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
  ferry: (
    <>
      <path d="M3.5 13.5h17l-2.3 5H5.8l-2.3-5Z" />
      <path d="M7 13.5V9.5h10v4M12 9.5V6M9 6h6" />
    </>
  ),
  tram: (
    <>
      <rect x="6" y="6.5" width="12" height="12" rx="2" />
      <path d="M6 12.5h12M12 6.5V3.5M9 3.5h6M9 21l1-2.5M15 21l-1-2.5" />
    </>
  ),
  navigate: <path d="M4.5 11.2 19.5 4.5l-6.7 15-1.9-6.4-6.4-1.9Z" />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  back: <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  swap: (
    <>
      <path d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5" />
      <path d="M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z" />,
  'star-fill': <path fill="currentColor" d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  backspace: (
    <>
      <path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7 6-7Z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  share: <path d="M12 3.5v11M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  minus: <path d="M5 12h14" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="3.5" width="14" height="14" rx="3" />
      <path d="M5 11h14M8 17.5V20M16 17.5V20" />
      <circle cx="8.5" cy="14.3" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="14.3" r="0.9" fill="currentColor" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l9 16H3l9-16Z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.3" r="0.6" fill="currentColor" />
    </>
  ),
};

/** duo：雙色（線條實色 + 同色淺填色），常用工具等大圖示用 */
export default function Icon({ name, size = 22, className, duo = false }: { name: IconName; size?: number; className?: string; duo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={duo ? 'currentColor' : 'none'}
      fillOpacity={duo ? 0.2 : undefined}
      data-duo={duo || undefined}
      stroke="currentColor"
      strokeWidth={duo ? 1.9 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
