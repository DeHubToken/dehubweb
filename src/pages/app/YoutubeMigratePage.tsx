/**
 * /app/migrate-youtube — "Migrate all"
 * =====================================
 * Bulk-import a creator's whole YouTube channel as DeHub posts, one paid
 * batch at a time. Paste the channel address, tick the ownership box, pick
 * what to bring over, pay once in DHB, and the import runs in the background.
 *
 * This went through a Google OAuth connection until 2026-08-30, where signing
 * in served as both "which channel" and "it's yours". That is gone: the URL
 * says which channel, and the checkbox — the same attestation /converter has
 * always taken for a single video — says whose. Losing OAuth also lost the
 * only thing that remembered a creator's channel between visits, hence
 * CHANNEL_URL_KEY below.
 *
 * Styled as an app feed surface rather than a form. The title used to be bare
 * text at the very top of <main>, which reads as clipped against the viewport
 * edge and slid away on scroll with nothing behind it; it now lives in the
 * sticky `[data-page-bento]` header the rest of the app uses (Explore,
 * Leaderboard, Music), with the content swallowed at its top edge. Below it,
 * `bg-zinc-900` bentos, and video tiles in the feed's own post-card shape —
 * aspect-video media, black pill badges, a p-3 body — because these ARE posts,
 * just ones that have not landed yet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Youtube, CheckCircle2, XCircle, ExternalLink, Eye, Clipboard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import dehubCoin from '@/assets/dehub-coin.png';
import {
  listChannelVideos,
  quoteMigration,
  settleMigration,
  getMigrationChargeStatus,
  getActiveMigrationCharge,
  getMigrationPricing,
  type ChannelVideo,
  type MigrationQuote,
  type MigrationChargeStatus,
  type MigrationPricing,
} from '@/lib/api/dehub/youtube-migration';

type Stage = 'loading' | 'idle' | 'fetching' | 'listing' | 'quoting' | 'paying' | 'processing' | 'done';

/** Two attempts at a theme-token color (`border-primary`, then
 * `border-foreground`) both went invisible on some DeHub theme — this app
 * remaps named colors per theme, so any semantic token can end up close to
 * its own background. Bracket syntax below is a literal, unthemed color:
 * black border, white fill, on every theme, full stop. */
const CHECKBOX_CLASS =
  'h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

/** The last channel that listed successfully. Purely so a batch resumed after
 * a reload can re-fetch titles for its results grid — the OAuth connection
 * used to be what remembered which channel a creator was migrating, and
 * nothing server-side does now. Per-browser and disposable: losing it costs
 * video IDs instead of titles on a resumed view, nothing more. */
const CHANNEL_URL_KEY = 'dehub:migrate-youtube:channel-url';

/** The example grid shown before a batch exists. Deliberately covers all
 * three states and a real-sounding failure reason — the point is to show
 * that failures are surfaced per video and can be retried, not to fill
 * space. Titles are generic so it never looks like someone else's channel. */
const SAMPLE_RESULTS: { title: string; status: 'imported' | 'failed' | 'pending'; reason?: string }[] = [
  { title: 'Channel trailer', status: 'imported' },
  { title: 'Behind the scenes', status: 'imported' },
  { title: 'Q&A — episode 4', status: 'imported' },
  { title: 'Studio tour', status: 'pending' },
  { title: 'Live replay', status: 'failed', reason: 'That video is age-restricted, so it cannot be imported.' },
  { title: 'Old vlog', status: 'imported' },
];

/** Per-video state, worn the way a feed card wears its duration: a black pill
 * on the thumbnail rather than a line of body text. `data-keep-dark` holds it
 * black on the themes that repaint dark surfaces — it sits over an image, so
 * it has to stay legible whatever the theme does to the card beneath it. */
function StatusBadge({ status }: { status: 'imported' | 'failed' | 'pending' }) {
  return (
    <span
      data-keep-dark
      className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white"
    >
      {status === 'pending' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-300" />}
      {status === 'imported' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
      {status === 'failed' && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
      {status === 'pending' ? 'Importing' : status === 'imported' ? 'Imported' : 'Failed'}
    </span>
  );
}

/** A DHB amount, written the way the rest of the app writes one: the coin
 * ahead of the number, no ticker text. Local rather than shared because the
 * codebase inlines this `<img>` at each site today — this only exists to
 * avoid repeating it four times on one page. `alt` carries the ticker, so
 * the amount still reads as DHB to a screen reader. */
function DhbAmount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', className)}>
      <img src={dehubCoin} alt="DHB" className="w-4 h-4 shrink-0" />
      {value.toLocaleString()}
    </span>
  );
}

/** `3661` → `1:01:01`, `125` → `2:05` — YouTube's own player format, so a
 * duration badge on a thumbnail reads the same here as it does there. */
function formatDuration(totalSeconds?: number): string | null {
  if (!totalSeconds) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const viewsFormatter = new Intl.NumberFormat('en', { notation: 'compact' });

function formatViews(count?: number): string | null {
  if (count === undefined) return null;
  return `${viewsFormatter.format(count)} view${count === 1 ? '' : 's'}`;
}

const publishedDateFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' });

function formatPublishedAt(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : publishedDateFormatter.format(date);
}

export default function YoutubeMigratePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [channelUrl, setChannelUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quote, setQuote] = useState<MigrationQuote | null>(null);
  const [charge, setCharge] = useState<MigrationChargeStatus | null>(null);
  const [pricing, setPricing] = useState<MigrationPricing | null>(null);
  // Where a failed payment attempt drops the creator back to — the fresh
  // "pick videos" flow returns to the picker, but retrying already-failed
  // videos from a finished batch should return to that batch's grid instead.
  const [payFallback, setPayFallback] = useState<Stage>('listing');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const titleById = useMemo(
    () => new Map(videos.map(v => [v.youtubeVideoId, v.title])),
    [videos],
  );

  const thumbById = useMemo(
    () => new Map(videos.filter(v => v.thumbnailUrl).map(v => [v.youtubeVideoId, v.thumbnailUrl!])),
    [videos],
  );

  /** Fetches the channel list into state without touching `stage` — used
   * both by the normal picker flow and, silently in the background, when
   * resuming an in-progress or finished batch (so titles resolve in the
   * results grid instead of showing bare video IDs). */
  const fetchVideos = useCallback(async (url: string) => {
    const { videos: list } = await listChannelVideos(url, true);
    setVideos(list);
    setSelected(new Set(list.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId)));
  }, []);

  const handleListChannel = useCallback(async () => {
    if (!channelUrl.trim()) {
      toast.error('Paste your channel address first');
      return;
    }
    if (!ownershipConfirmed) {
      toast.error('Please confirm this is your channel');
      return;
    }
    setStage('fetching');
    try {
      await fetchVideos(channelUrl.trim());
      // Only remembered once it has actually resolved, so a bad paste is not
      // what a resumed batch tries to re-list from later.
      try {
        localStorage.setItem(CHANNEL_URL_KEY, channelUrl.trim());
      } catch {
        // private mode / blocked storage — resume just shows ids, not a failure
      }
      setStage('listing');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that channel');
      setStage('idle');
    }
  }, [channelUrl, ownershipConfirmed, fetchVideos]);

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
    (async () => {
      let remembered = '';
      try {
        remembered = localStorage.getItem(CHANNEL_URL_KEY) || '';
      } catch {
        // blocked storage — the field just starts empty
      }
      if (remembered) setChannelUrl(remembered);

      try {
        const active = await getActiveMigrationCharge();
        if (active) {
          setCharge(active);
          const stillPending = active.results.some(r => r.status === 'pending');
          setStage(stillPending ? 'processing' : 'done');
          if (stillPending) pollCharge(active._id);
          // Best-effort, in the background — resolves titles in the grid
          // but a resumed view shouldn't wait on it or fail because of it.
          // Needs the remembered address: without an OAuth connection there
          // is nothing else that says which channel the batch came from.
          if (remembered) fetchVideos(remembered).catch(() => undefined);
          return;
        }
      } catch {
        // no session yet — fall through to the paste form
      }
      setStage('idle');
    })();
  }, [fetchVideos, pollCharge]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Public pricing, and the explainer degrades to prose without it — so this
  // never blocks the page or raises a toast on failure.
  useEffect(() => {
    getMigrationPricing()
      .then(setPricing)
      .catch(() => undefined);
  }, []);

  const handlePasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setChannelUrl(text.trim());
    } catch {
      toast.error('Could not read the clipboard — paste manually instead');
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

  /** Everything not already imported, which is what "select all" means here —
   * imported videos are permanently checked and can't be unpicked. */
  const selectableIds = useMemo(
    () => videos.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId),
    [videos],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

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

  // Swallow the page content at the sticky header bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <>
      <SEOHead
        title="Migrate all from YouTube — DeHub"
        description="Bulk-import your YouTube channel to DeHub."
        url="https://dehub.io/app/migrate-youtube"
      />

      {/* Sticky nav pill — the page's own header bento, pinned below the
          mobile top bar and flush under the desktop chrome. The wrapper stays
          transparent on purpose (see the swallow clip): the bento is the only
          surface. */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          {/* Stacks under 640px. Side by side, the button ate half a phone's
              width and left the title to truncate to "Migrate all f…" with the
              subtitle in a four-line ribbon beside the icon. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">Migrate all from YouTube</h1>
                <p className="text-sm text-zinc-500">
                  Connect your channel, pick what to bring over, pay once.
                </p>
              </div>
            </div>
            <Button variant="glass" size="sm" asChild className="shrink-0 self-start sm:self-auto">
              <Link to="/converter">Just one video?</Link>
            </Button>
          </div>
        </div>
      </div>

      <div ref={contentRef} className="px-2 sm:px-3 pt-2 pb-3 flex flex-col gap-2 sm:gap-3">

        {stage === 'loading' && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        )}

        {(stage === 'idle' || stage === 'fetching') && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-white">Your channel</h2>
              <p className="text-sm text-zinc-400">
                Paste your channel address — the handle on its own works too.
              </p>
            </div>

            {/* Same input treatment as the single-video importer on
                /converter, because it is the same action at a different
                scale — a creator moving between the two pages should not
                meet two different-looking forms. */}
            <div className="relative">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="youtube.com/@yourchannel"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleListChannel();
                  }
                }}
                disabled={stage === 'fetching'}
                className="pl-10 pr-20 h-[36px] bg-zinc-800 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                type="button"
                onClick={handlePasteUrl}
                disabled={stage === 'fetching'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
              >
                <Clipboard className="w-3.5 h-3.5" />
                Paste
              </button>
            </div>

            {/* The ownership attestation. A pasted URL says which channel, not
                whose — this is the only thing standing between "migrate my
                own catalogue" and "bulk-rip a stranger's". The whole line
                toggles it: Radix renders a <button>, which a <label> does not
                forward clicks to the way a native input would. */}
            <div
              role="checkbox"
              aria-checked={ownershipConfirmed}
              tabIndex={stage === 'fetching' ? -1 : 0}
              onClick={() => stage !== 'fetching' && setOwnershipConfirmed(v => !v)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && stage !== 'fetching') {
                  e.preventDefault();
                  setOwnershipConfirmed(v => !v);
                }
              }}
              className="flex items-start gap-2 text-sm text-zinc-400 cursor-pointer select-none"
            >
              <Checkbox
                checked={ownershipConfirmed}
                disabled={stage === 'fetching'}
                className={cn(CHECKBOX_CLASS, 'mt-0.5 pointer-events-none')}
              />
              <span>
                This is my channel, or I have the rights holder's permission to publish its videos on DeHub.
              </span>
            </div>

            <Button
              variant="glass"
              onClick={handleListChannel}
              disabled={stage === 'fetching' || !channelUrl.trim() || !ownershipConfirmed}
              className="self-start"
            >
              {stage === 'fetching' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {stage === 'fetching' ? 'Reading your channel…' : 'Show my videos'}
            </Button>
          </section>
        )}

        {(stage === 'listing' || stage === 'quoting') && videos.length > 0 && !quote && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-white">Pick what to bring over</h2>
                <p className="text-sm text-zinc-400">
                  {selected.size} of {videos.filter(v => !v.alreadyImported).length} selected. Anything already on
                  your profile is skipped and never charged twice.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={toggleAll} className="shrink-0">
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
            </div>
            {/* No inner scroller: the page is the scroller, so the grid keeps
                growing and gets swallowed under the header pill like a feed
                instead of trapping a second scrollbar inside a card. */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map(v => {
                const checked = v.alreadyImported || selected.has(v.youtubeVideoId);
                const duration = formatDuration(v.durationSeconds);
                const views = formatViews(v.viewCount);
                const published = formatPublishedAt(v.publishedAt);
                return (
                  <div
                    key={v.youtubeVideoId}
                    role="checkbox"
                    aria-checked={checked}
                    tabIndex={v.alreadyImported ? -1 : 0}
                    onClick={() => !v.alreadyImported && toggle(v.youtubeVideoId)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !v.alreadyImported) {
                        e.preventDefault();
                        toggle(v.youtubeVideoId);
                      }
                    }}
                    data-page-bento
                    className={cn(
                      'group flex flex-col bg-zinc-900 rounded-2xl overflow-hidden select-none transition-all',
                      v.alreadyImported ? 'opacity-40' : 'cursor-pointer hover:ring-2 hover:ring-white/30',
                      checked && !v.alreadyImported && 'ring-2 ring-white/60',
                    )}
                  >
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {v.thumbnailUrl ? (
                        <img
                          src={v.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <Youtube className="absolute inset-0 m-auto h-8 w-8 text-zinc-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />

                      <Checkbox
                        checked={checked}
                        disabled={v.alreadyImported}
                        className={cn(CHECKBOX_CLASS, 'pointer-events-none absolute top-2 left-2 shadow-lg')}
                      />

                      {duration && (
                        <span data-keep-dark className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white tabular-nums">
                          {duration}
                        </span>
                      )}

                      {v.alreadyImported && (
                        <span data-keep-dark className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                          Imported
                        </span>
                      )}

                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        aria-label="Watch on YouTube"
                        data-keep-dark
                        className="absolute bottom-2 left-2 rounded bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <div className="flex flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium text-white leading-snug" title={v.title}>
                        {v.title}
                      </span>
                      {(views || published) && (
                        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                          {views && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {views}
                            </span>
                          )}
                          {views && published && <span>&middot;</span>}
                          {published && <span>{published}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
            <p className="text-sm text-zinc-400">No uploads found on your channel.</p>
          </section>
        )}

        {quote && (stage === 'quoting' || stage === 'paying') && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3 items-start">
            <p className="text-sm text-zinc-400">
              {quote.videoCount} video{quote.videoCount === 1 ? '' : 's'}
              {quote.creditAppliedDhb > 0 && (
                <> — <DhbAmount value={quote.creditAppliedDhb} /> credit applied</>
              )}
            </p>
            <p className="text-lg font-semibold text-white">
              {quote.amountDhb === 0 ? (
                'Free (covered by credit)'
              ) : (
                <DhbAmount value={quote.amountDhb} className="gap-1.5" />
              )}
            </p>
            <Button variant="glass" onClick={() => handlePay(quote)} disabled={stage === 'paying'}>
              {stage === 'paying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quote.amountDhb === 0 ? (
                'Start migration'
              ) : (
                <>Pay&nbsp;<DhbAmount value={quote.amountDhb} /></>
              )}
            </Button>
          </section>
        )}

        {/* Rendered at every stage, including before a channel is connected.
            It is the part of this page a creator comes back to, and showing
            its shape up front is what explains the feature — the sample grid
            below says "each video gets a tile and you can retry the failures"
            far faster than a paragraph would. */}
        {stage !== 'loading' && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-white">Migration progress</h2>
                <p className="text-sm text-zinc-400">
                  {stage === 'processing'
                    ? "Migrating — this runs in the background, safe to close this tab. We'll notify you when it's done."
                    : charge
                      ? `${imported} imported${failed ? `, ${failed} couldn't import` : ''}.`
                      : 'Every video in a batch gets its own tile here, so you can see what landed and retry what did not. Nothing running yet — the grid below is an example.'}
                </p>
              </div>
              {stage === 'done' && failed > 0 && (
                <Button variant="outline" size="sm" onClick={handleRetryFailed} className="shrink-0">
                  Retry {failed} failed
                </Button>
              )}
            </div>

            {charge ? (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {charge.results.map(r => (
                  <a
                    key={r.youtubeVideoId}
                    href={`https://www.youtube.com/watch?v=${r.youtubeVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    data-page-bento
                    className="group flex flex-col bg-zinc-900 rounded-2xl overflow-hidden transition-all hover:ring-2 hover:ring-white/30"
                  >
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {/* The channel list carries a thumbnail, but a resumed
                          batch renders before that background fetch lands —
                          so fall back to YouTube's own thumbnail URL for the
                          id, which needs no API call and always exists. */}
                      <img
                        src={thumbById.get(r.youtubeVideoId) || `https://i.ytimg.com/vi/${r.youtubeVideoId}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium text-white leading-snug">
                        {titleById.get(r.youtubeVideoId) || r.youtubeVideoId}
                      </span>
                      {r.failedReason && (
                        <span className="text-xs text-zinc-400 line-clamp-2">{r.failedReason}</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              /* A worked example rather than blank boxes: showing all three
                 states, failure reason included, is what makes "and you can
                 retry the ones that failed" land before anyone has paid.
                 Same tile as a real result so the shape is the message, but
                 dimmed with an empty media well instead of a fake thumbnail —
                 a stock picture here would read as somebody's actual video.
                 aria-hidden because the sentence above already says what this
                 is; six fake tiles would just be noise to read out. */
              /* Two-up on phones where the real grids go single-column: six
                 post-sized placeholders is four screens of dimmed example
                 before the explainers. Half-size still shows the shape. */
              <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 opacity-50" aria-hidden="true">
                {SAMPLE_RESULTS.map(sample => (
                  <div
                    key={sample.title}
                    data-page-bento
                    className="flex flex-col bg-zinc-900 rounded-2xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
                      <Youtube className="h-7 w-7 text-zinc-700" />
                      <StatusBadge status={sample.status} />
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium text-white leading-snug">{sample.title}</span>
                      {sample.reason && <span className="text-xs text-zinc-400 line-clamp-2">{sample.reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {stage === 'done' && (
          <Button variant="outline" className="self-start" onClick={() => navigate('/')}>
            View your feed
          </Button>
        )}

        {/* ── Explainers ──────────────────────────────────────────────────
            Below the working part of the page on purpose: this answers
            "what will this cost me and what happens next", which is a
            question people ask before paying and never again after. */}
        <section className="grid gap-2 sm:gap-3 sm:grid-cols-2">
          <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">How it works</h2>
            <ol className="flex flex-col gap-2.5 text-sm text-zinc-400">
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">1.</span>
                <span>Connect your channel. The Google sign-in is what proves the videos are yours — we only ask for read access to your uploads.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">2.</span>
                <span>Pick what to bring over and pay once for the whole batch. Anything already imported is skipped and never charged twice.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">3.</span>
                <span>We download and publish them to your profile in the background. Close the tab — you'll get a notification when it finishes.</span>
              </li>
            </ol>
            <p className="text-xs text-zinc-500">
              Videos publish as normal posts without minting, since a batch can't stop to ask your wallet to sign each one.
            </p>
          </div>

          <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">What it costs</h2>
            {pricing ? (
              <>
                <p className="text-sm text-zinc-400">
                  Every video is cheaper than the one before it — the rate drops as the batch grows,
                  so the price below is what that many videos comes to in total.
                </p>
                <ul className="flex flex-col divide-y divide-white/5 text-sm">
                  {/* The allowance comes off the top of the count once, ever,
                      and the curve prices whatever is left — so it is its own
                      row rather than a point on the curve. */}
                  {pricing.freeAllowance > 0 && (
                    <li className="flex items-center justify-between gap-3 py-2">
                      <span className="text-zinc-400 tabular-nums">
                        First {pricing.freeAllowance} videos
                      </span>
                      <span className="text-white">Free, once</span>
                    </li>
                  )}
                  {/* Rows are worked examples off a continuous curve, not
                      brackets — 300 videos costs what 300 costs, and 301
                      costs one more video, not a jump to the next row. The
                      saving is spelled out because a falling per-video rate
                      is the whole shape and a column of totals hides it. */}
                  {pricing.tiers.map(tier => {
                    const videos = tier.videos ?? tier.maxVideos;
                    const baseRate = pricing.tiers[0].priceUsd / (pricing.tiers[0].videos ?? pricing.tiers[0].maxVideos);
                    const rate = tier.priceUsd / videos;
                    const saving = Math.round((1 - rate / baseRate) * 100);
                    return (
                      <li key={videos} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex items-baseline gap-2">
                          <span className="text-zinc-400 tabular-nums">
                            {videos.toLocaleString()} videos
                          </span>
                          {saving > 0 && (
                            <span className="text-[11px] text-zinc-500 tabular-nums">−{saving}%</span>
                          )}
                        </span>
                        <span className="text-white tabular-nums">
                          {tier.priceUsd === 0 ? 'Free' : <DhbAmount value={tier.priceDhb} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                Every video is cheaper than the one before it — the rate drops as the batch grows. The exact price is shown before you pay.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              Paid in DHB, once, before the batch starts. Badge holders pay less — your discount is applied to the quote.
              If a video can't be imported, its share is credited back toward your next migration.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
