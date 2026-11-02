import { RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/styles/send-status.css';

export type SendState = 'sending' | 'failed' | undefined;

/**
 * The little mark beside a message you just sent.
 *
 * While the send is in flight a ring spins in a fixed 12px box; when it lands
 * the ring stops and the box stays where it is, so the line never shifts. A
 * send that failed keeps its line and offers Retry in place.
 */
export function SendStatus({
  state,
  onRetry,
  onDiscard,
  className = '',
}: {
  state: SendState;
  onRetry?: () => void;
  onDiscard?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (state === 'failed') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] text-red-400 ${className}`} role="alert">
        <span>{t('messages.notSent', { defaultValue: 'Not sent' })}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-0.5 font-medium text-red-300 hover:text-white underline-offset-2 hover:underline"
          >
            <RotateCw className="w-3 h-3" />
            {t('messages.retrySend', { defaultValue: 'Retry' })}
          </button>
        )}
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            aria-label={t('messages.discardSend', { defaultValue: 'Remove' })}
            className="inline-flex items-center text-zinc-500 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }
  return (
    <span
      className={`dh-send-status ${className}`}
      data-state={state === 'sending' ? 'sending' : 'sent'}
      role={state === 'sending' ? 'status' : undefined}
      aria-label={state === 'sending' ? t('messages.sending', { defaultValue: 'Sending' }) : undefined}
    />
  );
}
