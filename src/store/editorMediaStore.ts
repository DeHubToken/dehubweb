/**
 * Cloud asset metadata for the editor's media library.
 * ====================================================
 * Kept beside the media itself rather than inside MediaPanel, so the panel can
 * mount and unmount freely without dropping what the loader already fetched.
 */
import { create } from 'zustand';
import type { CloudAsset } from '@/lib/editor/cloudMedia';

interface EditorMediaState {
  /** Cloud rows keyed by media id, used for the preserved badge and deletes. */
  cloudAssets: Record<string, CloudAsset>;
  /** True once the local library has been read, so the panel can tell empty from loading. */
  hydrated: boolean;
  setCloudAssets: (assets: Record<string, CloudAsset>) => void;
  removeCloudAsset: (id: string) => void;
  markHydrated: () => void;
}

export const useEditorMediaStore = create<EditorMediaState>((set) => ({
  cloudAssets: {},
  hydrated: false,
  setCloudAssets: (cloudAssets) => set({ cloudAssets }),
  removeCloudAsset: (id) =>
    set((s) => {
      const next = { ...s.cloudAssets };
      delete next[id];
      return { cloudAssets: next };
    }),
  markHydrated: () => set({ hydrated: true }),
}));
