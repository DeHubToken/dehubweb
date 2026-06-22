/**
 * Editor state — media library, selection, playback time, project title.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { create } from "zustand";
import type { MediaMeta, StoredMedia } from "@/lib/editor/mediaStore";

export interface MediaItem extends MediaMeta {
  /** Object URL for the main blob (created lazily; revoked on remove/unmount). */
  url: string;
  /** Object URL for the thumbnail (if any). */
  thumbnailUrl?: string;
}

interface EditorState {
  projectTitle: string;
  media: MediaItem[];
  selectedId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  setProjectTitle: (t: string) => void;
  addMedia: (item: MediaItem) => void;
  removeMedia: (id: string) => void;
  setMedia: (items: MediaItem[]) => void;
  selectMedia: (id: string | null) => void;
  setIsPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectTitle: "Untitled project",
  media: [],
  selectedId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  setProjectTitle: (t) => set({ projectTitle: t }),
  addMedia: (item) =>
    set((s) => ({ media: [item, ...s.media.filter((m) => m.id !== item.id)] })),
  removeMedia: (id) => {
    const target = get().media.find((m) => m.id === id);
    if (target) {
      try { URL.revokeObjectURL(target.url); } catch { /* noop */ }
      if (target.thumbnailUrl) try { URL.revokeObjectURL(target.thumbnailUrl); } catch { /* noop */ }
    }
    set((s) => ({
      media: s.media.filter((m) => m.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },
  setMedia: (items) => set({ media: items }),
  selectMedia: (id) => set({ selectedId: id, currentTime: 0, isPlaying: false }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
}));

/** Build a MediaItem (with object URLs) from a StoredMedia row. */
export function toMediaItem(row: StoredMedia): MediaItem {
  const { blob, thumbnail, ...meta } = row;
  return {
    ...meta,
    thumbnail,
    url: URL.createObjectURL(blob),
    thumbnailUrl: thumbnail ? URL.createObjectURL(thumbnail) : undefined,
  };
}
