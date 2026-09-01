/**
 * dehub.io/converter — import a YouTube video as a DeHub post.
 * ==============================================================
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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Youtube, Clipboard, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import {
  importFromYoutube,
  listYoutubeImports,
  type YoutubeImportStatusResponse,
} from '@/lib/api/dehub/youtube-import';

const YOUTUBE_URL_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

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

/** The exact sentence a rate limit gets. It is doing two jobs: saying nothing
 * is lost, and heading off the re-paste that used to double the queue. */
const RATE_LIMITED_TOAST =
  "Rate limited, your upload is queued and will be processed asap, you don't need to try the same link again but are free to queue more as you wish";

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

/** What the tile says it is doing — short enough for a badge, specific enough
 * to be worth reading twice. */
function statusLabel(job: YoutubeImportStatusResponse): string {
  if (job.state === 'completed') return job.result?.duplicate ? 'Already here' : 'Imported';
  if (job.state === 'failed') return 'Failed';
  if (job.rateLimited && isLive(job)) return 'Rate limited';
  if (job.state === 'active') {
    if (job.phase === 'processing') return 'Processing';
    if (job.phase === 'publishing') return 'Publishing';
    return job.percent ? `Downloading ${job.percent}%` : 'Downloading';
  }
  return 'Queued';
}

/** The line under the title. A queued job says why it is queued — "waiting"
 * with no reason is the state people re-paste a link over. */
function statusDetail(job: YoutubeImportStatusResponse): string | null {
  if (job.state === 'failed') return job.failedReason || 'Could not import that video.';
  if (job.rateLimited && isLive(job)) {
    return "YouTube is rate-limiting us. This runs again on its own — there's nothing to re-paste.";
  }
  if (job.state === 'completed') {
    return job.result?.duplicate ? 'That video was already on your profile.' : null;
  }
  if (job.state === 'active') return null;
  return 'Waiting its turn.';
}

/** Per-video state, worn the way a feed card wears its duration: a black pill
 * on the thumbnail rather than a line of body text. `data-keep-dark` holds it
 * black on the themes that repaint dark surfaces — it sits over an image, so
 * it has to stay legible whatever the theme does to the card beneath it. */
function StatusBadge({ job }: { job: YoutubeImportStatusResponse }) {
  const done = job.state === 'completed';
  const failed = job.state === 'failed';
  const waiting = !done && !failed && job.state !== 'active';

  return (
    <span
      data-keep-dark
      className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white"
    >
      {done && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
      {failed && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
      {!done && !failed && waiting && <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
      {!done && !failed && !waiting && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-300" />
      )}
      {statusLabel(job)}
    </span>
  );
}

export default function YoutubeImportPage() {
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [url, setUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
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

        if (key === 'rate-limited') toast.message(RATE_LIMITED_TOAST);
        else if (key === 'completed') {
          toast.success(
            job.result?.duplicate ? 'That video was already imported.' : 'Imported from YouTube!',
          );
        } else if (key === 'failed') {
          toast.error(job.failedReason || 'That import failed.');
        }
      }
      seeded.current = true;
    } catch {
      // A missed poll changes nothing — the jobs run on the server, and the
      // next tick picks up where this one left off.
    }
  }, []);

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
      toast.error('Could not read the clipboard — paste manually instead');
    }
  };

  /** Sends one link. `ownershipConfirmed` is always true here: the primary
   * path gates on the checkbox below, and "Try again" re-runs a link whose
   * attestation was made when it was first queued. */
  const queueImport = useCallback(
    (rawUrl: string) => {
      requireAuth(async () => {
        setSubmitting(true);
        try {
          await importFromYoutube({ url: rawUrl, ownershipConfirmed: true });
          setUrl('');
          toast.message('Queued — it publishes to your profile when it finishes.');
          await refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not queue that import');
        } finally {
          setSubmitting(false);
        }
      });
    },
    [refresh, requireAuth],
  );

  const handleSubmit = () => {
    if (!YOUTUBE_URL_RE.test(url.trim())) {
      toast.error('Enter a valid youtube.com or youtu.be URL');
      return;
    }
    if (!ownershipConfirmed) {
      toast.error('Please confirm you have the rights to this content');
      return;
    }
    queueImport(url.trim());
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
        title="Import from YouTube — DeHub"
        description="Paste a YouTube link and publish it as a DeHub post."
        url="https://dehub.io/converter"
        image="https://dehub.io/og/converter.jpg"
      />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Youtube className="w-5 h-5" />
              Import from YouTube
            </h1>
            {/* Bulk equivalent of this page — a whole channel instead of one
                link. Lives here, not on the profile: this is where creators
                already are when they're thinking about YouTube content. */}
            <Button variant="glass" size="sm" asChild>
              <Link to="/app/migrate-youtube">Migrate all</Link>
            </Button>
          </div>
          <p className="text-sm text-zinc-400 max-w-prose">
            Paste a link to a video you already own and we'll publish it as a post on your profile.
            Queue as many as you like — they run one after another in the background.
          </p>
        </header>

        <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
          {/* Same look as the sidebar's search box — bg-zinc-900/rounded-xl/no
              border — so this reads as one of the app's real inputs. */}
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="https://youtube.com/watch?v=..."
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
              Paste
            </button>
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
            <span>
              I own this content, or have the rights holder's permission to publish it on DeHub.
            </span>
          </div>

          <Button
            variant="glass"
            onClick={handleSubmit}
            disabled={submitting || !url.trim() || !ownershipConfirmed}
            className="w-full"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isAuthenticated ? (queued > 0 ? 'Add to queue' : 'Import') : 'Sign in to import'}
          </Button>
        </section>

        {/* ── The queue ───────────────────────────────────────────────────
            Directly under the box, because it answers the question pressing
            Import asks: where did that go. */}
        {visible.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Your imports</h2>
              <p className="text-xs text-zinc-500">
                {queued > 0
                  ? `${queued} in the queue — safe to close this tab, they keep going.`
                  : 'Nothing running.'}
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
              {visible.map(job => {
                const id = String(job.jobId);
                const tokenId = job.result?.createdTokenId;
                const percent = job.state === 'completed' ? 100 : job.percent ?? 0;
                const done = job.state === 'completed' || job.state === 'failed';
                const detail = statusDetail(job);

                return (
                  <div
                    key={id}
                    data-page-bento
                    className="relative flex flex-col bg-zinc-900 rounded-2xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {/* YouTube's own thumbnail for the id — no API call, and
                          it exists from the moment the link is pasted, which
                          is the whole reason the id is stored on the job. */}
                      {job.youtubeVideoId && (
                        <img
                          src={`https://i.ytimg.com/vi/${job.youtubeVideoId}/mqdefault.jpg`}
                          alt=""
                          loading="lazy"
                          // A channel URL can end in an 11-character tail that
                          // is not a video id; hide the broken image rather
                          // than leave YouTube's grey placeholder on the tile.
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                      <StatusBadge job={job} />

                      {done && (
                        <button
                          type="button"
                          onClick={() => handleDismiss(id)}
                          aria-label="Dismiss"
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
                        {job.title || job.url || 'YouTube video'}
                      </span>
                      {detail && <span className="text-xs text-zinc-400 line-clamp-3">{detail}</span>}
                      {(job.state === 'completed' && tokenId) || (job.state === 'failed' && job.url) ? (
                        <div className="flex items-center gap-3 pt-1">
                          {job.state === 'completed' && tokenId && (
                            <Link to={`/app/post/${tokenId}`} className="text-xs text-white underline">
                              View post
                            </Link>
                          )}
                          {job.state === 'failed' && job.url && (
                            <button
                              type="button"
                              onClick={() => queueImport(job.url!)}
                              className="text-xs text-white underline"
                            >
                              Try again
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
    </>
  );
}
