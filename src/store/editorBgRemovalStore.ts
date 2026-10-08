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
  cancel: () => void;
}

let backgroundController: AbortController | null = null;

export const useBgRemovalStore = create<BgRemovalState>((set, get) => ({
  clipId: null,
  progress: null,
  cancel: () => backgroundController?.abort(),
  run: async (clipId, wallet) => {
    if (get().clipId) return false;
    const controller = new AbortController(); backgroundController = controller;
    set({ clipId, progress: null });
    try {
      const ok = await removeLayerBackground(clipId, {
        wallet, signal: controller.signal,
        onProgress: (progress) => set({ progress }),
      });
      if (ok) toast.success(i18n.t('editor.bgRemove.done'));
      else if (!controller.signal.aborted) toast.error(i18n.t('editor.bgRemove.failed'));
      return ok;
    } catch (e) {
      if (controller.signal.aborted) return false;
      console.error('[editor] background removal failed', e);
      toast.error(e instanceof Error ? e.message : i18n.t('editor.bgRemove.failed'));
      return false;
    } finally {
      backgroundController = null;
      set({ clipId: null, progress: null });
    }
  },
}));
