import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import './live-chat-lens.css';

/**
 * The green light + number in a chat: how many people are in this chat right
 * now. Says "online" in words beside the number, explains itself on hover or
 * focus, and reads out as one sentence to screen readers.
 */
export function LiveChatOnlineCount({ count }: { count: number }) {
  const { t } = useTranslation();
  const label = t('publicChat.online', { count, defaultValue: '{{count}} online' });
  const hint = t('publicChat.onlineHint', { count, defaultValue: '{{count}} people are in this chat right now' });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-live-chat-online
          role="status"
          tabIndex={0}
          aria-label={hint}
          className="inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-md text-xs text-zinc-400 tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
          <span aria-hidden="true" className="live-chat-lens" />
          <span aria-hidden="true">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">{hint}</TooltipContent>
    </Tooltip>
  );
}
