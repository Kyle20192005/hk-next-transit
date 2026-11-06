import Icon, { type IconName } from '@/components/Icon';

/** 未做嘅功能：「功能即將推出」 */
export default function ComingSoon({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <div className="empty-state coming-soon">
      <span className="empty-icon">
        <Icon name={icon} size={32} />
      </span>
      <strong className="coming-title">{title}</strong>
      <span className="soon-badge">功能即將推出</span>
      {text && <p>{text}</p>}
    </div>
  );
}
