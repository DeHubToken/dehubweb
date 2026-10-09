/**
 * Background-removal progress, shared by every place that can start it (the
 * inspector button, the canvas menu, the AI agent) so they all show the same
 * state and a second click cannot start a parallel run.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { useEditorStore } from '@/store/editorStore';
import { backgroundRemovalScope, matchesBackgroundRemovalScope, backgroundRemovalFailureMessage, type BackgroundRemovalFailure } from '@/lib/editor/backgroundRemovalFailure';
import { removeLayerBackground, type BgRemovalProgress } from '@/lib/editor/removeBackground';

interface BgRemovalState {
  clipId: string | null;
  progress: BgRemovalProgress | null;
  failure: BackgroundRemovalFailure | null;
  dismissFailure: () => void;
  run: (clipId: string, wallet?: string | null) => Promise<boolean>;
  cancel: () => void;
}

let backgroundController: AbortController | null = null;

export const useBgRemovalStore = create<BgRemovalState>((set, get) => ({
  clipId: null,
  progress: null,
  failure: null,
  dismissFailure: () => set({ failure: null }),
  cancel: () => backgroundController?.abort(),
  run: async (clipId, wallet) => {
    if (get().clipId) return false;
    const controller = new AbortController(); backgroundController = controller;
    const before = useEditorStore.getState();
    const scope = backgroundRemovalScope(before.projectId, before.clips.find(clip => clip.id === clipId));
    const fail = (error?: unknown) => {
      const now = useEditorStore.getState();
      if (controller.signal.aborted || !matchesBackgroundRemovalScope(scope, now.projectId, now.clips.find(clip => clip.id === clipId))) return;
      const message = backgroundRemovalFailureMessage(error, i18n.t('editor.bgRemove.failed'));
      set({ failure: { ...scope!, message } });
      toast.error(message);
    };
    set({ clipId, progress: null, failure: null });
    try {
      const ok = await removeLayerBackground(clipId, {
        wallet, signal: controller.signal,
        onProgress: (progress) => set({ progress }),
      });
      if (ok) toast.success(i18n.t('editor.bgRemove.done'));
      else fail();
      return ok;
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return false;
      console.error('[editor] background removal failed', e);
      fail(e);
      return false;
    } finally {
      backgroundController = null;
      set({ clipId: null, progress: null });
    }
  },
}));
