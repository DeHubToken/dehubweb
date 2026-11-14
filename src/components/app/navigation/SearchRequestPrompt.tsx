/**
 * Quick Send: shown when the menu search or the settings search finds nothing.
 *
 * A search that comes back empty is the clearest signal we get of something
 * people expect Riftn to do and it does not. Instead of ending on a grey "no
 * matches" line, the box below is already filled with what they typed
 * ("Add karaoke to Riftn") and one tap sends it to the Requests board as their
 * own request. They can edit the text first; signed out, the tap opens sign in
 * and the text waits for them.
 *
 * Same box in the phone menu, the desktop rail (compact: the rail is ~190px)
 * and the settings search. The app has the same component in
 * components/Search/SearchRequestPrompt.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Check } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitFeatureRequest } from '@/hooks/use-feature-requests';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { searchRequestFields, searchRequestDraft, type SearchRequestSource } from '@/lib/search-request';
import { cn } from '@/lib/utils';

interface SearchRequestPromptProps {
  /** What was typed into the search that found nothing. */
  query: string;
  source: SearchRequestSource;
  /** The desktop rail: narrow, so the box stacks. */
  compact?: boolean;
  /** Called when "See it on Requests" is followed, so a menu can close. */
  onNavigate?: () => void;
  className?: string;
}

export function SearchRequestPrompt({ query, source, compact = false, onNavigate, className }: SearchRequestPromptProps) {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const submit = useSubmitFeatureRequest();
  const draft = searchRequestDraft(query, source, t);
  const [text, setText] = useState(draft);
  const [sent, setSent] = useState(false);
  const editedRef = useRef(false);

  // Follow the search while the person has not touched the box; a new search
  // after a send starts over.
  useEffect(() => {
    setSent(false);
    if (!editedRef.current) setText(draft);
  }, [draft]);

  const send = () => {
    const body = text.trim();
    if (!body || submit.isPending || sent) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    submit.mutate(
      { ...searchRequestFields(body, query, source), category: 'new_feature' },
      { onSuccess: () => { setSent(true); editedRef.current = false; } },
    );
  };

  if (sent) {
    return (
      <div data-search-request data-sent className={cn('rounded-2xl border border-white/10 bg-white/5 p-3', className)} role="status">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{t('sidebar.requestSent', 'Sent to Requests')}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{t('sidebar.requestSentHint', 'We will tell you when it ships.')}</p>
        <Link to="/app/features" onClick={onNavigate} className="mt-2 inline-block text-xs font-semibold text-zinc-300 underline-offset-2 hover:underline">
          {t('sidebar.requestSeeIt', 'See it on Requests')}
        </Link>
      </div>
    );
  }

  const sendButton = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={send}
      disabled={!text.trim() || submit.isPending}
      aria-label={t('sidebar.requestSend', 'Send request')}
      data-search-request-send
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity disabled:opacity-40"
    >
      <ArrowUp className="h-4 w-4" strokeWidth={2.6} />
    </button>
  );

  return (
    <div data-search-request className={cn('rounded-2xl border border-white/10 bg-white/5 p-3', className)}>
      <div className="flex items-center gap-2 text-[13px] text-zinc-400">
        <ThemedIcon icon="features" className="h-5 w-5 shrink-0 object-contain" />
        <span>{compact ? t('sidebar.requestPromptShort', 'Not here yet?') : t('sidebar.requestPrompt', 'Not here yet? Send it as a request')}</span>
      </div>
      <div className={cn('mt-2 flex gap-2 rounded-xl border border-white/15 bg-black/20 focus-within:border-white/30', compact ? 'flex-col p-2' : 'items-center py-1 pl-3 pr-1')}>
        {/* The rail is too narrow for one line: two rows there, so the whole
            sentence stays readable. Enter still sends. */}
        {compact ? (
          <textarea
            value={text}
            maxLength={100}
            rows={2}
            onChange={(e) => { editedRef.current = true; setText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); send(); } }}
            aria-label={t('sidebar.requestPrompt', 'Not here yet? Send it as a request')}
            data-search-request-input
            className="min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-snug text-white outline-none"
          />
        ) : (
          <input
            type="text"
            value={text}
            maxLength={100}
            onChange={(e) => { editedRef.current = true; setText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); send(); } }}
            aria-label={t('sidebar.requestPrompt', 'Not here yet? Send it as a request')}
            data-search-request-input
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        )}
        {!compact && sendButton}
      </div>
      {compact ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-500">{t('sidebar.requestPostsTo', 'Posts to Requests')}</span>
          {sendButton}
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">{t('sidebar.requestHint', 'Posts to Requests as you. We will tell you when it ships.')}</p>
      )}
    </div>
  );
}
