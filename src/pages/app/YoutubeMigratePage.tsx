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

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadVideos = useCallback(async () => {
    setStage('listing');
    try {
      const { videos: list } = await listChannelVideos();
      setVideos(list);
      setSelected(new Set(list.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId)));
      setStage('listing');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.toLowerCase().includes('connect your youtube channel')) {
        toast.error(message || 'Could not load your channel');
      }
      setStage('not-connected');
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('error')) toast.error(searchParams.get('error')!);
    loadVideos();
  }, [loadVideos, searchParams]);

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
    setStage('quoting');
    try {
      const q = await quoteMigration([...selected]);
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not price this migration');
      setStage('listing');
    }
  };

  const pollCharge = (chargeId: string) => {
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
  };

  const handlePay = async () => {
    if (!quote) return;
    setStage('paying');
    try {
      if (quote.amountDhb === 0) {
        // Fully covered by credit — nothing to sign, just settle.
        await settleMigration(quote.chargeId, '0x0', 0);
      } else {
        if (!quote.recipient) throw new Error('Payments are not configured right now.');
        const { payDhb } = await import('@/lib/dhb-payment');
        toast.loading(`Paying ${quote.amountDhb.toLocaleString()} DHB to migrate ${quote.videoCount} videos`, {
          id: 'migration-pay',
          duration: Infinity,
        });
        const payment = await payDhb(quote.amountDhb, quote.recipient, {
          context: 'YouTube migration',
          expectedSigner: user?.address,
          shortfallMessage: (amount, has) =>
            `This migration costs ${amount.toLocaleString()} DHB and you hold ${has.toLocaleString()}.`,
        });
        toast.dismiss('migration-pay');
        await settleMigration(quote.chargeId, payment.txHash, payment.chainId);
      }
      setStage('processing');
      pollCharge(quote.chargeId);
    } catch (err) {
      toast.dismiss('migration-pay');
      toast.error(err instanceof Error ? err.message : 'Payment failed');
      setStage('listing');
    }
  };

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
            <Link to="/yt-dlp" className="text-sm text-zinc-400 underline shrink-0">
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
              {quote.videoCount} video{quote.videoCount === 1 ? '' : 's'} ×{' '}
              {quote.unitPriceDhb.toLocaleString()} DHB
              {quote.creditAppliedDhb > 0 && (
                <> — {quote.creditAppliedDhb.toLocaleString()} DHB credit applied</>
              )}
            </p>
            <p className="text-lg font-semibold text-white">
              {quote.amountDhb === 0 ? 'Free (covered by credit)' : `${quote.amountDhb.toLocaleString()} DHB`}
            </p>
            <Button variant="glass" onClick={handlePay} disabled={stage === 'paying'}>
              {stage === 'paying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quote.amountDhb === 0 ? 'Start migration' : `Pay ${quote.amountDhb.toLocaleString()} DHB`}
            </Button>
          </section>
        )}

        {stage === 'processing' && (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3">
            <p className="text-sm text-zinc-400">Migrating — this runs in the background.</p>
            <div className="flex flex-col gap-1.5">
              {charge?.results.map(r => (
                <div key={r.youtubeVideoId} className="flex items-center gap-2 text-sm">
                  {r.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                  {r.status === 'imported' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {r.status === 'failed' && <XCircle className="h-4 w-4 text-red-400" />}
                  <span className="truncate text-white">{r.youtubeVideoId}</span>
                  {r.failedReason && (
                    <span className="text-xs text-zinc-500 truncate">{r.failedReason}</span>
                  )}
                </div>
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
