/**
 * Upload a video the moment it is attached, while the caption is still being
 * written, and follow the server's transcode of it.
 *
 * By the time Post is pressed the bytes are usually on the server and often
 * already transcoded, so /user_mint only has to claim the draft (and take the
 * thumbnail) — and the post comes up playable instead of sitting on
 * "Processing" for minutes.
 *
 * Everything here fails quietly into the old flow. A server without drafts
 * (404/503), a dropped connection or an abort all end as `unavailable`, and
 * the post then uploads the file with the mint exactly as it always did.
 */

import { createDraftVideo, getDraftVideo, UploadHttpError } from '@/lib/api/dehub';
import { subscribeJobChannel } from '@/lib/api/dehub/job-socket';

export type DraftVideoPhase = 'uploading' | 'processing' | 'ready' | 'failed' | 'unavailable';

export interface DraftVideoSnapshot {
  phase: DraftVideoPhase;
  /** Bytes sent, 0–100. */
  uploadPercent: number;
  /** Server-side transcode, 0–100. */
  processPercent: number;
  draftId: string | null;
}

export interface DraftVideoUpload {
  readonly file: File;
  getSnapshot(): DraftVideoSnapshot;
  subscribe(listener: (snapshot: DraftVideoSnapshot) => void): () => void;
  /**
   * The draft id once the bytes are on the server, or null when this draft
   * cannot be used and the post has to carry the file itself.
   */
  readonly uploaded: Promise<string | null>;
  /** Stop uploading and following. Safe to call more than once. */
  abort(): void;
}

const POLL_MS = 3_000;

const clamp = (n: unknown) => {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export function startDraftVideo(
  file: File,
  postType: 'video' | 'short',
  options: { onRejected?: (message: string) => void } = {},
): DraftVideoUpload {
  const controller = new AbortController();
  const listeners = new Set<(snapshot: DraftVideoSnapshot) => void>();
  let snapshot: DraftVideoSnapshot = { phase: 'uploading', uploadPercent: 0, processPercent: 0, draftId: null };
  let stopFollowing: (() => void) | null = null;
  let finished = false;

  const update = (patch: Partial<DraftVideoSnapshot>) => {
    if (finished && patch.phase === undefined) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener(snapshot));
  };

  const settle = (phase: 'ready' | 'failed' | 'unavailable') => {
    if (finished) return;
    finished = true;
    stopFollowing?.();
    stopFollowing = null;
    update(phase === 'ready' ? { phase, processPercent: 100 } : { phase });
  };

  const follow = (draftId: string) => {
    const unsubscribe = subscribeJobChannel(`draft:${draftId}`, (event) => {
      if (event.stage === 'ready') settle('ready');
      else if (event.stage === 'failed') settle('failed');
      else if (event.progress !== undefined) {
        update({ processPercent: Math.max(snapshot.processPercent, clamp(event.progress)) });
      }
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      timer = null;
      try {
        const info = await getDraftVideo(draftId);
        if (finished) return;
        if (info.status === 'ready') return settle('ready');
        if (info.status === 'failed') return settle('failed');
        // Claimed by a mint already: nothing left to show.
        if (info.status === 'used') return settle('ready');
        update({ processPercent: Math.max(snapshot.processPercent, clamp(info.progress)) });
      } catch {
        // A missed poll is not a failed draft; the next one may land.
      }
      if (!finished) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    stopFollowing = () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  };

  const uploaded = createDraftVideo(file, postType, {
    signal: controller.signal,
    onProgress: (percent) => update({ uploadPercent: Math.max(snapshot.uploadPercent, clamp(percent)) }),
  })
    .then(({ draftId, status }) => {
      if (!draftId) {
        settle('unavailable');
        return null;
      }
      if (controller.signal.aborted) return null;
      update({ draftId, uploadPercent: 100, phase: status === 'ready' ? 'ready' : 'processing' });
      if (status === 'ready') {
        settle('ready');
      } else {
        follow(draftId);
      }
      return draftId;
    })
    .catch((error: unknown) => {
      if (error instanceof UploadHttpError && (error.status === 400 || error.status === 413)) {
        // The server read the file and refused it. Say why — the same file
        // would be refused again at post time.
        if (error.serverMessage) options.onRejected?.(error.serverMessage);
        settle('failed');
      } else {
        settle('unavailable');
      }
      return null;
    });

  return {
    file,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    uploaded,
    abort() {
      controller.abort();
      if (!finished) {
        finished = true;
        stopFollowing?.();
        stopFollowing = null;
      }
      listeners.clear();
    },
  };
}

/** Whether a draft can still stand in for the file at post time. */
export function isDraftUsable(snapshot: DraftVideoSnapshot): boolean {
  return snapshot.phase !== 'failed' && snapshot.phase !== 'unavailable';
}
