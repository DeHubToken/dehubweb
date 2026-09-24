/**
 * Auto-caption progress, shared by the inspector button and the AI agent so
 * only one transcription runs at a time and both show the same state.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { addAutoCaptions, type CaptionProgress } from '@/lib/editor/captions';

interface CaptionsState {
  clipId: string | null;
  progress: CaptionProgress | null;
  run: (clipId: string) => Promise<boolean>;
}

export const useCaptionsStore = create<CaptionsState>((set, get) => ({
  clipId: null,
  progress: null,
  run: async (clipId) => {
    if (get().clipId) return false;
    set({ clipId, progress: null });
    try {
      const count = await addAutoCaptions(clipId, (progress) => set({ progress }));
      if (count > 0) toast.success(i18n.t('editor.captions.done', { count }));
      else toast.message(i18n.t('editor.captions.noSpeech'));
      return count > 0;
    } catch (e) {
      console.error('[editor] auto captions failed', e);
      toast.error(i18n.t('editor.captions.failed'));
      return false;
    } finally {
      set({ clipId: null, progress: null });
    }
  },
}));
