/**
 * Results feed and viewer.
 * ========================
 * Every job the creator has started, newest first, running ones included so a
 * render in progress is visible rather than a spinner on a button. Opening a
 * result gives the actions that keep the work moving: animate a still, send it
 * to the timeline, run it again.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  Clapperboard,
  Download,
  Film,
  ImageIcon,
  Loader2,
  Music2,
  RefreshCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { sendJobToEditor } from '@/lib/creator/sendToEditor';
import { useCloseOnSurfaceSwitch } from '@/hooks/use-surface-switch';

/** CSS aspect-ratio for a "w:h" string, falling back to 1:1. */
function aspectStyle(aspect: string): React.CSSProperties {
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return { aspectRatio: '1 / 1' };
  return { aspectRatio: `${w} / ${h}` };
}

const KIND_ICON = {
  image: ImageIcon,
  video: Film,
  audio: Music2,
  model3d: Box,
} as const;

/**
 * three.js is ~600 kB and only the 3D surfaces need it, so the viewer is split
 * into its own chunk and fetched the first time a mesh result is opened.
 */
const Model3dViewer = lazy(() =>
  import('./Model3dViewer').then((m) => ({ default: m.Model3dViewer })),
);

/** File extension for a finished job, used for downloads. */
function extensionFor(job: GenerationJob): string {
  switch (job.kind) {
    case 'video':
      return 'mp4';
    case 'audio':
      return 'mp3';
    case 'model3d':
      // The format the creator actually asked for wins. fal's URLs do not
      // reliably carry an extension, so sniffing one mislabels an FBX as .glb.
      return (
        job.exportFormat ??
        job.url?.match(/\.(glb|gltf|usdz|fbx|obj|stl)(?:\?|$)/i)?.[1]?.toLowerCase() ??
        'glb'
      );
    default:
      return 'png';
  }
}

/** Only GLB/glTF render in the browser; the rest are download-only. */
function isViewableMesh(job: GenerationJob): boolean {
  if (!job.url) return false;
  // Prefer the requested format over the URL: fal serves meshes with a query
  // string and often no extension, so sniffing alone would mount the GLB viewer
  // on an STL and show a parse error instead of the download panel.
  const ext = extensionFor(job);
  return ext === 'glb' || ext === 'gltf';
}

interface ResultsFeedProps {
  /** Signed-in wallet, needed so sent assets sync to cloud storage. */
  wallet: string | null;
  /** Called when the creator wants to animate a still. */
  onAnimate: (job: GenerationJob) => void;
  /** Called when the creator wants to turn a still into a mesh. */
  onModel3d: (job: GenerationJob) => void;
  /** Switches to the editor after a successful send. */
  onOpenEditor: () => void;
}

export function ResultsFeed({ wallet, onAnimate, onModel3d, onOpenEditor }: ResultsFeedProps) {
  const jobs = useGenerationStore((s) => s.jobs);
  const focusedId = useGenerationStore((s) => s.focusedId);
  const focus = useGenerationStore((s) => s.focus);
  const clearFinished = useGenerationStore((s) => s.clearFinished);

  const focused = jobs.find((j) => j.id === focusedId) ?? null;
  const finishedCount = jobs.filter((j) => j.status !== 'running').length;
  const runningCount = jobs.length - finishedCount;

  /**
   * Stable identity matters here. The viewer's focus-and-scroll-lock effect is
   * keyed on this callback, and a running job re-renders this component on
   * every poll tick — an inline arrow would give the effect a new dependency
   * each time, re-running it and yanking focus back to the Close button while
   * someone was orbiting a mesh or tabbing to Download.
   */
  const closeViewer = useCallback(() => focus(null), [focus]);

  // The viewer is plain markup inside the host's hidden wrapper, so switching
  // to /editor makes it invisible without unmounting it. Close it explicitly or
  // its body scroll lock stays applied to the editor.
  useCloseOnSurfaceSwitch(closeViewer);

  return (
    <section className="w-full">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Your generations
        </h2>
        {finishedCount > 0 && (
          <button
            type="button"
            aria-label={`Remove all ${finishedCount} finished generations from the library`}
            onClick={() => {
              // Destructive and not undoable: it rewrites the stored library.
              const ok = window.confirm(
                `Remove ${finishedCount} finished generation${finishedCount === 1 ? '' : 's'} from your library? Anything not sent to the editor or downloaded is lost.`,
              );
              if (ok) clearFinished();
            }}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            Clear library
          </button>
        )}
      </div>

      {/* Jobs settle in the store with no toast, so without this a screen
          reader never learns a render finished. */}
      <p aria-live="polite" className="sr-only">
        {runningCount > 0
          ? `${runningCount} generation${runningCount === 1 ? '' : 's'} running.`
          : finishedCount > 0
            ? `All generations finished. ${finishedCount} result${finishedCount === 1 ? '' : 's'} ready.`
            : ''}
      </p>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 px-6 py-10 text-center">
          <Clapperboard className="mx-auto h-6 w-6 text-white/25" />
          <p className="mt-3 text-sm font-medium text-white/70">Nothing generated yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-white/40">
            Pick a preset, type a subject, and hit Generate. Results collect here and stay one click
            from the timeline.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {jobs.map((job) => (
            <li key={job.id}>
              <ResultCard job={job} onOpen={() => focus(job.id)} />
            </li>
          ))}
        </ul>
      )}

      {focused && (
        <ResultViewer
          job={focused}
          wallet={wallet}
          onClose={closeViewer}
          onAnimate={onAnimate}
          onModel3d={onModel3d}
          onOpenEditor={onOpenEditor}
        />
      )}
    </section>
  );
}

function ResultCard({ job, onOpen }: { job: GenerationJob; onOpen: () => void }) {
  const cancel = useGenerationStore((s) => s.cancel);
  const Icon = KIND_ICON[job.kind];

  if (job.status === 'running') {
    return (
      <div
        style={aspectStyle(job.aspect)}
        className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center"
      >
        {/* Skeleton shimmer marks the slot the result will fill. */}
        <div className="absolute inset-0 animate-pulse bg-white/[0.03]" aria-hidden />
        <Loader2 className="relative h-5 w-5 animate-spin text-white/60" />
        <p className="relative text-[11px] font-medium text-white/70">{job.stage || 'Working'}</p>
        <p className="relative line-clamp-2 px-1 text-[10px] leading-snug text-white/55">{job.prompt}</p>
        {/* Cancelling stops us waiting; it cannot stop the render or refund the
            DHB already spent, so say so before throwing the result away. */}
        <button
          type="button"
          onClick={() => {
            // Video and 3D both queue upstream and are already paid for, so
            // walking away throws away a result that will still be produced.
            const ok =
              (job.kind !== 'video' && job.kind !== 'model3d') ||
              window.confirm(
                'Stop waiting for this render? It has already been paid for and will keep rendering, but the result will not come back to you.',
              );
            if (ok) cancel(job.id);
          }}
          className="relative mt-0.5 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Stop waiting
        </button>
      </div>
    );
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    return (
      <button
        type="button"
        onClick={onOpen}
        style={aspectStyle(job.aspect)}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.02] p-3 text-center transition hover:border-white/25 hover:bg-white/[0.05]"
      >
        <AlertCircle className="h-4 w-4 text-white/45" />
        <span className="text-[11px] font-medium text-white/65">
          {job.status === 'cancelled' ? 'Cancelled' : 'Failed'}
        </span>
        <span className="line-clamp-2 text-[10px] leading-snug text-white/55">
          {job.error || 'Something went wrong'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      style={aspectStyle(job.aspect)}
      className="group relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-white/30"
    >
      {job.kind === 'image' && job.url && (
        <img
          src={job.url}
          alt={job.prompt || 'Generated image'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      {job.kind === 'video' && job.url && (
        <video
          src={job.url}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
          className="h-full w-full object-cover"
        />
      )}
      {job.kind === 'audio' && (
        <span className="flex h-full w-full items-center justify-center">
          <Music2 className="h-6 w-6 text-white/40" />
        </span>
      )}
      {/* Meshes use the provider's rendered still when there is one. Booting a
          WebGL context per grid tile would exhaust the browser's context budget
          long before the grid filled, so the live viewer is opening-only. */}
      {job.kind === 'model3d' &&
        (job.posterUrl ? (
          <img
            src={job.posterUrl}
            alt={job.prompt || 'Generated 3D model'}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-white/[0.07] to-transparent">
            <Box className="h-6 w-6 text-white/40" />
            <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">
              View in 3D
            </span>
          </span>
        ))}

      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6 text-left">
        {/* A mesh made from a photo alone has no prompt, so name it by what it
            is rather than leaving the caption blank. */}
        <span className="line-clamp-1 text-[10px] font-medium text-white/85">
          {job.prompt || (job.kind === 'model3d' ? 'From a reference image' : '')}
        </span>
      </span>
      <span
        data-keep-dark
        className="pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 backdrop-blur"
      >
        <Icon className="h-3 w-3 text-white" />
      </span>
    </button>
  );
}

interface ResultViewerProps {
  job: GenerationJob;
  wallet: string | null;
  onClose: () => void;
  onAnimate: (job: GenerationJob) => void;
  onModel3d: (job: GenerationJob) => void;
  onOpenEditor: () => void;
}

function ResultViewer({
  job,
  wallet,
  onClose,
  onAnimate,
  onModel3d,
  onOpenEditor,
}: ResultViewerProps) {
  const remove = useGenerationStore((s) => s.remove);
  const retry = useGenerationStore((s) => s.retry);
  const [sending, setSending] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Keep Tab inside the viewer. It is a hand-rolled overlay rather than a
      // Radix dialog, so nothing traps focus for us.
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], summary, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [onClose]);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const id = await sendJobToEditor(job, { wallet });
      if (id) {
        toast.success('Added to the timeline.');
        onClose();
        onOpenEditor();
      }
    } finally {
      setSending(false);
    }
  }, [job, wallet, onClose, onOpenEditor]);

  /**
   * The `download` attribute is ignored for cross-origin URLs, and every video
   * result and some image results are served from a provider origin, so a plain
   * anchor just navigated away instead of saving. Fetch to a blob first so the
   * link is same-origin and the filename sticks.
   */
  const handleDownload = useCallback(async () => {
    if (!job.url) return;
    const filename = `dehub-${job.kind}-${job.id}.${extensionFor(job)}`;
    let href = job.url;
    let objectUrl: string | null = null;
    try {
      const res = await fetch(job.url);
      if (res.ok) {
        objectUrl = URL.createObjectURL(await res.blob());
        href = objectUrl;
      }
    } catch {
      // Blocked by CORS: fall back to opening the asset directly.
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    if (!objectUrl) a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 30_000);
  }, [job]);

  const failed = job.status === 'failed' || job.status === 'cancelled';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Generation result"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-[0_8px_32px_rgba(0,0,0,0.6)] lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[14rem] flex-1 items-center justify-center bg-black/60 p-3">
          {failed ? (
            <div className="px-6 py-10 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-white/40" />
              <p className="mt-3 text-sm font-medium text-white/80">
                {job.status === 'cancelled' ? 'You cancelled this run' : 'This run failed'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-white/45">
                {job.error || 'No further detail was returned.'}
              </p>
            </div>
          ) : job.kind === 'video' ? (
            <video
              src={job.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[70dvh] w-auto max-w-full rounded-xl"
            />
          ) : job.kind === 'audio' ? (
            <div className="w-full max-w-md px-4 py-10 text-center">
              <Music2 className="mx-auto h-7 w-7 text-white/40" />
              <audio src={job.url} controls className="mt-4 w-full" />
            </div>
          ) : job.kind === 'model3d' ? (
            job.url && isViewableMesh(job) ? (
              <div className="h-[60dvh] max-h-[70dvh] w-full overflow-hidden rounded-xl bg-black/40 lg:h-[70dvh]">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                    </div>
                  }
                >
                  <Model3dViewer url={job.url} />
                </Suspense>
              </div>
            ) : (
              // An FBX/OBJ/USDZ export cannot be previewed here. Say so rather
              // than showing an empty canvas that reads as a failed generation.
              <div className="px-6 py-10 text-center">
                <Box className="mx-auto h-7 w-7 text-white/40" />
                <p className="mt-3 text-sm font-medium text-white/80">
                  Ready to download
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-white/45">
                  This format does not preview in the browser. Download it and open it in your 3D
                  tool — or generate as GLB next time to preview it here.
                </p>
              </div>
            )
          ) : (
            <img
              src={job.url}
              alt={job.prompt || 'Generated image'}
              className="max-h-[70dvh] w-auto max-w-full rounded-xl object-contain"
            />
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-2 px-4 pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {job.modelName}
              </p>
              <p className="mt-0.5 text-[11px] text-white/55">
                {job.kind === 'model3d' ? '3D model' : `${job.aspect} generation`}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-[13px] leading-relaxed text-white/75">
              {job.prompt || (job.kind === 'model3d' ? 'Reconstructed from a reference image.' : '')}
            </p>
            {/* Guarded on content, not just difference: an image-only mesh run
                has no prompt at all, and an empty expander is noise. */}
            {!!job.resolvedPrompt && job.resolvedPrompt !== job.prompt && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-medium text-white/45 transition hover:text-white/75">
                  Full prompt sent
                </summary>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">{job.resolvedPrompt}</p>
              </details>
            )}
          </div>

          <div className="grid gap-1.5 border-t border-white/10 p-3">
            {!failed && (
              <>
                {/* The timeline holds video, images and audio. A mesh is not a
                    clip, so offering this for 3D would only ever fail. */}
                {job.kind !== 'model3d' && (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[13px] font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Scissors className="h-4 w-4" />
                    )}
                    {sending ? 'Sending' : 'Edit in timeline'}
                  </button>
                )}

                {job.kind === 'image' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onAnimate(job);
                        onClose();
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
                    >
                      <Film className="h-4 w-4" />
                      Animate this
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onModel3d(job);
                        onClose();
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
                    >
                      <Box className="h-4 w-4" />
                      Make it 3D
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  {job.kind === 'model3d' ? `Download .${extensionFor(job).toUpperCase()}` : 'Download'}
                </button>
              </>
            )}

            {failed && (
              <>
                {/* The render itself was paid for and usually finished; only the
                    polling gave up. Reconnecting is free, so offer it first. */}
                {job.ticket && (
                  <button
                    type="button"
                    onClick={() => {
                      retry(job.id);
                      onClose();
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reconnect to this render
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onAnimate(job);
                    onClose();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-[13px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
                >
                  Load into composer
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                remove(job.id);
                onClose();
              }}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium text-white/45 transition hover:bg-white/10 hover:text-white',
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove from library
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
