/**
 * dehub.io/converter — import a video from another platform as a DeHub post.
 * ==========================================================================
 * Lives inside AppLayout (sidebar/nav chrome), same as wallet/profile/etc —
 * this is a signed-in action, not a marketing landing page. Pasting a URL
 * and confirming ownership is a different action from "make a post" though,
 * so it stays off the compose action bar and gets its own page instead.
 *
 * The page used to hold exactly one import: the box locked while it ran, and
 * a failure ended it with "try again in a few minutes". Both were wrong about
 * what actually happens. YouTube refuses our datacenter IP in blocks of
 * minutes, so "try again" meant pasting the same link into the same block,
 * and the lock meant a creator with ten videos to bring over could not even
 * queue the second one. The backend now keeps rate-limited jobs and re-runs
 * them itself, so this is a queue: paste, get a tile, paste the next one.
 * Tiles are the same shape "Migrate all" uses for its batch, because they are
 * the same thing at a different size — a post that has not landed yet.
 *
 * It was YouTube-only until the backend's hostname allowlist widened; the
 * page is now source-agnostic and reads the source's own name off the job.
 * The one thing that stays YouTube-shaped is the instant thumbnail: an
 * i.ytimg URL is derivable from a pasted link, so a YouTube tile has art
 * before the job starts. Every other source has to wait for the metadata
 * fetch to report one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ArrowDownToLine, Link2, Clipboard, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import { ImportDetailsDialog } from '@/components/app/converter/ImportDetailsDialog';
import { PodcastImportSection } from '@/components/app/converter/PodcastImportSection';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import {
  CONVERTER_SOURCES,
  converterSourceList,
  defaultMediaKind,
  detectConverterSource,
  type MediaKind,
} from '@/lib/converter-sources';
import {
  importFromYoutube,
  listYoutubeImports,
  type YoutubeImportStatusResponse,
} from '@/lib/api/dehub/youtube-import';

/** Two attempts at a theme-token color (`border-primary`, then
 * `border-foreground`) both went invisible on some DeHub theme — this app
 * remaps named colors per theme, so any semantic token can end up close to
 * its own background. Bracket syntax below is a literal, unthemed color:
 * black border, white fill, on every theme, full stop.
 *
 * No top margin: the box is 20px and `text-sm` sets a 20px line-height, so
 * under the row's `items-start` it already centres on the label's first line
 * and stays centred when the label wraps. The `mt-0.5` that used to be here
 * pushed it 2px low, which read as the text sitting high. */
const CHECKBOX_CLASS =
  'h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

/** Tiles a creator has waved off, per browser. Finished and failed imports
 * stay on the server for a day and a week respectively — long enough to be
 * useful on the next visit, long enough to be clutter once they have been
 * read. Dismissing is local because it is a preference about a view, not a
 * fact about the job. */
const DISMISSED_KEY = 'dehub:converter:dismissed';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    // Bounded: the server forgets old jobs, so ids kept past that only grow.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    // Private mode or full storage — dismissing just won't survive a reload.
  }
}

/** Live means "still going to change on its own", which is what decides
 * whether the page keeps polling. `delayed` is in here on purpose: that is a
 * rate-limited job waiting out its backoff, not a finished one. */
function isLive(job: YoutubeImportStatusResponse): boolean {
  return job.state === 'active' || job.state === 'waiting' || job.state === 'delayed';
}

/**
 * What a tile should show as its art.
 *
 * `thumbnailUrl` is whatever the source published, and it only exists once
 * the metadata fetch has landed. The YouTube fallback below needs no fetch at
 * all — `i.ytimg.com/vi/<id>/mqdefault.jpg` always resolves for a real id —
 * which is why a YouTube tile has art the instant the link is pasted and the
 * others fill in a moment later.
 */
function thumbnailFor(job: YoutubeImportStatusResponse): string | null {
  if (job.thumbnailUrl) return job.thumbnailUrl;
  if (job.youtubeVideoId) return `https://i.ytimg.com/vi/${job.youtubeVideoId}/mqdefault.jpg`;
  return null;
}

/** Where a job came from, for the tile's corner and for error copy. The
 * server sends the name; the id lookup is only for jobs queued before it
 * did, and "Video" is what a tile says when neither answers. */
function sourceLabelFor(job: YoutubeImportStatusResponse): string | null {
  if (job.sourceLabel) return job.sourceLabel;
  const known = CONVERTER_SOURCES.find(source => source.id === job.sourceId);
  if (known) return known.label;
  return job.url ? detectConverterSource(job.url)?.label ?? null : null;
}

export default function YoutubeImportPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [url, setUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  /** What the creator picked, or null while they have not. Null means "follow
   * the link" — a SoundCloud paste should not need a click to say audio, and a
   * Pinterest one should not need a click to say pictures. */
  const [pickedKind, setPickedKind] = useState<MediaKind | null>(null);
  /** The link waiting in the review dialog, or null when nothing is. */
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'link' | 'podcast'>('link');

  /** The source of whatever is currently in the box, if it is one we take. */
  const pastedSource = detectConverterSource(url);
  /** What this paste will publish as. The creator's pick wins, but only while
   * the pasted link can actually do it — pasting a SoundCloud link after
   * choosing Pictures must not silently queue something the server refuses. */
  const mediaKind: MediaKind = (() => {
    if (!pastedSource) return pickedKind ?? 'video';
    if (pickedKind && pastedSource.media.includes(pickedKind)) return pickedKind;
    return defaultMediaKind(pastedSource);
  })();
  const [submitting, setSubmitting] = useState(false);
  const [imports, setImports] = useState<YoutubeImportStatusResponse[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  /** What each job was last announced as, so a five-second poll does not
   * toast the same thing twelve times a minute. */
  const announced = useRef(new Map<string, string>());
  /** Whether the first list has landed. Everything in it is history — a
   * creator returning to the page should not be told about an import that
   * hit a rate limit while they were away as though it just happened. */
  const seeded = useRef(false);

  /** What the tile says it is doing — short enough for a badge, specific
   * enough to be worth reading twice. */
  const statusLabel = useCallback(
    (job: YoutubeImportStatusResponse): string => {
      if (job.state === 'completed') {
        return job.result?.duplicate ? t('converter.statusAlreadyHere') : t('converter.statusImported');
      }
      if (job.state === 'failed') return t('converter.statusFailed');
      if (job.rateLimited && isLive(job)) return t('converter.statusRateLimited');
      if (job.state === 'active') {
        if (job.phase === 'processing') return t('converter.statusProcessing');
        if (job.phase === 'publishing') return t('converter.statusPublishing');
        return job.percent
          ? t('converter.statusDownloadingPercent', { percent: job.percent })
          : t('converter.statusDownloading');
      }
      return t('converter.statusQueued');
    },
    [t],
  );

  /** The line under the title. A queued job says why it is queued — "waiting"
   * with no reason is the state people re-paste a link over. */
  const statusDetail = useCallback(
    (job: YoutubeImportStatusResponse): string | null => {
      if (job.state === 'failed') return job.failedReason || t('converter.detailFailed');
      if (job.rateLimited && isLive(job)) {
        return t('converter.detailRateLimited', { source: sourceLabelFor(job) ?? t('converter.thatSource') });
      }
      if (job.state === 'completed') {
        return job.result?.duplicate ? t('converter.detailDuplicate') : null;
      }
      if (job.state === 'active') return null;
      return t('converter.detailWaiting');
    },
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const jobs = await listYoutubeImports();
      setImports(jobs);

      for (const job of jobs) {
        const id = String(job.jobId);
        // Rate limiting is announced the moment the queue takes the job back,
        // not when it eventually finishes — the point of the message is to
        // reach the creator while they are still looking at the box wondering
        // whether to paste it again.
        const key =
          job.rateLimited && isLive(job)
            ? 'rate-limited'
            : job.state === 'completed'
              ? 'completed'
              : job.state === 'failed'
                ? 'failed'
                : null;
        if (!key || announced.current.get(id) === key) continue;
        announced.current.set(id, key);
        if (!seeded.current) continue;

        const source = sourceLabelFor(job) ?? t('converter.thatSource');
        // The exact sentence a rate limit gets. It is doing two jobs: saying
        // nothing is lost, and heading off the re-paste that used to double
        // the queue.
        if (key === 'rate-limited') toast.message(t('converter.toastRateLimited', { source }));
        else if (key === 'completed') {
          toast.success(
            job.result?.duplicate
              ? t('converter.toastDuplicate')
              : t('converter.toastImported', { source }),
          );
        } else if (key === 'failed') {
          toast.error(job.failedReason || t('converter.toastFailed'));
        }
      }
      seeded.current = true;
    } catch {
      // A missed poll changes nothing — the jobs run on the server, and the
      // next tick picks up where this one left off.
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refresh();
  }, [isAuthenticated, refresh]);

  // Polls only while something can still change: a queue of finished tiles is
  // a static list, and a tab left open on one should not talk to the API every
  // five seconds forever. Keyed on the boolean rather than on `imports`, since
  // each poll returns a new array and would tear the interval down every time.
  const hasLive = imports.some(isLive);
  useEffect(() => {
    if (!isAuthenticated || !hasLive) return;
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [hasLive, isAuthenticated, refresh]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      toast.error(t('converter.errorClipboard'));
    }
  };

  /** Sends one link. `ownershipConfirmed` is always true here: the primary
   * path gates on the checkbox below, and "Try again" re-runs a link whose
   * attestation was made when it was first queued. */
  const queueImport = useCallback(
    (rawUrl: string, kind?: MediaKind, details?: { name: string; description: string; rotation?: 0 | 90 | 180 | 270 }) => {
      requireAuth(async () => {
        setSubmitting(true);
        try {
          // Omitted rather than guessed when re-running a failed tile: the
          // server falls back to the source's own default, which is what that
          // job was queued as in the first place.
          await importFromYoutube({
            url: rawUrl,
            ownershipConfirmed: true,
            mediaKind: kind,
            // Sent only when someone actually typed something. An empty name
            // lets the server use the source's own title, which is what
            // clearing the box asks for.
            name: details?.name || undefined,
            description: details?.description || undefined,
            rotation: details?.rotation,
          });
          setUrl('');
          toast.message(t('converter.toastQueued'));
          await refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t('converter.errorQueueFailed'));
        } finally {
          setSubmitting(false);
        }
      });
    },
    [refresh, requireAuth, t],
  );

  const handleSubmit = () => {
    // Checked here as well as on the server so a link from a platform we do
    // not take is answered in the box rather than after a round trip. The
    // server re-detects regardless; this is speed, not enforcement.
    if (!detectConverterSource(url)) {
      toast.error(t('converter.errorUnsupported', { sources: converterSourceList() }));
      return;
    }
    if (!ownershipConfirmed) {
      toast.error(t('converter.errorNeedRights'));
      return;
    }
    // One paste gets reviewed before it posts. "Try again" on a failed tile
    // does not: that link was already reviewed once, and re-opening the dialog
    // to retype the same thing would be a worse retry than no retry.
    setReviewing(url.trim());
  };

  const handleDismiss = (jobId: string) => {
    const next = new Set(dismissed);
    next.add(jobId);
    setDismissed(next);
    writeDismissed(next);
  };

  const visible = imports.filter(job => !dismissed.has(String(job.jobId)));
  const queued = visible.filter(isLive).length;

  return (
    <>
      <SEOHead
        title={t('converter.seoTitle')}
        description={t('converter.seoDescription')}
        url="https://dehub.io/converter"
        image="https://dehub.io/og/converter.jpg"
      />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5" />
              {t('converter.title')}
            </h1>
            {/* Bulk equivalent of this page — a whole channel instead of one
                link. Lives here, not on the profile: this is where creators
                already are when they're thinking about moving content over.
                Still YouTube-only, because a channel walk is a YouTube API
                shape and no other source has an equivalent. */}
            <Button variant="glass" size="sm" asChild>
              <Link to="/app/migrate-youtube">{t('converter.migrateAll')}</Link>
            </Button>
          </div>
          <p className="text-sm text-zinc-400 max-w-prose">{t('converter.subtitle')}</p>
        </header>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            aria-pressed={activeTab === 'link'}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === 'link' ? 'bg-white text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10',
            )}
          >
            {t('converter.title')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('podcast')}
            aria-pressed={activeTab === 'podcast'}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === 'podcast' ? 'bg-white text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10',
            )}
          >
            {t('converter.podcast.tab')}
          </button>
        </div>

        {activeTab === 'podcast' ? (
          <PodcastImportSection />
        ) : (
        <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
          {/* Same look as the sidebar's search box — bg-zinc-900/rounded-xl/no
              border — so this reads as one of the app's real inputs. */}
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder={t('converter.placeholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              disabled={submitting}
              className="pl-10 pr-20 h-[36px] bg-zinc-900 border-0 rounded-xl text-white placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <button
              type="button"
              onClick={handlePaste}
              disabled={submitting}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
            >
              <Clipboard className="w-3.5 h-3.5" />
              {t('converter.paste')}
            </button>
          </div>

          {/* What this link becomes. Only rendered once the box holds a link
              we recognise: before that there is nothing to choose between, and
              three buttons over an empty field is a question nobody asked yet.

              A source only offers what it can actually do — SoundCloud shows
              Audio alone, Pinterest leads with Pictures — so the control never
              presents an option the server would refuse. Single-option sources
              still render it, because "Audio" sitting there on its own is what
              tells someone the paste was understood. */}
          {pastedSource && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 shrink-0">{t('converter.publishAs')}</span>
              <div className="flex flex-wrap gap-1.5">
                {pastedSource.media.map(kind => {
                  const active = kind === mediaKind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setPickedKind(kind)}
                      aria-pressed={active}
                      disabled={submitting}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                        active ? 'bg-white text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10',
                      )}
                    >
                      {t(`converter.kind${kind[0].toUpperCase()}${kind.slice(1)}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* The list of sources, spelled out rather than described.
              "Paste a link from a supported platform" makes a creator guess
              and then test; twenty-one names answer it at a glance, and this
              is the one place the answer belongs. Chips rather than a comma
              run because the eye finds a name in a grid faster than in a
              sentence, and the row wraps to three or four lines at most. */}
          <div className="flex flex-wrap gap-1.5">
            {CONVERTER_SOURCES.map(source => (
              <span
                key={source.id}
                className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] leading-5 text-zinc-400"
              >
                {source.label}
              </span>
            ))}
          </div>

          {/* The whole line toggles the checkbox, not just the tiny box —
              Radix's Checkbox renders a <button>, and wrapping a <button> in
              a <label> does not forward clicks the way a native <input>
              would, so the box itself was the only clickable pixel here.
              It stays ticked between imports on purpose: the attestation is
              re-made by pressing Import with it visibly ticked, and a page
              that invites you to queue several should not make you re-tick it
              for every one. */}
          <div
            role="checkbox"
            aria-checked={ownershipConfirmed}
            tabIndex={0}
            onClick={() => setOwnershipConfirmed(v => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOwnershipConfirmed(v => !v);
              }
            }}
            className="flex items-start gap-2 text-sm text-zinc-400 cursor-pointer select-none"
          >
            <Checkbox
              checked={ownershipConfirmed}
              className={cn(CHECKBOX_CLASS, 'pointer-events-none')}
            />
            <span>{t('converter.ownership')}</span>
          </div>

          <Button
            variant="glass"
            onClick={handleSubmit}
            disabled={submitting || !url.trim() || !ownershipConfirmed}
            className="w-full"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isAuthenticated
              ? queued > 0
                ? t('converter.addToQueue')
                : t('converter.import')
              : t('converter.signInToImport')}
          </Button>
        </section>
        )}

        {/* ── The queue ───────────────────────────────────────────────────
            Directly under the box, because it answers the question pressing
            Import asks: where did that go. */}
        {visible.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">{t('converter.queueHeading')}</h2>
              <p className="text-xs text-zinc-500">
                {/* `n`, not `count` — i18next treats a `count` variable as a
                    plural selector and starts looking for `_one`/`_other`
                    keys that 110 locale files do not have. */}
                {queued > 0 ? t('converter.queueRunning', { n: queued }) : t('converter.queueIdle')}
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              {visible.map(job => {
                const id = String(job.jobId);
                const tokenId = job.result?.createdTokenId;
                const percent = job.state === 'completed' ? 100 : job.percent ?? 0;
                const done = job.state === 'completed' || job.state === 'failed';
                const detail = statusDetail(job);
                const thumbnail = thumbnailFor(job);
                const source = sourceLabelFor(job);

                return (
                  <div
                    key={id}
                    data-page-bento
                    className="relative flex flex-col bg-zinc-900 rounded-2xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {thumbnail && (
                        <img
                          src={thumbnail}
                          alt=""
                          loading="lazy"
                          // A channel URL can end in an 11-character tail that
                          // is not a video id, and a source's own thumbnail
                          // can expire; hide the broken image rather than
                          // leave a grey placeholder on the tile.
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />

                      {/* Per-video state, worn the way a feed card wears its
                          duration: a black pill on the thumbnail rather than a
                          line of body text. `data-keep-dark` holds it black on
                          the themes that repaint dark surfaces — it sits over
                          an image, so it has to stay legible whatever the
                          theme does to the card beneath it. */}
                      <span
                        data-keep-dark
                        className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white"
                      >
                        {job.state === 'completed' && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        )}
                        {job.state === 'failed' && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                        {!done && !isLiveActive(job) && <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
                        {!done && isLiveActive(job) && (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-300" />
                        )}
                        {statusLabel(job)}
                      </span>

                      {/* Which platform this one came from. A queue is mixed
                          now, and two tiles mid-download otherwise differ only
                          by title — which is exactly what has not arrived yet
                          while they are downloading. */}
                      {source && (
                        <span
                          data-keep-dark
                          className={cn(
                            'absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/90',
                            job.state !== 'failed' && 'bottom-3',
                          )}
                        >
                          {/* Source alone stopped being enough once one link
                              could become three different posts — the same
                              TikTok URL is a video, a sound or a slideshow
                              depending on what was picked. */}
                          {job.mediaKind && job.mediaKind !== 'video'
                            ? t('converter.tileSourceKind', {
                                source,
                                kind: t(`converter.kind${job.mediaKind[0].toUpperCase()}${job.mediaKind.slice(1)}`),
                              })
                            : source}
                        </span>
                      )}

                      {done && (
                        <button
                          type="button"
                          onClick={() => handleDismiss(id)}
                          aria-label={t('converter.dismiss')}
                          data-keep-dark
                          className="absolute top-2 right-2 rounded bg-black/70 p-1 text-white/80 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* The bar rides the bottom edge of the thumbnail, where
                          a video's own scrubber would be. Left in place at
                          100% on a finished import rather than removed, so the
                          tile does not change shape as it lands. */}
                      {job.state !== 'failed' && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                          <div
                            className={cn(
                              'h-full bg-white transition-[width] duration-500 ease-out',
                              // Nothing to measure yet — a sliver that
                              // breathes says "waiting", where a zero-width
                              // bar says nothing at all.
                              percent === 0 && 'w-8 animate-pulse',
                            )}
                            style={percent > 0 ? { width: `${percent}%` } : undefined}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium text-white leading-snug">
                        {job.title || job.url || t('converter.untitled')}
                      </span>
                      {detail && <span className="text-xs text-zinc-400 line-clamp-3">{detail}</span>}
                      {(job.state === 'completed' && tokenId) || (job.state === 'failed' && job.url) ? (
                        <div className="flex items-center gap-3 pt-1">
                          {job.state === 'completed' && tokenId && (
                            <Link to={`/app/post/${tokenId}`} className="text-xs text-white underline">
                              {t('converter.viewPost')}
                            </Link>
                          )}
                          {job.state === 'failed' && job.url && (
                            <button
                              type="button"
                              onClick={() => queueImport(job.url!, job.mediaKind)}
                              className="text-xs text-white underline"
                            >
                              {t('converter.tryAgain')}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <ImportDetailsDialog
        open={reviewing !== null}
        url={reviewing}
        mediaKind={mediaKind}
        onCancel={() => setReviewing(null)}
        onConfirm={details => {
          const target = reviewing;
          setReviewing(null);
          if (target) queueImport(target, mediaKind, details);
        }}
      />
    </>
  );
}

/** Spinner or clock: a job that is actually running gets the spinner, one
 * waiting its turn or waiting out a backoff gets the clock. Split out because
 * the badge reads it twice and the inline expression was unreadable. */
function isLiveActive(job: YoutubeImportStatusResponse): boolean {
  return job.state === 'active';
}
