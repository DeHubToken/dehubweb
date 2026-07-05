/**
 * Editor state: media library, multi-track timeline, playback, project settings,
 * selection, and undo/redo history.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { create } from "zustand";
import { nanoid } from "nanoid";
import type { MediaMeta, StoredMedia } from "@/lib/editor/mediaStore";
import {
  DEFAULT_SETTINGS,
  type Clip,
  type ClipKind,
  type MediaClip,
  type ProjectSettings,
  type ProjectSnapshot,
  type TextClip,
  type Track,
  type TrackKind,
} from "@/lib/editor/types";

export interface MediaItem extends MediaMeta {
  url: string;
  thumbnailUrl?: string;
}

/** State that is part of the undo/redo snapshot. */
interface EditableState {
  tracks: Track[];
  clips: Clip[];
  settings: ProjectSettings;
}

interface EditorState extends EditableState {
  /** Project identity. */
  projectId: string;
  projectTitle: string;

  /** Media library (live object URLs). */
  media: MediaItem[];

  /** Selection + playback. */
  selectedClipIds: string[];
  currentTime: number;
  isPlaying: boolean;
  isLooping: boolean;
  zoom: number; // pixels per second on the timeline

  /** History stacks (capped). */
  past: EditableState[];
  future: EditableState[];

  // --- meta actions ---
  setProjectTitle: (t: string) => void;
  loadSnapshot: (snap: ProjectSnapshot) => void;
  newProject: () => void;
  toSnapshot: () => ProjectSnapshot;

  // --- media library ---
  setMedia: (items: MediaItem[]) => void;
  addMedia: (item: MediaItem) => void;
  removeMedia: (id: string) => void;

  // --- playback ---
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  toggleLoop: () => void;
  setZoom: (z: number) => void;

  // --- selection ---
  selectClip: (id: string | null, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;

  // --- history ---
  undo: () => void;
  redo: () => void;

  // --- timeline edits (all go through history) ---
  addTrack: (kind: TrackKind) => string;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, direction: "front" | "back" | "forward" | "backward") => void;
  reorderTrack: (id: string, toIndex: number) => void;

  addClipFromMedia: (mediaId: string, trackId?: string, start?: number) => string | null;
  addTextClip: (trackId?: string, start?: number) => string;
  moveClip: (id: string, patch: { start?: number; trackId?: string }) => void;
  trimClip: (id: string, edge: "in" | "out", deltaSeconds: number) => void;
  splitAtPlayhead: () => void;
  rippleDelete: (ids?: string[]) => void;
  duplicateSelected: () => void;
  updateTextClip: (id: string, patch: Partial<TextClip>) => void;
  updateMediaClip: (id: string, patch: Partial<MediaClip>) => void;
  setClipTransition: (id: string, transition: Clip["transitionOut"] | null) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
}

const MAX_HISTORY = 50;
const MIN_CLIP = 0.05; // minimum clip duration (s)

function snapshotEditable(s: EditorState): EditableState {
  return {
    tracks: s.tracks.map((t) => ({ ...t })),
    clips: s.clips.map((c) => ({ ...c })),
    settings: { ...s.settings },
  };
}

function defaultTracks(): Track[] {
  // Order matters: later entries render on top of earlier ones.
  // Text sits at the end so overlays land above video by default.
  return [
    { id: nanoid(8), kind: "video", name: "Video 1", muted: false, hidden: false },
    { id: nanoid(8), kind: "audio", name: "Audio 1", muted: false, hidden: false },
    { id: nanoid(8), kind: "text", name: "Text", muted: false, hidden: false },
  ];
}

function findFreeStart(clips: Clip[], trackId: string, desired: number, duration: number): number {
  // Push to the right until there is no overlap on this track.
  let start = Math.max(0, desired);
  const onTrack = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  for (const c of onTrack) {
    if (start + duration <= c.start) break;
    if (start < c.start + c.duration) start = c.start + c.duration;
  }
  return start;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: nanoid(10),
  projectTitle: "Untitled project",
  tracks: defaultTracks(),
  clips: [],
  settings: { ...DEFAULT_SETTINGS },

  media: [],
  selectedClipIds: [],
  currentTime: 0,
  isPlaying: false,
  isLooping: false,
  zoom: 80,

  past: [],
  future: [],

  // ── meta ──
  setProjectTitle: (t) => set({ projectTitle: t }),
  loadSnapshot: (snap) =>
    set({
      projectId: snap.id,
      projectTitle: snap.title,
      tracks: snap.tracks,
      clips: snap.clips,
      settings: snap.settings,
      selectedClipIds: [],
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
    }),
  newProject: () =>
    set({
      projectId: nanoid(10),
      projectTitle: "Untitled project",
      tracks: defaultTracks(),
      clips: [],
      settings: { ...DEFAULT_SETTINGS },
      selectedClipIds: [],
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
    }),
  toSnapshot: (): ProjectSnapshot => {
    const s = get();
    return {
      id: s.projectId,
      title: s.projectTitle,
      tracks: s.tracks,
      clips: s.clips,
      settings: s.settings,
      updatedAt: Date.now(),
    };
  },

  // ── media ──
  setMedia: (items) => set({ media: items }),
  addMedia: (item) =>
    set((s) => ({ media: [item, ...s.media.filter((m) => m.id !== item.id)] })),
  removeMedia: (id) => {
    const target = get().media.find((m) => m.id === id);
    if (target) {
      try { URL.revokeObjectURL(target.url); } catch { /* noop */ }
      if (target.thumbnailUrl) try { URL.revokeObjectURL(target.thumbnailUrl); } catch { /* noop */ }
    }
    set((s) => ({ media: s.media.filter((m) => m.id !== id) }));
    // Also remove dependent clips through history.
    const orphans = get().clips.filter((c) => c.kind !== "text" && c.mediaId === id).map((c) => c.id);
    if (orphans.length) get().rippleDelete(orphans);
  },

  // ── playback ──
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  toggleLoop: () => set((s) => ({ isLooping: !s.isLooping })),
  setZoom: (z) => set({ zoom: Math.max(8, Math.min(400, z)) }),

  // ── selection ──
  selectClip: (id, additive) =>
    set((s) => {
      if (id === null) return { selectedClipIds: [] };
      if (additive) {
        const exists = s.selectedClipIds.includes(id);
        return {
          selectedClipIds: exists
            ? s.selectedClipIds.filter((x) => x !== id)
            : [...s.selectedClipIds, id],
        };
      }
      return { selectedClipIds: [id] };
    }),
  selectMany: (ids) => set({ selectedClipIds: ids }),

  // ── history ──
  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      const newPast = s.past.slice(0, -1);
      const current = snapshotEditable(s);
      return {
        ...previous,
        past: newPast,
        future: [current, ...s.future].slice(0, MAX_HISTORY),
      } as Partial<EditorState> as EditorState;
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return s;
      const next = s.future[0];
      const newFuture = s.future.slice(1);
      const current = snapshotEditable(s);
      return {
        ...next,
        past: [...s.past, current].slice(-MAX_HISTORY),
        future: newFuture,
      } as Partial<EditorState> as EditorState;
    }),

  // ── timeline edits ──
  addTrack: (kind) => {
    const id = nanoid(8);
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    const count = s.tracks.filter((t) => t.kind === kind).length + 1;
    const name = kind === "text" ? `Text ${count}` : kind === "audio" ? `Audio ${count}` : `Video ${count}`;
    set({
      past,
      future: [],
      tracks: [...s.tracks, { id, kind, name, muted: false, hidden: false }],
    });
    return id;
  },
  removeTrack: (id) => {
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
      selectedClipIds: s.selectedClipIds.filter(
        (cid) => !s.clips.some((c) => c.id === cid && c.trackId === id),
      ),
    });
  },

  moveTrack: (id, direction) => {
    const s = get();
    const idx = s.tracks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const arr = s.tracks.slice();
    const [item] = arr.splice(idx, 1);
    let newIdx = idx;
    if (direction === "front") newIdx = arr.length;
    else if (direction === "back") newIdx = 0;
    else if (direction === "forward") newIdx = Math.min(arr.length, idx + 1);
    else if (direction === "backward") newIdx = Math.max(0, idx - 1);
    if (newIdx === idx) return;
    arr.splice(newIdx, 0, item);
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({ past, future: [], tracks: arr });
  },

  addClipFromMedia: (mediaId, trackId, start) => {
    const s = get();
    const media = s.media.find((m) => m.id === mediaId);
    if (!media) return null;

    const wantKind: TrackKind = media.kind === "audio" ? "audio" : "video";
    const targetTrack =
      (trackId && s.tracks.find((t) => t.id === trackId && t.kind === wantKind)) ||
      s.tracks.find((t) => t.kind === wantKind);
    if (!targetTrack) return null;

    const duration =
      media.kind === "image"
        ? 5
        : Number.isFinite(media.duration) && (media.duration ?? 0) > 0
        ? (media.duration as number)
        : 5;

    const desired = start !== undefined ? start : s.currentTime;
    const placedStart = findFreeStart(s.clips, targetTrack.id, desired, duration);

    const clip: MediaClip = {
      id: nanoid(10),
      trackId: targetTrack.id,
      kind: media.kind as ClipKind as MediaClip["kind"],
      start: placedStart,
      duration,
      trimIn: 0,
      mediaId,
      sourceDuration: media.duration,
    };

    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({ past, future: [], clips: [...s.clips, clip], selectedClipIds: [clip.id] });
    return clip.id;
  },

  addTextClip: (trackId, start) => {
    const s = get();
    const targetTrack =
      (trackId && s.tracks.find((t) => t.id === trackId && t.kind === "text")) ||
      s.tracks.find((t) => t.kind === "text") ||
      // create one if absent
      null;
    let textTrackId = targetTrack?.id;
    if (!textTrackId) {
      textTrackId = nanoid(8);
    }
    const duration = 4;
    const desired = start !== undefined ? start : s.currentTime;
    const placedStart = findFreeStart(s.clips, textTrackId, desired, duration);

    const clip: TextClip = {
      id: nanoid(10),
      trackId: textTrackId,
      kind: "text",
      start: placedStart,
      duration,
      trimIn: 0,
      text: "New text",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 72,
      fontWeight: 700,
      color: "#ffffff",
      align: "centre",
      x: 0.5,
      y: 0.5,
    };

    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    const tracks = targetTrack
      ? s.tracks
      : [...s.tracks, { id: textTrackId, kind: "text" as const, name: "Text", muted: false, hidden: false }];
    set({ past, future: [], tracks, clips: [...s.clips, clip], selectedClipIds: [clip.id] });
    return clip.id;
  },

  moveClip: (id, patch) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    const newTrackId = patch.trackId ?? clip.trackId;
    const newTrack = s.tracks.find((t) => t.id === newTrackId);
    if (!newTrack) return;
    // Enforce track kind compatibility.
    const clipKind = clip.kind;
    const ok =
      (newTrack.kind === "video" && (clipKind === "video" || clipKind === "image")) ||
      (newTrack.kind === "audio" && clipKind === "audio") ||
      (newTrack.kind === "text" && clipKind === "text");
    if (!ok) return;

    const desired = Math.max(0, patch.start ?? clip.start);
    // Avoid overlap with other clips on the target track.
    const others = s.clips.filter((c) => c.id !== id && c.trackId === newTrackId).sort((a, b) => a.start - b.start);
    let start = desired;
    for (const o of others) {
      const overlap = start < o.start + o.duration && start + clip.duration > o.start;
      if (overlap) {
        // Snap to nearest free side.
        const leftEdge = o.start - clip.duration;
        const rightEdge = o.start + o.duration;
        start = Math.abs(desired - leftEdge) < Math.abs(desired - rightEdge) && leftEdge >= 0 ? leftEdge : rightEdge;
      }
    }
    start = Math.max(0, start);

    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.map((c) => (c.id === id ? { ...c, trackId: newTrackId, start } as Clip : c)),
    });
  },

  trimClip: (id, edge, deltaSeconds) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    let { start, duration, trimIn } = clip;
    if (edge === "in") {
      const newStart = Math.max(0, start + deltaSeconds);
      const newDuration = duration - (newStart - start);
      if (newDuration < MIN_CLIP) return;
      // For media clips, also move trimIn so the source moves with the trim.
      if (clip.kind !== "text" && clip.kind !== "image") {
        trimIn = Math.max(0, trimIn + (newStart - start));
      }
      start = newStart;
      duration = newDuration;
    } else {
      const newDuration = duration + deltaSeconds;
      if (newDuration < MIN_CLIP) return;
      if (clip.kind === "video" || clip.kind === "audio") {
        const src = clip.sourceDuration ?? Infinity;
        if (trimIn + newDuration > src) duration = Math.max(MIN_CLIP, src - trimIn);
        else duration = newDuration;
      } else {
        duration = newDuration;
      }
    }
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.map((c) => (c.id === id ? ({ ...c, start, duration, trimIn } as Clip) : c)),
    });
  },

  splitAtPlayhead: () => {
    const s = get();
    const t = s.currentTime;
    const toSplit = s.clips.filter((c) => t > c.start + 0.01 && t < c.start + c.duration - 0.01);
    if (!toSplit.length) return;
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    const newClips: Clip[] = [];
    for (const c of s.clips) {
      const split = toSplit.find((x) => x.id === c.id);
      if (!split) { newClips.push(c); continue; }
      const localOffset = t - c.start;
      const left: Clip = { ...c, duration: localOffset } as Clip;
      const right: Clip = ({
        ...c,
        id: nanoid(10),
        start: t,
        duration: c.duration - localOffset,
        trimIn: c.kind === "text" || c.kind === "image" ? c.trimIn : c.trimIn + localOffset,
      }) as Clip;
      newClips.push(left, right);
    }
    set({ past, future: [], clips: newClips });
  },

  rippleDelete: (ids) => {
    const s = get();
    const target = ids ?? s.selectedClipIds;
    if (!target.length) return;
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.filter((c) => !target.includes(c.id)),
      selectedClipIds: [],
    });
  },

  duplicateSelected: () => {
    const s = get();
    if (!s.selectedClipIds.length) return;
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    const newIds: string[] = [];
    const additions: Clip[] = [];
    let workingClips = s.clips.slice();
    for (const id of s.selectedClipIds) {
      const orig = workingClips.find((c) => c.id === id);
      if (!orig) continue;
      const desired = orig.start + orig.duration;
      const placedStart = findFreeStart(workingClips, orig.trackId, desired, orig.duration);
      const copy = { ...orig, id: nanoid(10), start: placedStart } as Clip;
      additions.push(copy);
      workingClips = [...workingClips, copy];
      newIds.push(copy.id);
    }
    if (!additions.length) return;
    set({ past, future: [], clips: workingClips, selectedClipIds: newIds });
  },

  updateTextClip: (id, patch) => {
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.map((c) =>
        c.id === id && c.kind === "text" ? ({ ...c, ...patch } as TextClip) : c,
      ),
    });
  },

  updateMediaClip: (id, patch) => {
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.map((c) =>
        c.id === id && c.kind !== "text" ? ({ ...c, ...patch } as MediaClip) : c,
      ),
    });
  },

  setClipTransition: (id, transition) => {
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({
      past,
      future: [],
      clips: s.clips.map((c) => {
        if (c.id !== id) return c;
        const { transitionOut: _omit, ...rest } = c;
        return (transition ? { ...rest, transitionOut: transition } : rest) as Clip;
      }),
    });
  },

  updateSettings: (patch) => {
    const s = get();
    const past = [...s.past, snapshotEditable(s)].slice(-MAX_HISTORY);
    set({ past, future: [], settings: { ...s.settings, ...patch } });
  },
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

/** Total timeline duration = max(clip end). */
export function selectTimelineDuration(state: EditorState): number {
  let max = 0;
  for (const c of state.clips) {
    const end = c.start + c.duration;
    if (end > max) max = end;
  }
  return max;
}
