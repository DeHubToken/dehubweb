/**
 * /app/migrate-youtube — "Migrate all"
 * =====================================
 * Bulk-import a creator's whole YouTube channel as DeHub posts, one paid
 * batch at a time. Connects via OAuth (real ownership proof, unlike the
 * single-video importer's checkbox), quotes the batch in DHB, takes one
 * upfront on-chain payment, then runs the import in the background.
 *
 * Styled like the rest of the app shell (SuperPowersPage, Settings): a
 * max-w-3xl column, `rounded-2xl bg-white/5` cards, not a bare form — this
 * page lives inside AppLayout same as wallet/profile/etc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Youtube, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import {
  getYoutubeConnectUrl,
  listChannelVideos,
  quoteMigration,
  settleMigration,
  getMigrationChargeStatus,
  getActiveMigrationCharge,
  type ChannelVideo,
  type MigrationQuote,
  type MigrationChargeStatus,
} from '@/lib/api/dehub/youtube-migration';

type Stage = 'loading' | 'not-connected' | 'listing' | 'quoting' | 'paying' | 'processing' | 'done';

/** Two attempts at a theme-token color (`border-primary`, then
 * `border-foreground`) both went invisible on some DeHub theme — this app
 * remaps named colors per theme, so any semantic token can end up close to
 * its own background. Bracket syntax below is a literal, unthemed color:
 * black border, white fill, on every theme, full stop. */
const CHECKBOX_CLASS =
  'h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

export default function YoutubeMigratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState<Stage>('loading');
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<MigrationQuote | null>(null);
  const [charge, setCharge] = useState<MigrationChargeStatus | null>(null);
  // Where a failed payment attempt drops the creator back to — the fresh
  // "pick videos" flow returns to the picker, but retrying already-failed
  // videos from a finished batch should return to that batch's grid instead.
  const [payFallback, setPayFallback] = useState<Stage>('listing');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const titleById = useMemo(
    () => new Map(videos.map(v => [v.youtubeVideoId, v.title])),
    [videos],
  );

  /** Fetches the channel list into state without touching `stage` — used
   * both by the normal picker flow and, silently in the background, when
   * resuming an in-progress or finished batch (so titles resolve in the
   * results grid instead of showing bare video IDs). */
  const fetchVideos = useCallback(async () => {
    const { videos: list } = await listChannelVideos();
    setVideos(list);
    setSelected(new Set(list.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId)));
  }, []);

  const loadVideos = useCallback(async () => {
    setStage('listing');
    try {
      await fetchVideos();
      setStage('listing');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.toLowerCase().includes('connect your youtube channel')) {
        toast.error(message || 'Could not load your channel');
      }
      setStage('not-connected');
    }
  }, [fetchVideos]);

  const pollCharge = useCallback((chargeId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getMigrationChargeStatus(chargeId);
        setCharge(status);
        if (status.results.every(r => r.status !== 'pending')) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStage('done');
          const imported = status.results.filter(r => r.status === 'imported').length;
          const failed = status.results.filter(r => r.status === 'failed').length;
          toast.success(
            failed
              ? `Migrated ${imported} video${imported === 1 ? '' : 's'} — ${failed} couldn't import and were credited toward your next migration.`
              : `Migrated ${imported} video${imported === 1 ? '' : 's'}!`,
          );
        }
      } catch {
        // transient — keep polling
      }
    }, 5000);
  }, []);

  useEffect(() => {
    if (searchParams.get('error')) toast.error(searchParams.get('error')!);
    (async () => {
      try {
        const active = await getActiveMigrationCharge();
        if (active) {
          setCharge(active);
          const stillPending = active.results.some(r => r.status === 'pending');
          setStage(stillPending ? 'processing' : 'done');
          if (stillPending) pollCharge(active._id);
          // Best-effort, in the background — resolves titles in the grid
          // but a resumed view shouldn't wait on it or fail because of it.
          fetchVideos().catch(() => undefined);
          return;
        }
      } catch {
        // no session / connection yet — fall through to the normal flow
      }
      loadVideos();
    })();
  }, [loadVideos, fetchVideos, pollCharge, searchParams]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await getYoutubeConnectUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the connection');
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGetQuote = async () => {
    if (!selected.size) {
      toast.error('Select at least one video');
      return;
    }
    setPayFallback('listing');
    setStage('quoting');
    try {
      const q = await quoteMigration([...selected]);
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not price this migration');
      setStage('listing');
    }
  };

  const handleRetryFailed = async () => {
    const failedIds = charge?.results.filter(r => r.status === 'failed').map(r => r.youtubeVideoId) ?? [];
    if (!failedIds.length) return;
    setPayFallback('done');
    setStage('quoting');
    try {
      const q = await quoteMigration(failedIds);
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not retry the failed videos');
      setStage('done');
    }
  };

  const handlePay = async (q: MigrationQuote | null) => {
    if (!q) return;
    setStage('paying');
    try {
      if (q.amountDhb === 0) {
        // Fully covered by credit — nothing to sign, just settle.
        await settleMigration(q.chargeId, '0x0', 0);
      } else {
        if (!q.recipient) throw new Error('Payments are not configured right now.');
        const { payDhb } = await import('@/lib/dhb-payment');
        toast.loading(`Paying ${q.amountDhb.toLocaleString()} DHB to migrate ${q.videoCount} video${q.videoCount === 1 ? '' : 's'}`, {
          id: 'migration-pay',
          duration: Infinity,
        });
        const payment = await payDhb(q.amountDhb, q.recipient, {
          context: 'YouTube migration',
          expectedSigner: user?.address,
          shortfallMessage: (amount, has) =>
            `This migration costs ${amount.toLocaleString()} DHB and you hold ${has.toLocaleString()}.`,
        });
        toast.dismiss('migration-pay');
        await settleMigration(q.chargeId, payment.txHash, payment.chainId);
      }
      setCharge(null);
      setStage('processing');
      pollCharge(q.chargeId);
    } catch (err) {
      toast.dismiss('migration-pay');
      toast.error(err instanceof Error ? err.message : 'Payment failed');
      setStage(payFallback);
    }
  };

  const imported = charge?.results.filter(r => r.status === 'imported').length ?? 0;
  const failed = charge?.results.filter(r => r.status === 'failed').length ?? 0;

  return (
    <>
      <SEOHead
        title="Migrate all from YouTube — DeHub"
        description="Bulk-import your YouTube channel to DeHub."
        url="https://dehub.io/app/migrate-youtube"
      />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Youtube className="w-5 h-5" />
              Migrate all from YouTube
            </h1>
            <Link to="/converter" className="text-sm text-zinc-400 underline shrink-0">
              Just one video?
            </Link>
          </div>
          <p className="text-sm text-zinc-400 max-w-prose">
            Connect your channel, pick what to bring over, and pay once to migrate the whole batch.
          </p>
        </header>

        {stage === 'loading' && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        )}

        {stage === 'not-connected' && (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3 items-start">
            <p className="text-sm text-zinc-400">
              Connect your YouTube channel to see what's ready to migrate.
            </p>
            <Button variant="glass" onClick={handleConnect}>
              Connect your YouTube channel
            </Button>
          </section>
        )}

        {(stage === 'listing' || stage === 'quoting') && videos.length > 0 && !quote && (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto -mx-2 px-2">
              {videos.map(v => (
                <div
                  key={v.youtubeVideoId}
                  role="checkbox"
                  aria-checked={v.alreadyImported || selected.has(v.youtubeVideoId)}
                  tabIndex={v.alreadyImported ? -1 : 0}
                  onClick={() => !v.alreadyImported && toggle(v.youtubeVideoId)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !v.alreadyImported) {
                      e.preventDefault();
                      toggle(v.youtubeVideoId);
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl p-2.5 text-sm hover:bg-white/5 select-none ${v.alreadyImported ? 'opacity-40' : 'cursor-pointer'}`}
                >
                  <Checkbox
                    checked={v.alreadyImported || selected.has(v.youtubeVideoId)}
                    disabled={v.alreadyImported}
                    className={cn(CHECKBOX_CLASS, 'pointer-events-none')}
                  />
                  <span className="truncate text-white">{v.title}</span>
                  {v.alreadyImported && (
                    <span className="ml-auto shrink-0 text-[11px] text-zinc-500">Imported</span>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="glass"
              onClick={handleGetQuote}
              disabled={stage === 'quoting' || !selected.size}
              className="self-start"
            >
              {stage === 'quoting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Get price for {selected.size} video{selected.size === 1 ? '' : 's'}
            </Button>
          </section>
        )}

        {stage === 'listing' && videos.length === 0 && (
          <section className="rounded-2xl bg-white/5 p-5">
            <p className="text-sm text-zinc-400">No uploads found on your channel.</p>
          </section>
        )}

        {quote && (stage === 'quoting' || stage === 'paying') && (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3 items-start">
            <p className="text-sm text-zinc-400">
              {quote.videoCount} video{quote.videoCount === 1 ? '' : 's'}
              {quote.creditAppliedDhb > 0 && (
                <> — {quote.creditAppliedDhb.toLocaleString()} DHB credit applied</>
              )}
            </p>
            <p className="text-lg font-semibold text-white">
              {quote.amountDhb === 0 ? 'Free (covered by credit)' : `${quote.amountDhb.toLocaleString()} DHB`}
            </p>
            <Button variant="glass" onClick={() => handlePay(quote)} disabled={stage === 'paying'}>
              {stage === 'paying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quote.amountDhb === 0 ? 'Start migration' : `Pay ${quote.amountDhb.toLocaleString()} DHB`}
            </Button>
          </section>
        )}

        {(stage === 'processing' || stage === 'done') && charge && (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                {stage === 'processing'
                  ? "Migrating — this runs in the background, safe to close this tab. We'll notify you when it's done."
                  : `${imported} imported${failed ? `, ${failed} couldn't import` : ''}.`}
              </p>
              {stage === 'done' && failed > 0 && (
                <Button variant="outline" size="sm" onClick={handleRetryFailed} className="shrink-0">
                  Retry {failed} failed
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[32rem] overflow-y-auto -mx-1 px-1">
              {charge.results.map(r => (
                <a
                  key={r.youtubeVideoId}
                  href={`https://www.youtube.com/watch?v=${r.youtubeVideoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 p-2.5 text-xs transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {r.status === 'pending' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />}
                    {r.status === 'imported' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                    {r.status === 'failed' && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                    <span className="truncate text-white">{titleById.get(r.youtubeVideoId) || r.youtubeVideoId}</span>
                  </div>
                  {r.failedReason && (
                    <span className="text-zinc-500 line-clamp-2">{r.failedReason}</span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {stage === 'done' && (
          <Button variant="outline" className="self-start" onClick={() => navigate('/')}>
            View your feed
          </Button>
        )}
      </div>
    </>
  );
}
