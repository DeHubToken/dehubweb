/**
 * Conversation coach cards
 * ========================
 * Up to three dismissible suggestion cards from the coach — the kind of slip,
 * the words that triggered it, and one sentence on how to keep the point
 * without it. Shown above a comment composer and inside the Common Ground
 * sheet's final step.
 *
 * Advice, never a gate: the "Post anyway" action is always offered when
 * there is something to post, and a coach that failed renders nothing at all.
 */
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoachFlag, CoachStatus } from '@/hooks/use-conversation-coach';

interface CoachSuggestionsProps {
  status: CoachStatus;
  flags: CoachFlag[];
  onDismiss: (index: number) => void;
  /** Hide the "all clear" line. */
  onClear?: () => void;
  /** When set, a "Post anyway" action sits under the cards. */
  onPostAnyway?: () => void;
  className?: string;
}

export function CoachSuggestions({ status, flags, onDismiss, onClear, onPostAnyway, className }: CoachSuggestionsProps) {
  const { t } = useTranslation();

  if (status === 'idle' || status === 'error') return null;

  if (status === 'loading') {
    return (
      <div data-coach-status="loading" className={cn('flex items-center gap-2 px-3 py-2 text-xs text-zinc-400', className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        <span>{t('conversation.coach.checking')}</span>
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <div
        data-coach-status="clear"
        className={cn('flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-200', className)}
      >
        <Check className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 min-w-0">{t('conversation.coach.allClear')}</span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t('conversation.coach.dismiss')}
            className="shrink-0 w-6 h-6 -mr-1 flex items-center justify-center rounded-md text-emerald-200/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-coach-status="flags" className={cn('flex flex-col gap-1.5', className)}>
      {flags.map((flag, index) => (
        <div
          key={`${flag.kind}-${index}`}
          data-coach-flag={flag.kind}
          className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5"
        >
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-200" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
              {t(`conversation.coach.kind.${flag.kind}`)}
            </p>
            {flag.quote && (
              <p className="mt-0.5 text-xs italic text-zinc-400 line-clamp-2">“{flag.quote}”</p>
            )}
            <p className="mt-1 text-xs text-zinc-200">{flag.suggestion}</p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(index)}
            aria-label={t('conversation.coach.dismiss')}
            className="shrink-0 w-6 h-6 -mr-1 -mt-0.5 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {onPostAnyway && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onPostAnyway}
            className="text-xs text-zinc-400 hover:text-white underline-offset-4 hover:underline transition-colors px-1 py-0.5"
          >
            {t('conversation.coach.postAnyway')}
          </button>
        </div>
      )}
    </div>
  );
}
