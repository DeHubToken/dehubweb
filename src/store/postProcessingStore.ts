import { create } from 'zustand';

export type PostProcessingPhase = 'processing' | 'done' | 'failed';

export interface PostProcessingJob {
  tokenId: string;
  /** The composer's own frame grab, a blob: URL kept alive by the optimistic card. */
  thumbnail?: string;
  /** Transcode progress, 0–100; 0 until the server reports any. */
  progress: number;
  phase: PostProcessingPhase;
}

interface PostProcessingState {
  /** The most recent video post still being prepared, if any. */
  job: PostProcessingJob | null;
  start: (job: { tokenId: string; thumbnail?: string }) => void;
  update: (tokenId: string, patch: Partial<Pick<PostProcessingJob, 'progress' | 'phase'>>) => void;
  dismiss: (tokenId?: string) => void;
}

/**
 * The dock above the bottom nav that follows a just-published video through
 * its transcode. One at a time: a newer post replaces an older one's pill.
 */
export const usePostProcessingStore = create<PostProcessingState>()((set) => ({
  job: null,
  start: ({ tokenId, thumbnail }) => set({ job: { tokenId, thumbnail, progress: 0, phase: 'processing' } }),
  update: (tokenId, patch) => set((state) => {
    if (!state.job || state.job.tokenId !== tokenId) return state;
    // A late progress tick must not drag a finished job back.
    if (state.job.phase !== 'processing' && patch.phase === undefined) return state;
    const progress = patch.progress === undefined ? state.job.progress : Math.max(state.job.progress, patch.progress);
    return { job: { ...state.job, ...patch, progress } };
  }),
  dismiss: (tokenId) => set((state) => (!tokenId || state.job?.tokenId === tokenId ? { job: null } : state)),
}));
