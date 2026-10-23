import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeywordFilters } from '@/hooks/use-keyword-filters';
import { filterContextForPath, matchKeywordFilter } from '@/lib/keyword-filters';
import type { FilterContext } from '@/lib/api/dehub/keyword-filters';
import { cn } from '@/lib/utils';

/**
 * Applies the viewer's keyword filters (Settings → Privacy → Muted words) to
 * whatever it wraps. A "hide" match renders nothing; a "warn" match folds the
 * content behind one line naming the filter, with a button to show it anyway.
 * Your own posts are never filtered.
 */
export function KeywordFilterGate({
  texts,
  authorId,
  own: knownOwn,
  context,
  className,
  children,
}: {
  /** Everything the filter reads: title, body, content warning, alt text. */
  texts: Array<string | null | undefined>;
  /** The author's address, so your own posts pass. */
  authorId?: string | null;
  /** Set when the caller already knows this is the viewer's own (a comment). */
  own?: boolean;
  /** Where this is shown; worked out from the page when not given. */
  context?: FilterContext;
  className?: string;
  children: ReactNode;
}) {
  const filters = useKeywordFilters();
  const { walletAddress } = useAuth();
  const { pathname } = useLocation();
  const [shown, setShown] = useState(false);
  const place = context ?? filterContextForPath(pathname);
  const own = !!knownOwn || (!!walletAddress && !!authorId && authorId.toLowerCase() === walletAddress.toLowerCase());
  const textKey = texts.join('\u0000');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const match = useMemo(() => (own ? null : matchKeywordFilter(texts, filters, place)), [own, textKey, filters, place]);

  if (!match || shown) return <>{children}</>;
  if (match.action === 'hide') return null;
  return <KeywordFilteredNotice phrase={match.phrase} onShow={() => setShown(true)} className={className} />;
}

/** The folded line a "warn" filter leaves in place of what it caught. */
export function KeywordFilteredNotice({ phrase, onShow, className }: { phrase: string; onShow: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      data-keyword-filtered
      className={cn('flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3', className)}
    >
      <Filter className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-zinc-300 break-words">{t('keywordFilters.filtered', { phrase })}</p>
      <button
        type="button"
        data-no-navigate
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
        className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
      >
        {t('keywordFilters.showAnyway')}
      </button>
    </div>
  );
}
