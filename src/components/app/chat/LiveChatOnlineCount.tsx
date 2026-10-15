import { useTranslation } from 'react-i18next';

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
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]"
      />
      <span aria-hidden="true">{count.toLocaleString()}</span>
    </span>
  );
}
