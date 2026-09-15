/**
 * /app/migrate-youtube — "Migrate all"
 * =====================================
 * Bulk-import a creator's whole channel or profile as DeHub posts, one paid
 * batch at a time. Paste the address, tick the ownership box, pick what to
 * bring over, pay once in DHB, and the import runs in the background.
 *
 * No longer YouTube-only, despite the route name. The listing walks any source
 * the converter supports — `listChannelUploads` used to filter on an
 * 11-character YouTube video id, which silently reported every TikTok, Vimeo
 * or SoundCloud profile as empty. The route keeps its name because links to it
 * exist; the page does not pretend the restriction is still there.
 *
 * Every card is editable. The title and description a creator types are frozen
 * onto the charge at quote time, so a batch that runs for hours publishes the
 * text they reviewed and paid for rather than whatever the source calls it by
 * then. An empty box means "use the source's own title".
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
import {
  Loader2,
  ArrowDownToLine,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  Clipboard,
  Pencil,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { AppState } from '@/components/app/AppState';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import dehubCoin from '@/assets/dehub-coin.png';

/**
 * A migration transfer that has been signed but not yet settled.
 *
 * The DHB leaves the wallet, and only then does settleMigration get told about
 * it. Anything that fails in that gap must not send a second transfer for the
 * same charge, so the receipt is kept until settle has acknowledged it. The
 * post-quota path stashes its settlement for the same reason.
 */
interface SentMigrationPayment {
  txHash: string;
  chainId: number;
}

const MIGRATION_PAID_KEY = 'dehub.migrate.sentPayment';

function sentMigrationPayments(): Record<string, SentMigrationPayment> {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_PAID_KEY) || '{}');
  } catch {
    return {};
  }
}

function readSentMigrationPayment(chargeId: string): SentMigrationPayment | null {
  return sentMigrationPayments()[chargeId] ?? null;
}

function rememberSentMigrationPayment(chargeId: string, payment: SentMigrationPayment): void {
  try {
    localStorage.setItem(
      MIGRATION_PAID_KEY,
      JSON.stringify({ ...sentMigrationPayments(), [chargeId]: { txHash: payment.txHash, chainId: payment.chainId } }),
    );
  } catch { /* private mode — the retry inside this page load still reuses it */ }
}

function forgetSentMigrationPayment(chargeId: string): void {
  try {
    const all = sentMigrationPayments();
    delete all[chargeId];
    localStorage.setItem(MIGRATION_PAID_KEY, JSON.stringify(all));
  } catch { /* nothing to clean up */ }
}
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
 * black border, white fill, on every theme, full stop.
 *
 * No top margin on the ownership row: the box is 20px and `text-sm` sets a
 * 20px line-height, so under `items-start` it already centres on the label's
 * first line and stays centred when the label wraps. The `mt-0.5` that used to
 * be applied there pushed it 2px low, which read as the text sitting high. */
const CHECKBOX_CLASS =
  'h-5 w-5 shrink-0 rounded border-[2.5px] border-[#000] bg-[#fff] shadow-[0_0_0_1px_rgba(255,255,255,0.6)] data-[state=checked]:bg-[#000] data-[state=checked]:text-[#fff]';

/** The last channel that listed successfully. Purely so a batch resumed after
 * a reload can re-fetch titles for its results grid — the OAuth connection
 * used to be what remembered which channel a creator was migrating, and
 * nothing server-side does now. Per-browser and disposable: losing it costs
 * video IDs instead of titles on a resumed view, nothing more. */
const CHANNEL_URL_KEY = 'dehub:migrate:profile-url';

/** The example grid shown before a batch exists. Deliberately covers all
 * three states and a real-sounding failure reason — the point is to show
 * that failures are surfaced per video and can be retried, not to fill
 * space. Titles are generic so it never looks like someone else's channel. */
const SAMPLE_RESULTS: { key: string; status: 'imported' | 'failed' | 'pending'; reasonKey?: string }[] = [
  { key: 'migrate.sampleTrailer', status: 'imported' },
  { key: 'migrate.sampleBehindScenes', status: 'imported' },
  { key: 'migrate.sampleQa', status: 'imported' },
  { key: 'migrate.sampleStudioTour', status: 'pending' },
  { key: 'migrate.sampleLiveReplay', status: 'failed', reasonKey: 'migrate.sampleLiveReplayReason' },
  { key: 'migrate.sampleOldVlog', status: 'imported' },
];

/** Per-video state, worn the way a feed card wears its duration: a black pill
 * on the thumbnail rather than a line of body text. `data-keep-dark` holds it
 * black on the themes that repaint dark surfaces — it sits over an image, so
 * it has to stay legible whatever the theme does to the card beneath it. */
function StatusBadge({ status }: { status: 'imported' | 'failed' | 'pending' }) {
  const { t } = useTranslation();
  return (
    <span
      data-keep-dark
      className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white"
    >
      {status === 'pending' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-300" />}
      {status === 'imported' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
      {status === 'failed' && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
      {status === 'pending' ? t('migrate.statusImporting') : status === 'imported' ? t('migrate.statusImported') : t('migrate.statusFailed')}
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
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [channelUrl, setChannelUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Which cards have their editor open. Not persisted: it is a view state,
   * and a reload that reopened twelve editors would be worse than one that
   * closed them. */
  const [editing, setEditing] = useState<Set<string>>(new Set());
  /**
   * Title and description the creator typed, per video id.
   *
   * Keyed rather than positional so it survives the list being refetched — a
   * creator can paste a different profile, come back, and their text is still
   * attached to the right video. Only non-empty values are sent; an empty one
   * means "use the source's own title", which is what clearing the box asks
   * for.
   */
  const [overrides, setOverrides] = useState<Record<string, { name?: string; description?: string }>>({});
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

  /**
   * What the charge itself remembers about each item, keyed the same way its
   * results are.
   *
   * The channel list above only exists while the picker is on screen; a
   * resumed batch renders from the charge alone. It carries the link each item
   * actually lives at and the title the creator typed, so the progress grid
   * can show a TikTok tile that links to TikTok and reads as the creator
   * renamed it — neither of which can be derived from a bare id.
   */
  const urlByKey = useMemo(
    () => new Map((charge?.youtubeVideoIds ?? []).map((k, i) => [k, charge?.itemUrls?.[i] || ''])),
    [charge],
  );

  const nameByKey = useMemo(
    () => new Map((charge?.youtubeVideoIds ?? []).map((k, i) => [k, charge?.itemNames?.[i] || ''])),
    [charge],
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
      toast.error(t('migrate.errNoUrl'));
      return;
    }
    if (!ownershipConfirmed) {
      toast.error(t('migrate.errNoOwnership'));
      return;
    }
    // Listing is an authenticated call, and `apiCall` throws on a dead session
    // BEFORE it ever reaches the network. Without this wrapper that surfaced as
    // the button doing nothing at all: no request, no console error, just a
    // "Session expired" toast that auto-dismissed, and no way to sign in from
    // this page. The old flow never needed a prompt because it listed on mount
    // and "Connect your YouTube channel" was the way in; making the paste form
    // the primary action is what put an authed call behind a button.
    // Same requireAuth the single-video importer wraps its submit in.
    requireAuth(async () => {
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
        toast.error(err instanceof Error ? err.message : t('migrate.errReadChannel'));
        setStage('idle');
      }
    });
  }, [channelUrl, ownershipConfirmed, fetchVideos, requireAuth]);

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
              ? t(imported === 1 ? 'migrate.doneWithFailuresOne' : 'migrate.doneWithFailuresMany', { n: imported, failed })
              : t(imported === 1 ? 'migrate.doneAllOne' : 'migrate.doneAllMany', { n: imported }),
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
      toast.error(t('migrate.errClipboard'));
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

  /** Opening the editor also selects the video. Typing a title for something
   * you are not bringing over is a dead end, and silently leaving it unselected
   * is the kind of thing you only notice after paying. */
  const openEditor = (id: string) => {
    setEditing(prev => new Set(prev).add(id));
    setSelected(prev => new Set(prev).add(id));
  };

  const closeEditor = (id: string) => {
    setEditing(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const setOverride = (id: string, field: 'name' | 'description', value: string) => {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const nameFor = (v: ChannelVideo) => overrides[v.youtubeVideoId]?.name ?? '';
  const descriptionFor = (v: ChannelVideo) => overrides[v.youtubeVideoId]?.description ?? '';
  const hasOverride = (id: string) =>
    Boolean(overrides[id]?.name?.trim() || overrides[id]?.description?.trim());

  /** Everything not already imported, which is what "select all" means here —
   * imported videos are permanently checked and can't be unpicked. */
  const selectableIds = useMemo(
    () => videos.filter(v => !v.alreadyImported).map(v => v.youtubeVideoId),
    [videos],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

  /**
   * The three parallel arrays the quote takes, built from one id list.
   *
   * Aligned by construction rather than by remembering to keep three
   * `.map()`s in step — the server refuses a mismatch, and a mismatch that
   * got through would publish one video's title onto another's post.
   *
   * URLs come from the listing rather than being rebuilt, because only
   * YouTube lives at a guessable watch address.
   */
  const itemsFor = (ids: string[]) => {
    const byId = new Map(videos.map(v => [v.youtubeVideoId, v]));
    return {
      urls: ids.map(id => byId.get(id)?.url ?? ''),
      names: ids.map(id => overrides[id]?.name?.trim() ?? ''),
      descriptions: ids.map(id => overrides[id]?.description?.trim() ?? ''),
    };
  };

  const handleGetQuote = async () => {
    if (!selected.size) {
      toast.error(t('migrate.errSelectOne'));
      return;
    }
    setPayFallback('listing');
    setStage('quoting');
    try {
      const ids = [...selected];
      const q = await quoteMigration(ids, itemsFor(ids));
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('migrate.errPrice'));
      setStage('listing');
    }
  };

  const handleRetryFailed = async () => {
    const failedIds = charge?.results.filter(r => r.status === 'failed').map(r => r.youtubeVideoId) ?? [];
    if (!failedIds.length) return;
    setPayFallback('done');
    setStage('quoting');
    try {
      const q = await quoteMigration(failedIds, itemsFor(failedIds));
      setQuote(q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('migrate.errRetry'));
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
        if (!q.recipient) throw new Error(t('migrate.errNoPayments'));
        const { payDhb } = await import('@/lib/dhb-payment');
        toast.loading(t('migrate.paying', { amount: q.amountDhb.toLocaleString() }), {
          id: 'migration-pay',
          duration: Infinity,
        });
        // A transfer already sent for this charge is reused rather than
        // repeated. The DHB leaves the wallet before settleMigration is called,
        // so a failure in that gap — a blip, a 5xx — used to drop back to a
        // live Pay button and send a second transfer for the same charge.
        const alreadySent = readSentMigrationPayment(q.chargeId);
        const payment = alreadySent ?? await payDhb(q.amountDhb, q.recipient, {
          context: t('migrate.payContext'),
          expectedSigner: user?.address,
          shortfallMessage: (amount, has) =>
            t('migrate.shortfall', { amount: amount.toLocaleString(), has: has.toLocaleString() }),
        });
        if (!alreadySent) rememberSentMigrationPayment(q.chargeId, payment);
        toast.dismiss('migration-pay');
        await settleMigration(q.chargeId, payment.txHash, payment.chainId);
        forgetSentMigrationPayment(q.chargeId);
      }
      setCharge(null);
      setStage('processing');
      pollCharge(q.chargeId);
    } catch (err) {
      toast.dismiss('migration-pay');
      toast.error(err instanceof Error ? err.message : t('migrate.errPayment'));
      // Back to the quote, not to the stage before it.
      //
      // payFallback is 'listing', and the picker only renders when there is no
      // quote while the quote card only renders while quoting or paying — so
      // dropping to 'listing' with the quote still set hid both, leaving the
      // page with nothing on it but the sample grid and no way back short of a
      // reload. 'quoting' is the state that shows the quote with a live Pay
      // button, which is what someone whose signature failed wants next.
      setStage(quote ? 'quoting' : payFallback);
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
        title={t('migrate.seoTitle')}
        description={t('migrate.seoDescription')}
        url="https://dehub.io/migrate-youtube"
        image="https://dehub.io/og/migrate-youtube.jpg"
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
                <ArrowDownToLine className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">{t('migrate.title')}</h1>
                <p className="text-sm text-zinc-500">
                  {t('migrate.subtitle')}
                </p>
              </div>
            </div>
            <Button variant="glass" size="sm" asChild className="shrink-0 self-start sm:self-auto">
              <Link to="/converter">{t('migrate.justOne')}</Link>
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
              <h2 className="text-sm font-semibold text-white">{t('migrate.yourChannel')}</h2>
              <p className="text-sm text-zinc-400">
                {t('migrate.yourChannelHint')}
              </p>
            </div>

            {/* Same input treatment as the single-video importer on
                /converter, because it is the same action at a different
                scale — a creator moving between the two pages should not
                meet two different-looking forms. */}
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder={t('migrate.placeholder')}
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
                {t('migrate.paste')}
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
                className={cn(CHECKBOX_CLASS, 'pointer-events-none')}
              />
              <span>
                {t('migrate.ownership')}
              </span>
            </div>

            <Button
              variant="glass"
              onClick={handleListChannel}
              disabled={stage === 'fetching' || !channelUrl.trim() || !ownershipConfirmed}
              className="self-start"
            >
              {stage === 'fetching' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {stage === 'fetching'
                ? t('migrate.reading')
                : isAuthenticated
                  ? t('migrate.showMyVideos')
                  : t('migrate.signInToShow')}
            </Button>
          </section>
        )}

        {(stage === 'listing' || stage === 'quoting') && videos.length > 0 && !quote && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-white">{t('migrate.pickTitle')}</h2>
                <p className="text-sm text-zinc-400">
                  {t('migrate.pickCount', {
                    selected: selected.size,
                    total: videos.filter(v => !v.alreadyImported).length,
                  })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={toggleAll} className="shrink-0">
                {allSelected ? t('migrate.clearAll') : t('migrate.selectAll')}
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
                        <ImageIcon className="absolute inset-0 m-auto h-8 w-8 text-zinc-700" />
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
                          {t('migrate.importedBadge')}
                        </span>
                      )}

                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        aria-label={t('migrate.watchOnSource')}
                        data-keep-dark
                        className="absolute bottom-2 left-2 rounded bg-black/70 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <div className="flex flex-col gap-1 p-3">
                      {/* Editing lives behind a pencil rather than showing two
                          text boxes on every card. A channel of 300 videos
                          would otherwise render 600 inputs, and the common case
                          is bringing everything over as it already is. Clicking
                          into the fields must not toggle the card's checkbox,
                          hence the stopPropagation on the wrapper. */}
                      {editing.has(v.youtubeVideoId) ? (
                        <div
                          className="flex flex-col gap-2"
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => e.stopPropagation()}
                        >
                          <Input
                            value={nameFor(v)}
                            onChange={e => setOverride(v.youtubeVideoId, 'name', e.target.value)}
                            placeholder={v.title}
                            aria-label={t('migrate.editTitle')}
                            className="h-8 bg-zinc-800 border-0 rounded-lg text-sm text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <Textarea
                            value={descriptionFor(v)}
                            onChange={e => setOverride(v.youtubeVideoId, 'description', e.target.value)}
                            placeholder={t('migrate.editDescriptionPlaceholder')}
                            aria-label={t('migrate.editDescription')}
                            rows={3}
                            className="resize-none bg-zinc-800 border-0 rounded-lg text-xs text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <button
                            type="button"
                            onClick={() => closeEditor(v.youtubeVideoId)}
                            className="self-start text-xs text-white underline"
                          >
                            {t('migrate.editDone')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className="line-clamp-2 text-sm font-medium text-white leading-snug"
                            title={nameFor(v) || v.title}
                          >
                            {nameFor(v) || v.title}
                          </span>
                          {!v.alreadyImported && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openEditor(v.youtubeVideoId);
                              }}
                              aria-label={t('migrate.editThis')}
                              className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      {/* Says the post will not read as the source named it,
                          without making the creator open the editor to check. */}
                      {!editing.has(v.youtubeVideoId) && hasOverride(v.youtubeVideoId) && (
                        <span className="text-[11px] text-zinc-500">{t('migrate.edited')}</span>
                      )}
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
              {t(selected.size === 1 ? 'migrate.getPriceOne' : 'migrate.getPriceMany', { n: selected.size })}
            </Button>
          </section>
        )}

        {stage === 'listing' && videos.length === 0 && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
            <AppState icon="videos" title={t('migrate.noUploadsTitle')} description={t('migrate.noUploadsBody')} size="section" />
          </section>
        )}

        {quote && (stage === 'quoting' || stage === 'paying') && (
          <section data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3 items-start">
            <p className="text-sm text-zinc-400">
              {t(quote.videoCount === 1 ? 'migrate.videoCountOne' : 'migrate.videoCountMany', { n: quote.videoCount })}
              {quote.creditAppliedDhb > 0 && (
                <> — <DhbAmount value={quote.creditAppliedDhb} /> {t('migrate.creditApplied')}</>
              )}
            </p>
            <p className="text-lg font-semibold text-white">
              {quote.amountDhb === 0 ? (
                t('migrate.freeCovered')
              ) : (
                <DhbAmount value={quote.amountDhb} className="gap-1.5" />
              )}
            </p>
            <Button variant="glass" onClick={() => handlePay(quote)} disabled={stage === 'paying'}>
              {stage === 'paying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quote.amountDhb === 0 ? (
                t('migrate.startMigration')
              ) : (
                <>{t('migrate.pay')}&nbsp;<DhbAmount value={quote.amountDhb} /></>
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
                <h2 className="text-sm font-semibold text-white">{t('migrate.progressTitle')}</h2>
                <p className="text-sm text-zinc-400">
                  {stage === 'processing'
                    ? t('migrate.progressRunning')
                    : charge
                      ? failed
                        ? t('migrate.progressDoneWithFailures', { imported, failed })
                        : t('migrate.progressDone', { imported })
                      : t('migrate.progressIdle')}
                </p>
              </div>
              {stage === 'done' && failed > 0 && (
                <Button variant="outline" size="sm" onClick={handleRetryFailed} className="shrink-0">
                  {t('migrate.retryFailed', { n: failed })}
                </Button>
              )}
            </div>

            {charge ? (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {charge.results.map(r => {
                  const key = r.youtubeVideoId;
                  // A key is a bare YouTube id unless the source prefixed it
                  // (see `importedItemKey`), so the two YouTube-shaped
                  // fallbacks below are only reachable for a batch that really
                  // is YouTube — which is every batch quoted before the
                  // migration took more than one source.
                  const bareYoutubeId = !key.includes(':');
                  const href =
                    urlByKey.get(key) ||
                    (bareYoutubeId ? `https://www.youtube.com/watch?v=${key}` : undefined);
                  const thumb =
                    thumbById.get(key) ||
                    (bareYoutubeId ? `https://i.ytimg.com/vi/${key}/mqdefault.jpg` : undefined);
                  // The creator's own title wins over the source's, so the
                  // grid reads as what they paid to publish.
                  const label = nameByKey.get(key) || titleById.get(key) || key;
                  const Tile = href ? 'a' : 'div';
                  return (
                    <Tile
                      key={key}
                      {...(href ? { href, target: '_blank', rel: 'noreferrer' } : {})}
                      data-page-bento
                      className={cn(
                        'group flex flex-col bg-zinc-900 rounded-2xl overflow-hidden transition-all',
                        href && 'hover:ring-2 hover:ring-white/30',
                      )}
                    >
                      <div className="relative aspect-video bg-zinc-800 overflow-hidden flex items-center justify-center">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <ImageIcon className="h-7 w-7 text-zinc-700" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex flex-col gap-1 p-3">
                        <span className="line-clamp-2 text-sm font-medium text-white leading-snug">
                          {label}
                        </span>
                        {r.failedReason && (
                          <span className="text-xs text-zinc-400 line-clamp-2">{r.failedReason}</span>
                        )}
                      </div>
                    </Tile>
                  );
                })}
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
                    key={sample.key}
                    data-page-bento
                    className="flex flex-col bg-zinc-900 rounded-2xl overflow-hidden"
                  >
                    <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
                      <ImageIcon className="h-7 w-7 text-zinc-700" />
                      <StatusBadge status={sample.status} />
                    </div>
                    <div className="flex flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-medium text-white leading-snug">{t(sample.key)}</span>
                      {sample.reasonKey && <span className="text-xs text-zinc-400 line-clamp-2">{t(sample.reasonKey)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {stage === 'done' && (
          <Button variant="outline" className="self-start" onClick={() => navigate('/')}>
            {t('migrate.viewFeed')}
          </Button>
        )}

        {/* ── Explainers ──────────────────────────────────────────────────
            Below the working part of the page on purpose: this answers
            "what will this cost me and what happens next", which is a
            question people ask before paying and never again after. */}
        <section className="grid gap-2 sm:gap-3 sm:grid-cols-2">
          <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">{t('migrate.howTitle')}</h2>
            <ol className="flex flex-col gap-2.5 text-sm text-zinc-400">
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">1.</span>
                <span>{t('migrate.how1')}</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">2.</span>
                <span>{t('migrate.how2')}</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-zinc-600 tabular-nums">3.</span>
                <span>{t('migrate.how3')}</span>
              </li>
            </ol>
            <p className="text-xs text-zinc-500">
              {t('migrate.howNote')}
            </p>
          </div>

          <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">{t('migrate.costsTitle')}</h2>
            {pricing ? (
              <>
                <p className="text-sm text-zinc-400">
                  {t('migrate.costsIntro')}
                </p>
                <ul className="flex flex-col divide-y divide-white/5 text-sm">
                  {/* The allowance comes off the top of the count once, ever,
                      and the curve prices whatever is left — so it is its own
                      row rather than a point on the curve. */}
                  {pricing.freeAllowance > 0 && (
                    <li className="flex items-center justify-between gap-3 py-2">
                      <span className="text-zinc-400 tabular-nums">
                        {t('migrate.firstFree', { n: pricing.freeAllowance })}
                      </span>
                      <span className="text-white">{t('migrate.freeOnce')}</span>
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
                            {t('migrate.videosCount', { videos: videos.toLocaleString() })}
                          </span>
                          {saving > 0 && (
                            <span className="text-[11px] text-zinc-500 tabular-nums">−{saving}%</span>
                          )}
                        </span>
                        <span className="text-white tabular-nums">
                          {tier.priceUsd === 0 ? t('migrate.free') : <DhbAmount value={tier.priceDhb} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                {t('migrate.costsIntroShort')}
              </p>
            )}
            <p className="text-xs text-zinc-500">
              {t('migrate.costsNote')}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
