/**
 * Shared editor types. Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */

export type TrackKind = "video" | "audio" | "text";
export type ClipKind = "video" | "audio" | "image" | "text";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
}

interface BaseClip {
  id: string;
  trackId: string;
  start: number; // timeline seconds where clip starts
  duration: number; // length on timeline (s)
  trimIn: number; // offset into source media (s); 0 for images/text
}

export interface MediaClip extends BaseClip {
  kind: "video" | "audio" | "image";
  mediaId: string;
  /** Source media natural duration (seconds), if applicable. */
  sourceDuration?: number;
}

export interface TextClip extends BaseClip {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number; // px relative to canvas height
  fontWeight: number;
  color: string;
  align: "left" | "centre" | "right";
  /** Normalised 0..1 position inside the canvas. */
  x: number;
  y: number;
}

export type Clip = MediaClip | TextClip;

export type AspectPreset = "16:9" | "9:16" | "1:1" | "4:5" | "custom";

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string; // hex
  aspectPreset: AspectPreset;
}

export interface ProjectSnapshot {
  id: string;
  title: string;
  tracks: Track[];
  clips: Clip[];
  settings: ProjectSettings;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
  aspectPreset: "16:9",
};

export function aspectToDims(preset: AspectPreset, base = 1080): { width: number; height: number } {
  switch (preset) {
    case "9:16":
      return { width: base, height: Math.round((base * 16) / 9) };
    case "1:1":
      return { width: base, height: base };
    case "4:5":
      return { width: base, height: Math.round((base * 5) / 4) };
    case "16:9":
    default:
      return { width: Math.round((base * 16) / 9), height: base };
  }
}
