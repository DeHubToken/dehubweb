import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The server's limit (dehub-stream-backend src/nft/content-warning). */
export const CONTENT_WARNING_MAX = 200;

/**
 * Whether a post opens collapsed behind its content warning, and the switch
 * that opens it. Per card and per session, like the mature gate: a warning
 * tells you what is coming, it does not lock anything.
 */
export function useContentWarning(spoilerText?: string) {
  const text = spoilerText?.trim() || '';
  const [revealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  return { text, hidden: !!text && !revealed, reveal };
}

/**
 * The warning in place of a post: the creator's one line and a button to
 * open it. Covers the body and the media together, the way Mastodon does, so
 * neither gives away what the warning is about.
 */
export function ContentWarningGate({ text, onReveal, className }: { text: string; onReveal: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      data-content-warning
      className={cn('flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3', className)}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-medium text-white break-words">
        <span className="sr-only">{t('contentWarning.label')}: </span>
        {text}
      </p>
      <button
        type="button"
        data-no-navigate
        onClick={(e) => {
          // Cards navigate on click; opening the warning must not open the post.
          e.stopPropagation();
          onReveal();
        }}
        className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
      >
        {t('contentWarning.show')}
      </button>
    </div>
  );
}
