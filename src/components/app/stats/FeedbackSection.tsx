/**
 * Feedback — the permanent testimonial hub
 * ========================================
 * A panel on the Stats page where an existing user can leave feedback at any
 * time, and explicitly authorise us to quote it.
 *
 * The login survey already asks new accounts why they joined. That is the
 * moment someone knows DeHub least. The quotes worth having tend to arrive
 * months later, from someone who has actually lived with the product, and
 * until now there was nowhere to put one — so they went into DMs, Telegram and
 * replies, and were never usable because nobody had said "yes, quote me".
 *
 * Two consent boxes, not one. `allow_promo` licenses the words; `allow_name`
 * licenses attaching the person to them. Being happy to be quoted anonymously
 * is a normal position and one checkbox cannot express it. Both default off,
 * and neither is required to submit: feedback we may not publish is still
 * feedback worth reading.
 *
 * The wall below the form shows only rows a human approved (see the RLS in
 * 20260914180000_user_testimonials.sql). It renders nothing at all until the
 * first one is approved, rather than an empty-state promising quotes that do
 * not exist yet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, MessageSquareQuote, Quote } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { cn } from '@/lib/utils';

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

export function FeedbackSection() {
  const { t } = useTranslation();
  const { user, walletAddress, isAuthenticated } = useAuth();

  const [body, setBody] = useState('');
  const [timeUsing, setTimeUsing] = useState('');
  const [allowPromo, setAllowPromo] = useState(false);
  const [allowName, setAllowName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [approved, setApproved] = useState<ApprovedTestimonial[]>([]);

  // The wall is public, so it loads for signed-out readers too — the whole
  // point of publishing testimonials is that people who are not members yet
  // can read them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('public_testimonials')
        .select('id, body, time_using, username, created_at')
        .order('created_at', { ascending: false })
        .limit(12);
      if (!cancelled && data) setApproved(data as ApprovedTestimonial[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const trimmed = body.trim();
  const canSubmit =
    isAuthenticated &&
    !!walletAddress &&
    trimmed.length >= MIN_LENGTH &&
    trimmed.length <= MAX_LENGTH &&
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
          body: trimmed,
          time_using: timeUsing.trim() || null,
          allow_promo: allowPromo,
          allow_name: allowPromo && allowName,
        }),
        walletAddress,
      );
      if (error) throw error;

      setSubmitted(true);
      setBody('');
      setTimeUsing('');
      toast.success(t('stats.feedback.toastSent', 'Thanks — your feedback is with us'));
    } catch (err) {
      console.error('[Feedback] Submit error:', err);
      toast.error(t('stats.feedback.toastFailed', 'Could not send that, try again'));
    } finally {
      setSubmitting(false);
    }
  }, [allowName, allowPromo, canSubmit, t, timeUsing, trimmed, user?.username, walletAddress]);

  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
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
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
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
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                  canSubmit
                    ? 'bg-white text-black hover:bg-zinc-200'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed',
                )}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('stats.feedback.sending', 'Sending…')}
                  </span>
                ) : (
                  t('stats.feedback.submit', 'Send feedback')
                )}
              </button>
              <span className="text-[11px] text-zinc-500">
                {!isAuthenticated
                  ? t('stats.feedback.signedOut', 'Sign in to leave feedback')
                  : `${trimmed.length}/${MAX_LENGTH}`}
              </span>
            </div>
          </>
        )}
      </div>

      {approved.length > 0 && (
        <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Quote className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">
              {t('stats.feedback.wallTitle', 'What people say')}
            </span>
            <span className="text-[11px] text-zinc-500 ml-auto">
              {t('stats.feedback.wallNote', 'published with permission')}
            </span>
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
        </div>
      )}
    </div>
  );
}
