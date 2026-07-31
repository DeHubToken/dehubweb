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
  generateAudio,
  generateImage,
  generateVideo,
  isAborted,
  pollVideo,
  type AudioRequest,
  type ImageRequest,
  type RenderTicket,
  type VideoRequest,
} from '@/lib/creator/generationEngine';

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type JobKind = 'image' | 'video' | 'audio';

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
   * Set once the provider accepts a video render. Persisted so a reload can
   * rejoin a render in progress instead of abandoning one already paid for.
   */
  ticket?: RenderTicket;
}

/** Persisted shape. Object URLs cannot survive a reload, so audio is skipped. */
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
  | 'createdAt'
  | 'finishedAt'
  | 'status'
  | 'ticket'
>;

const STORAGE_KEY = 'dehub-creator-library-v1';
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

function trimJobs(jobs: GenerationJob[]): GenerationJob[] {
  if (jobs.length <= MAX_IN_MEMORY) return jobs;
  const kept: GenerationJob[] = [];
  const overflow: GenerationJob[] = [];
  for (const job of jobs) {
    if (job.status === 'running' || kept.length < MAX_IN_MEMORY) kept.push(job);
    else overflow.push(job);
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

function loadPersisted(): GenerationJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as PersistedJob[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && (isPersistableUrl(r.url) || (r.ticket && r.status !== 'done')))
      .map((r) =>
        r.ticket && r.status !== 'done'
          ? // Anything with a live ticket comes back as running so it gets
            // rejoined rather than presented as a dead failure.
            { ...r, status: 'running' as const, stage: 'Reconnecting' }
          : { ...r, status: 'done' as const, stage: '' },
      );
  } catch {
    return [];
  }
}

function toPersisted(j: GenerationJob): PersistedJob {
  const { id, kind, prompt, resolvedPrompt, model, modelName, presetId, aspect, url, createdAt, finishedAt, status, ticket } = j;
  return { id, kind, prompt, resolvedPrompt, model, modelName, presetId, aspect, url, createdAt, finishedAt, status, ticket };
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
  return (j.status === 'running' || j.status === 'failed') && j.kind === 'video' && !!j.ticket;
}

function isStorableResult(j: GenerationJob): boolean {
  return j.status === 'done' && j.kind !== 'audio' && isPersistableUrl(j.url);
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
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

  /**
   * Rejoin any render that was still in flight when the page was last closed.
   * Call once on mount; jobs that already have a live poller are skipped.
   */
  resumeInterrupted: () => void;

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
    set((s) => ({ jobs: trimJobs([job, ...s.jobs]) }));
    return id;
  }

  function patch(id: string, next: Partial<GenerationJob>) {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...next } : j)) }));
  }

  function settle(id: string, next: Partial<GenerationJob>) {
    controllers.delete(id);
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
            // is recoverable even if the tab closes mid-render.
            patch(id, { ticket });
            persist(get().jobs);
          },
        }),
      );
      return id;
    },

    resumeInterrupted: () => {
      for (const job of get().jobs) {
        if (job.status !== 'running' || !job.ticket || controllers.has(job.id)) continue;
        const ctrl = new AbortController();
        controllers.set(job.id, ctrl);
        finish(
          job.id,
          pollVideo(job.ticket, {
            signal: ctrl.signal,
            onStage: (stage) => patch(job.id, { stage }),
          }),
        );
      }
    },

    retry: (id) => {
      const job = get().jobs.find((j) => j.id === id);
      if (!job?.ticket || controllers.has(id)) return;
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      patch(id, { status: 'running', stage: 'Reconnecting', error: undefined });
      finish(
        id,
        pollVideo(job.ticket, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
        }),
      );
    },

    startAudio: (req, meta) => {
      const id = open('audio', 'elevenlabs', meta);
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      finish(
        id,
        generateAudio(req, {
          signal: ctrl.signal,
          onStage: (stage) => patch(id, { stage }),
        }).then((r) => URL.createObjectURL(r.blob)),
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
