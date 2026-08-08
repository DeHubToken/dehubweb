/**
 * Generation queue.
 * =================
 * Every generation started anywhere in DeHub lands here: the /creator studio,
 * the /editor Generate panel, a preset tile. Jobs run in parallel and the
 * results form one library that both surfaces read, so a clip generated in the
 * studio is one click from the timeline.
 *
 * /creator and /editor are co-mounted by CreatorEditorHost, so this store is
 * genuinely shared live state rather than a handoff through storage.
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  audioTaskOf,
  generate3d,
  generateImage,
  generateVideo,
  isAborted,
  poll3d,
  pollDub,
  pollVideo,
  runAudioTask,
  type AudioRequest,
  type ImageRequest,
  type Model3dRequest,
  type RenderTicket,
  type VideoRequest,
} from '@/lib/creator/generationEngine';

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type JobKind = 'image' | 'video' | 'audio' | 'model3d';

/**
 * Kinds that queue upstream and hand back a resumable ticket.
 *
 * Audio is in the list for dubbing alone — the only audio task that takes
 * minutes and is charged for up front. Everything else audio does returns
 * inline and never sets a ticket, and `isResumable` requires one, so the rest
 * are unaffected by being listed here.
 */
const TICKETED_KINDS: readonly JobKind[] = ['video', 'model3d', 'audio'];

export interface GenerationJob {
  id: string;
  kind: JobKind;
  /** The prompt as the creator typed it, for display and for re-running. */
  prompt: string;
  /** The prompt actually sent, after any preset scaffold was applied. */
  resolvedPrompt: string;
  model: string;
  modelName: string;
  presetId?: string;
  aspect: string;
  status: JobStatus;
  /** Current stage text while running. */
  stage: string;
  /** Finished asset URL. */
  url?: string;
  /** Poster frame for video results, when one is available. */
  posterUrl?: string;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  /** Source image for edits and image-to-video, kept so the job can be re-run. */
  sourceImage?: string;
  /**
   * Export format requested for a 3D job. Kept because the provider's URL does
   * not always carry an extension, and guessing it from the URL mislabels an
   * FBX download as .glb and tries to preview it in a GLB viewer.
   */
  exportFormat?: string;
  /**
   * Set once the provider accepts a video render. Persisted so a reload can
   * rejoin a render in progress instead of abandoning one already paid for.
   */
  ticket?: RenderTicket;
  /**
   * Transcription result. The only job kind whose output is words rather than
   * a file, so it has no `url` and the card renders this instead.
   */
  transcript?: string;
  /** Speaker-labelled turns, when diarisation found more than one voice. */
  segments?: { speaker: string | null; text: string; start: number | null }[];
}

/**
 * Persisted shape.
 *
 * Object URLs cannot survive a reload, so audio RESULTS are skipped — with one
 * exception. A transcript is text: it survives perfectly well, it is the one
 * audio output somebody comes back for, and losing it on refresh was the whole
 * reason to carry it separately from `url`.
 */
type PersistedJob = Pick<
  GenerationJob,
  | 'id'
  | 'kind'
  | 'prompt'
  | 'resolvedPrompt'
  | 'model'
  | 'modelName'
  | 'presetId'
  | 'aspect'
  | 'url'
  | 'posterUrl'
  | 'exportFormat'
  | 'createdAt'
  | 'finishedAt'
  | 'status'
  | 'ticket'
  | 'transcript'
  | 'segments'
>;

/**
 * The library is stored per identity.
 *
 * A single shared key meant prompts, results and in-flight tickets outlived a
 * disconnect and were visible to whoever connected next on the same machine.
 * Scoping by wallet also means switching accounts shows that account's work
 * rather than the previous one's, without having to hook every one of
 * AuthProvider's several sign-out paths.
 */
const STORAGE_PREFIX = 'dehub-creator-library-v1';

function scopeKey(wallet: string | null | undefined): string {
  return wallet ? `${STORAGE_PREFIX}:${wallet.toLowerCase()}` : `${STORAGE_PREFIX}:anon`;
}

/** Active storage key. Starts anonymous; setScope moves it once auth resolves. */
let storageKey = scopeKey(null);

const MAX_PERSISTED = 60;
/**
 * localStorage is only a few megabytes per origin, and the Gemini image models
 * return their result as a base64 `data:` URI that is routinely 1-3 MB. A cap
 * tight enough to fit many of them would reject nearly every real image, so the
 * cap is generous per item and `persist` sheds whole rows when the total will
 * not fit (see the attempts ladder there).
 */
const MAX_PERSISTED_DATA_URL_CHARS = 3_000_000;

/** A result worth writing to storage: a durable link, or a small enough inline image. */
function isPersistableUrl(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('http')) return true;
  if (url.startsWith('data:')) return url.length <= MAX_PERSISTED_DATA_URL_CHARS;
  return false;
}

/**
 * In-memory ceiling. Each finished image job can hold a multi-megabyte base64
 * result plus its source image, so an unbounded list is a slow memory leak over
 * a long session. Running jobs are never dropped.
 */
const MAX_IN_MEMORY = 100;

function trimJobs(jobs: GenerationJob[], protectedId?: string | null): GenerationJob[] {
  if (jobs.length <= MAX_IN_MEMORY) return jobs;
  const kept: GenerationJob[] = [];
  const overflow: GenerationJob[] = [];
  for (const job of jobs) {
    // Never drop a render in flight, or the result the creator is looking at:
    // for audio that would revoke the object URL out from under the player.
    if (job.status === 'running' || job.id === protectedId || kept.length < MAX_IN_MEMORY) {
      kept.push(job);
    } else {
      overflow.push(job);
    }
  }
  for (const job of overflow) {
    if (job.kind === 'audio' && job.url?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(job.url);
      } catch {
        /* already revoked */
      }
    }
  }
  return kept;
}

/** Abort controllers live outside state; they are not serialisable. */
const controllers = new Map<string, AbortController>();

/**
 * Cross-tab claim on a render.
 *
 * Every tab loads the same persisted library and would otherwise resume every
 * ticket in it, so three open tabs meant three pollers hammering one
 * predictionId against a per-IP status budget they all share. A tab claims a
 * render before polling it and refreshes that claim on every poll; if the
 * owning tab is closed the claim goes stale and another tab takes over.
 */
const CLAIM_PREFIX = 'dehub-render-claim:';
const CLAIM_STALE_MS = 45_000;
const tabId = nanoid(8);

function claimRender(predictionId: string): boolean {
  if (typeof window === 'undefined') return true;
  const key = CLAIM_PREFIX + predictionId;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const held = JSON.parse(raw) as { tabId?: string; at?: number };
      const fresh = typeof held.at === 'number' && Date.now() - held.at < CLAIM_STALE_MS;
      if (fresh && held.tabId !== tabId) return false;
    }
    window.localStorage.setItem(key, JSON.stringify({ tabId, at: Date.now() }));
    return true;
  } catch {
    // Storage unavailable: fall back to polling. A duplicate poller is far
    // better than nobody collecting a render that has been paid for.
    return true;
  }
}

function refreshClaim(predictionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CLAIM_PREFIX + predictionId,
      JSON.stringify({ tabId, at: Date.now() }),
    );
  } catch {
    /* storage unavailable */
  }
}

function releaseClaim(predictionId: string | undefined) {
  if (!predictionId || typeof window === 'undefined') return;
  try {
    const key = CLAIM_PREFIX + predictionId;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const held = JSON.parse(raw) as { tabId?: string };
    if (held.tabId === tabId) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

function loadPersisted(): GenerationJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const rows = JSON.parse(raw) as PersistedJob[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r) => r && (isPersistableUrl(r.url) || !!r.transcript || (r.ticket && r.status !== 'done')),
      )
      .map((r) => {
        if (!r.ticket || r.status === 'done') return { ...r, status: 'done' as const, stage: '' };
        // Someone who pressed "Stop waiting" asked us to stop, so a cancelled
        // render comes back cancelled — with its ticket, so the viewer offers
        // Reconnect — rather than quietly resuming against their decision.
        if (r.status === 'cancelled') return { ...r, status: 'cancelled' as const, stage: '' };
        // Anything else with a live ticket comes back as running so it gets
        // rejoined rather than presented as a dead failure.
        return { ...r, status: 'running' as const, stage: 'Reconnecting' };
      });
  } catch {
    return [];
  }
}

function toPersisted(j: GenerationJob): PersistedJob {
  const { id, kind, prompt, resolvedPrompt, model, modelName, presetId, aspect, url, posterUrl, exportFormat, createdAt, finishedAt, status, ticket, transcript, segments } = j;
  // A blob: URL is dead the moment the tab reloads, and writing one back means
  // a card that renders a player pointed at nothing. Transcripts have no such
  // problem, which is why the row is kept and only the URL is dropped.
  const durableUrl = url?.startsWith('blob:') ? undefined : url;
  return { id, kind, prompt, resolvedPrompt, model, modelName, presetId, aspect, url: durableUrl, posterUrl, exportFormat, createdAt, finishedAt, status, ticket, transcript, segments };
}

/**
 * A render still in flight, reduced to just what resuming needs. These are tiny
 * and they represent money already spent, so they are written first and are
 * never what gets shed when storage is tight.
 */
function isResumable(j: GenerationJob): boolean {
  // Failed ones count too. Giving up on polling does not cancel the render, and
  // the ticket is the only handle on a result that is very likely sitting ready
  // at the provider. Dropping it would force the creator to pay a second time.
  // Cancelled counts too. "Stop waiting" only stops us listening — the render
  // continues at the provider and is already paid for, so dropping the ticket
  // on cancel would leave a finished, collectible result unreachable forever.
  return (
    (j.status === 'running' || j.status === 'failed' || j.status === 'cancelled') &&
    TICKETED_KINDS.includes(j.kind) &&
    !!j.ticket
  );
}

/** The poller that owns a job's ticket. Each kind queues on its own function. */
function pollerFor(kind: JobKind) {
  if (kind === 'model3d') return poll3d;
  if (kind === 'audio') return pollDub;
  return pollVideo;
}

function isStorableResult(j: GenerationJob): boolean {
  if (j.status !== 'done') return false;
  // Audio results are object URLs that die with the tab, so only a transcript
  // is worth keeping from an audio job.
  if (j.kind === 'audio') return !!j.transcript;
  return isPersistableUrl(j.url);
}

function persist(jobs: GenerationJob[]) {
  if (typeof window === 'undefined') return;

  const resumable = jobs.filter(isResumable).map(toPersisted);
  const results = jobs.filter(isStorableResult).map(toPersisted);

  // Progressively shed results until it fits. The in-flight tickets are always
  // in the payload: dropping one abandons a render the creator has paid for.
  const attempts: PersistedJob[][] = [
    [...resumable, ...results.slice(0, MAX_PERSISTED)],
    // Inline data URLs are what usually blows the quota, so try links only.
    [...resumable, ...results.filter((r) => r.url?.startsWith('http')).slice(0, MAX_PERSISTED)],
    [...resumable, ...results.filter((r) => r.url?.startsWith('http')).slice(0, 10)],
    resumable,
  ];

  for (const rows of attempts) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(rows));
      return;
    } catch {
      /* too big or storage unavailable; try a smaller payload */
    }
  }
  // Private mode or storage disabled entirely. The in-memory library still works.
}

/** Shared fields every start* call needs for display. */
interface JobMeta {
  prompt: string;
  resolvedPrompt: string;
  modelName: string;
  presetId?: string;
  aspect: string;
}

interface GenerationState {
  jobs: GenerationJob[];
  /** Currently open in the result viewer, or null. */
  focusedId: string | null;

  startImage: (req: ImageRequest, meta: JobMeta) => string;
  startVideo: (req: VideoRequest, meta: JobMeta) => string;
  startAudio: (req: AudioRequest, meta: JobMeta) => string;
  startModel3d: (req: Model3dRequest, meta: JobMeta) => string;

  /**
   * Rejoin any render that was still in flight when the page was last closed.
   * Call once on mount; jobs that already have a live poller are skipped.
   */
  resumeInterrupted: () => void;

  /**
   * Point the library at a wallet's own storage. Call whenever the signed-in
   * wallet changes, including to null on disconnect.
   */
  setScope: (wallet: string | null) => void;

  /**
   * Reconnect to a render whose polling gave up. Free: the render was already
   * paid for and is very likely finished at the provider, so this must never
   * route back through the paywall.
   */
  retry: (id: string) => void;

  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  focus: (id: string | null) => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => {
  /** Insert a running job and return its id. */
  function open(kind: JobKind, model: string, meta: JobMeta, sourceImage?: string): string {
    const id = nanoid(10);
    const job: GenerationJob = {
      id,
      kind,
      prompt: meta.prompt,
      resolvedPrompt: meta.resolvedPrompt,
      model,
      modelName: meta.modelName,
      presetId: meta.presetId,
      aspect: meta.aspect,
      status: 'running',
      stage: 'Starting',
      createdAt: Date.now(),
      sourceImage,
    };
    set((s) => ({ jobs: trimJobs([job, ...s.jobs], s.focusedId) }));
    return id;
  }

  function patch(id: string, next: Partial<GenerationJob>) {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...next } : j)) }));
  }

  function settle(id: string, next: Partial<GenerationJob>) {
    controllers.delete(id);
    // Hand the render back so another tab can pick it up if this one only
    // stopped waiting. A finished render's claim is dead weight either way.
    releaseClaim(get().jobs.find((j) => j.id === id)?.ticket?.predictionId);
    patch(id, { ...next, finishedAt: Date.now(), stage: '' });
    persist(get().jobs);
  }

  /** Shared completion handling so the three start* calls stay thin. */
  function finish(id: string, run: Promise<string>) {
    run
      .then((url) => settle(id, { status: 'done', url }))
      .catch((e: unknown) => {
        if (isAborted(e)) {
          settle(id, { status: 'cancelled', error: 'Cancelled' });
          return;
        }
        const message = e instanceof Error ? e.message : 'Generation failed';
        console.error('[creator] generation failed', e);
        settle(id, { status: 'failed', error: message });
      });
  }

  return {
    jobs: loadPersisted(),
    focusedId: null,

    startImage: (req, meta) => {
      const id = open('image', req.model, meta, req.sourceImage);
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      finish(
        id,
        generateImage(req, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
        }),
      );
      return id;
    },

    startVideo: (req, meta) => {
      const id = open('video', req.model, meta, req.sourceImage);
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      finish(
        id,
        generateVideo(req, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
          onQueued: (ticket) => {
            // Write the ticket to storage immediately. From here on the render
            // is recoverable even if the tab closes mid-render. Claim it too,
            // so another tab reading the same library does not start a second
            // poller against the same prediction.
            claimRender(ticket.predictionId);
            patch(id, { ticket });
            persist(get().jobs);
          },
        }),
      );
      return id;
    },

    startModel3d: (req, meta) => {
      const id = open('model3d', req.model, meta, req.sourceImage);
      if (req.exportFormat) patch(id, { exportFormat: req.exportFormat });
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      finish(
        id,
        generate3d(req, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
          onPreview: (posterUrl) => patch(id, { posterUrl }),
          onQueued: (ticket) => {
            // Same reasoning as video: a mesh takes minutes and has been paid
            // for, so the ticket is written before any polling starts.
            claimRender(ticket.predictionId);
            patch(id, { ticket });
            persist(get().jobs);
          },
        }),
      );
      return id;
    },

    setScope: (wallet) => {
      const next = scopeKey(wallet);
      if (next === storageKey) return;

      // Flush the outgoing identity's work under its own key first.
      persist(get().jobs);

      // Its pollers belong to it, not to whoever is signing in. Abort them and
      // drop the controllers; the aborted promises settle against job ids that
      // are no longer in state, so their patches are no-ops.
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();

      storageKey = next;
      for (const job of get().jobs) {
        if (job.kind === 'audio' && job.url?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(job.url);
          } catch {
            /* already revoked */
          }
        }
      }
      set({ jobs: loadPersisted(), focusedId: null });
      get().resumeInterrupted();
    },

    resumeInterrupted: () => {
      for (const job of get().jobs) {
        if (job.status !== 'running' || !job.ticket || controllers.has(job.id)) continue;
        // Another tab is already waiting on this render.
        if (!claimRender(job.ticket.predictionId)) {
          patch(job.id, { stage: 'Rendering in another tab' });
          continue;
        }
        const ctrl = new AbortController();
        controllers.set(job.id, ctrl);
        const ticket = job.ticket;
        finish(
          job.id,
          pollerFor(job.kind)(ticket, {
            signal: ctrl.signal,
            onPreview: (posterUrl) => patch(job.id, { posterUrl }),
            onStage: (stage) => {
              refreshClaim(ticket.predictionId);
              patch(job.id, { stage });
            },
          }),
        );
      }
    },

    retry: (id) => {
      const job = get().jobs.find((j) => j.id === id);
      if (!job?.ticket || controllers.has(id)) return;
      const ticket = job.ticket;
      claimRender(ticket.predictionId);
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      patch(id, { status: 'running', stage: 'Reconnecting', error: undefined });
      finish(
        id,
        pollerFor(job.kind)(ticket, {
          signal: ctrl.signal,
          onPreview: (posterUrl) => patch(id, { posterUrl }),
          onStage: (stage) => {
            refreshClaim(ticket.predictionId);
            patch(id, { stage });
          },
        }),
      );
    },

    startAudio: (req, meta) => {
      // The task id, not a provider name: the library shows nine different
      // audio tools and 'elevenlabs' on all of them said nothing about which
      // one made a given clip.
      const id = open('audio', audioTaskOf(req), meta);
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      finish(
        id,
        runAudioTask(req, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
          // Only dubbing ever fires this. Same reasoning as video and 3D: the
          // ticket is written before any polling, so a dub that has been paid
          // for survives the tab closing.
          onQueued: (ticket) => {
            claimRender(ticket.predictionId);
            patch(id, { ticket });
            persist(get().jobs);
          },
        }).then((result) => {
          if (result.transcript) {
            patch(id, { transcript: result.transcript, segments: result.segments });
          }
          // Transcription has no file to point at, and the card renders the
          // text instead. Everything else resolves to an object URL.
          return result.url ?? '';
        }),
      );
      return id;
    },

    cancel: (id) => {
      controllers.get(id)?.abort();
      controllers.delete(id);
    },

    remove: (id) => {
      controllers.get(id)?.abort();
      controllers.delete(id);
      const job = get().jobs.find((j) => j.id === id);
      if (job?.kind === 'audio' && job.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(job.url);
        } catch {
          /* already revoked */
        }
      }
      set((s) => ({
        jobs: s.jobs.filter((j) => j.id !== id),
        focusedId: s.focusedId === id ? null : s.focusedId,
      }));
      persist(get().jobs);
    },

    clearFinished: () => {
      for (const job of get().jobs) {
        if (job.status === 'running') continue;
        if (job.kind === 'audio' && job.url?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(job.url);
          } catch {
            /* already revoked */
          }
        }
      }
      set((s) => ({ jobs: s.jobs.filter((j) => j.status === 'running'), focusedId: null }));
      persist(get().jobs);
    },

    focus: (id) => set({ focusedId: id }),
  };
});

/** How many jobs are in flight, for the queue indicator. */
export function selectRunningCount(s: GenerationState): number {
  return s.jobs.filter((j) => j.status === 'running').length;
}
