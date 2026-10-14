import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/** Feedback submissions and the paginated, consent-approved public wall. */

import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { KitButton, PageSection } from '@/components/app/page-kit/PageKit';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageSquareQuote } from "lucide-react";
import Check from "@/components/ui/cut-icons/check";
import Quote from "@/components/ui/cut-icons/quote";

import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

const MIN_LENGTH = 10;
const MAX_LENGTH = 1200;

interface ApprovedTestimonial {
  id: string;
  body: string;
  time_using: string | null;
  /** Null when the author did not consent to being named. The view nulls it
   * server-side, so an anonymous quote never carries an identity over the
   * wire at all. */
  username: string | null;
  created_at: string;
}

export function FeedbackSection({ source }: { source?: 'converter' | 'migration' } = {}) {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated } = useAuth();
  const contextTitle = source === 'converter' ? t('converter.title') : source === 'migration' ? t('migrate.title') : '';
  const prefix = contextTitle ? `[${contextTitle}]\n` : '';
  const bodyLimit = MAX_LENGTH - prefix.length;

  const [body, setBody] = useSurfaceDraft("components/app/stats/FeedbackSection.tsx:body", '');
  const [timeUsing, setTimeUsing] = useSurfaceDraft("components/app/stats/FeedbackSection.tsx:timeUsing", '');
  const [allowPromo, setAllowPromo] = useState(false);
  const [allowName, setAllowName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const feedback = useInfiniteQuery({
    queryKey: ['public-testimonials'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('public_testimonials')
        .select('id, body, time_using, username, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + 23);
      if (error) throw error;
      return (data ?? []) as ApprovedTestimonial[];
    },
    getNextPageParam: (lastPage, pages) => lastPage.length === 24 ? pages.length * 24 : undefined,
    staleTime: 60_000,
  });
  const approved = feedback.data?.pages.flat() ?? [];

  const trimmed = body.trim();
  const canSubmit =
    isAuthenticated &&
    !!walletAddress &&
    trimmed.length >= MIN_LENGTH &&
    trimmed.length <= bodyLimit &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !walletAddress) return;
    setSubmitting(true);
    try {
      // The wallet header is not optional here: the insert policy checks it,
      // so without it every submission fails the RLS check rather than
      // arriving unattributed.
      const { error } = await withWalletHeader(
        supabase.from('user_testimonials').insert({
          wallet_address: walletAddress.toLowerCase(),
          username: user?.username ?? null,
          body: prefix + trimmed,
          time_using: timeUsing.trim() || null,
          allow_promo: allowPromo,
          allow_name: allowPromo && allowName,
        }),
        walletAddress,
      );
      if (error) throw error;

      setSubmitted(true);
      setBody.complete(body, '');
      setTimeUsing.complete(timeUsing, '');
      toast.success(t('stats.feedback.toastSent', 'Thanks — your feedback is with us'));
    } catch (err) {
      console.error('[Feedback] Submit error:', err);
      toast.error(t('stats.feedback.toastFailed', 'Could not send that, try again'));
    } finally {
      setSubmitting(false);
    }
  }, [allowName, allowPromo, canSubmit, t, timeUsing, trimmed, user?.username, walletAddress, setBody, setTimeUsing, body, prefix]);

  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <PageSection>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquareQuote className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-white">
            {t('stats.feedback.title', 'Feedback')}
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed mb-3">
          {t(
            'stats.feedback.intro',
            'Been using DeHub for a while? Tell us what it has been like. Good, bad or specific — all of it is read. If you are happy for us to quote you, tick the box and we may use it in posts, videos or on the site.',
          )}
        </p>

        {submitted ? (
          <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <Check className="w-4 h-4 text-zinc-300 mt-0.5 shrink-0" />
            <div className="text-xs text-zinc-400 leading-relaxed">
              {t(
                'stats.feedback.thanks',
                'Got it — thank you. Anything you cleared for promotional use is reviewed by a person before it appears anywhere.',
              )}{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                {t('stats.feedback.again', 'Leave more feedback')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {contextTitle && <p className="mb-2 text-xs text-zinc-400">{contextTitle}</p>}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, bodyLimit))}
              rows={4}
              placeholder={t('stats.feedback.placeholder', 'In your own words…')}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600 resize-none"
            />

            <input
              value={timeUsing}
              onChange={(e) => setTimeUsing(e.target.value.slice(0, 80))}
              placeholder={t('stats.feedback.timeUsingPlaceholder', 'How long have you been here? (optional)')}
              className="mt-2 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600"
            />

            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowPromo}
                onChange={(e) => {
                  setAllowPromo(e.target.checked);
                  if (!e.target.checked) setAllowName(false);
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-white"
              />
              <span className="text-xs text-zinc-400 leading-relaxed">
                {t(
                  'stats.feedback.consentPromo',
                  'I authorise DeHub to quote this feedback in marketing and promotional materials.',
                )}
              </span>
            </label>

            {/* Only meaningful once the words are cleared, so it appears with
                them rather than sitting there greyed out. */}
            {allowPromo && (
              <label className="mt-2 flex items-start gap-2 cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={allowName}
                  onChange={(e) => setAllowName(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-white"
                />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  {t(
                    'stats.feedback.consentName',
                    'You can show my username alongside it. Leave this unticked to be quoted anonymously.',
                  )}
                </span>
              </label>
            )}

            <div className="mt-3 flex items-center gap-3">
              <KitButton
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('stats.feedback.sending', 'Sending…')}
                  </span>
                ) : (
                  t('stats.feedback.submit', 'Send feedback')
                )}
              </KitButton>
              <span className="text-[11px] text-zinc-500">
                {!isAuthenticated
                  ? t('stats.feedback.signedOut', 'Sign in to leave feedback')
                  : `${trimmed.length}/${bodyLimit}`}
              </span>
            </div>
          </>
        )}
      </PageSection>

        <PageSection>
          <div className="flex items-center gap-2 mb-3">
            <Quote className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">
              {t('stats.feedback.wallTitle', 'What people say')}
            </span>
            <span className="text-[11px] text-zinc-500 ml-auto">
              {t('stats.feedback.wallNote', 'published with permission')}
            </span>
          </div>
          <div role="status" className="text-xs text-zinc-400">
            {feedback.isPending ? t('common.loading') : null}
            {!feedback.isPending && !feedback.isError && approved.length === 0 ? t('search.noResults') : null}
            {feedback.isError ? t('common.failedToLoad') : null}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
            {approved.map((item) => (
              <figure key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <blockquote className="text-xs text-zinc-300 leading-relaxed">“{item.body}”</blockquote>
                <figcaption className="mt-2 text-[11px] text-zinc-500">
                  {item.username
                    ? `@${item.username}`
                    : t('stats.feedback.anonymous', 'A DeHub member')}
                  {item.time_using ? ` · ${item.time_using}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
          {(feedback.isError || feedback.hasNextPage) && (
            <KitButton variant="quiet" className="mt-3" disabled={feedback.isFetching}
              onClick={() => { void (feedback.isError ? (approved.length ? feedback.fetchNextPage() : feedback.refetch()) : feedback.fetchNextPage()); }}>
              {t(feedback.isFetching ? 'common.loading' : feedback.isError ? 'common.retry' : 'common.loadMore')}
            </KitButton>
          )}
        </PageSection>
    </div>
  );
}
