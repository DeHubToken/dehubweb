import { useTranslation } from 'react-i18next';
import './live-chat-lens.css';

export function LiveChatOnlineCount({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <span
      data-live-chat-online
      role="img"
      aria-label={t('publicChat.online', { count, defaultValue: '{{count}} online' })}
      className="inline-flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 tabular-nums"
    >
      <span
        aria-hidden="true"
        className="live-chat-lens"
      />
      <span aria-hidden="true">{count.toLocaleString()}</span>
    </span>
  );
}
