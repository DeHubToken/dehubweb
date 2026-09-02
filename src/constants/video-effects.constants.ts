/**
 * Camera looks for the Go Live broadcaster.
 *
 * The visual counterpart to VOICE_EFFECTS, and deliberately the same shape: a
 * flat list the selector maps into pills. Names live in i18n rather than in
 * this file — `videoLooks.<id>` — because the voice list hardcoded its English
 * and that is the thing that has to stop, not be copied.
 *
 * `needsCanvasFilter` marks the looks built on `ctx.filter`, which Safari only
 * shipped in 18. The two privacy looks are deliberately not among them: blur
 * and pixelate work by discarding pixels before anything is filtered, so they
 * stay available on every browser that can broadcast at all.
 */

export type VideoEffectId =
  | 'none'
  | 'soft'
  | 'mono'
  | 'noir'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'dream'
  | 'vhs'
  | 'neon'
  | 'blur'
  | 'pixelate';

export interface VideoEffectConfig {
  id: VideoEffectId;
  emoji: string;
  /** Built on `ctx.filter`, so hidden where the browser has no canvas filters. */
  needsCanvasFilter: boolean;
}

export const VIDEO_EFFECTS: VideoEffectConfig[] = [
  { id: 'none', emoji: '🚫', needsCanvasFilter: false },
  { id: 'soft', emoji: '✨', needsCanvasFilter: true },
  { id: 'mono', emoji: '⚫', needsCanvasFilter: true },
  { id: 'noir', emoji: '🎞️', needsCanvasFilter: true },
  { id: 'warm', emoji: '🌇', needsCanvasFilter: true },
  { id: 'cool', emoji: '🧊', needsCanvasFilter: true },
  { id: 'vivid', emoji: '🌈', needsCanvasFilter: true },
  { id: 'dream', emoji: '💭', needsCanvasFilter: true },
  { id: 'vhs', emoji: '📼', needsCanvasFilter: true },
  { id: 'neon', emoji: '🌃', needsCanvasFilter: true },
  { id: 'blur', emoji: '🫧', needsCanvasFilter: false },
  { id: 'pixelate', emoji: '🟪', needsCanvasFilter: false },
];
