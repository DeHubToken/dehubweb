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

export type TransitionKind =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "wipe-left"
  | "wipe-right";

export interface Transition {
  kind: TransitionKind;
  /** Transition length in seconds (overlap window between this clip and the next on the same track). */
  duration: number;
}

interface BaseClip {
  id: string;
  trackId: string;
  start: number; // timeline seconds where clip starts
  duration: number; // length on timeline (s)
  trimIn: number; // offset into source media (s); 0 for images/text
  /** Outgoing transition into the next adjacent clip on the same track. */
  transitionOut?: Transition;
  /** Entrance animation applied at the start of the clip. */
  animateIn?: ClipAnimation;
  /** Exit animation applied at the end of the clip. */
  animateOut?: ClipAnimation;
}


export interface ClipEffects {
  /** 0..2, 1 = neutral */
  brightness?: number;
  /** 0..2, 1 = neutral */
  contrast?: number;
  /** 0..2, 1 = neutral */
  saturation?: number;
  /** 0..20 px */
  blur?: number;
  /** 0..1, 0 = off */
  grayscale?: number;
  /** 0..1, 0 = off */
  sepia?: number;
  /** 0..360 deg */
  hueRotate?: number;
  /** 0..1, 0 = off */
  invert?: number;
}

export type ClipAnimationKind =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "pop"
  | "rise"
  | "blur";

export interface ClipAnimation {
  kind: ClipAnimationKind;
  /** seconds */
  duration: number;
}


export interface ClipAudio {
  /** 0..2, 1 = 100% */
  volume?: number;
  /** seconds of linear fade-in */
  fadeIn?: number;
  /** seconds of linear fade-out */
  fadeOut?: number;
}

export interface MediaClip extends BaseClip {
  kind: "video" | "audio" | "image";
  mediaId: string;
  /** Source media natural duration (seconds), if applicable. */
  sourceDuration?: number;
  effects?: ClipEffects;
  audio?: ClipAudio;
  /** Playback rate for video/audio sources. 1 = normal, 2 = 2x, 0.5 = half. Default 1. */
  speed?: number;
}

export interface TextBackground {
  /** Hex colour. */
  color: string;
  /** 0..1 opacity of the background fill. */
  opacity: number;
  /** Padding in px, relative to a 1080p canvas height. */
  padding: number;
  /** Corner radius in px, relative to a 1080p canvas height. */
  radius: number;
}

export interface TextStroke {
  color: string;
  /** Stroke width in px relative to 1080p. */
  width: number;
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
  /** Optional background pill behind the text. Off by default. */
  background?: TextBackground | null;
  /** Optional outline stroke around the glyphs. Off by default. */
  stroke?: TextStroke | null;
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
