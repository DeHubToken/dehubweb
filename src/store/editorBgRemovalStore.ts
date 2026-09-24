/**
 * Background-removal progress, shared by every place that can start it (the
 * inspector button, the canvas menu, the AI agent) so they all show the same
 * state and a second click cannot start a parallel run.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { removeLayerBackground, type BgRemovalProgress } from '@/lib/editor/removeBackground';

interface BgRemovalState {
  clipId: string | null;
  progress: BgRemovalProgress | null;
  run: (clipId: string, wallet?: string | null) => Promise<boolean>;
}

export const useBgRemovalStore = create<BgRemovalState>((set, get) => ({
  clipId: null,
  progress: null,
  run: async (clipId, wallet) => {
    if (get().clipId) return false;
    set({ clipId, progress: null });
    try {
      const ok = await removeLayerBackground(clipId, {
        wallet,
        onProgress: (progress) => set({ progress }),
      });
      if (ok) toast.success(i18n.t('editor.bgRemove.done'));
      else toast.error(i18n.t('editor.bgRemove.failed'));
      return ok;
    } catch (e) {
      console.error('[editor] background removal failed', e);
      toast.error(i18n.t('editor.bgRemove.failed'));
      return false;
    } finally {
      set({ clipId: null, progress: null });
    }
  },
}));
