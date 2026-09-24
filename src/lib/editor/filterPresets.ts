/**
 * Visual "vibe" filter presets for video and image clips.
 * Each preset maps directly onto ClipEffects, so they render identically in
 * the live compositor and in the exporter.
 */
import type { ClipEffects } from "./types";

export interface FilterPreset {
  id: string;
  label: string;
  effects: ClipEffects;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", label: "Original", effects: {} },
  // Warm/cool/sunny used to rotate hue, which skews skin tones; they now use
  // the real white-balance grade (warmth), and a few looks gain a vignette.
  { id: "cinematic", label: "Cinematic", effects: { contrast: 1.15, saturation: 1.1, brightness: 0.95, warmth: 0.1, vignette: 0.3 } },
  { id: "warm", label: "Warm", effects: { saturation: 1.1, brightness: 1.03, warmth: 0.55 } },
  { id: "cool", label: "Cool", effects: { saturation: 1.05, brightness: 1.02, warmth: -0.5 } },
  { id: "vintage", label: "Vintage", effects: { sepia: 0.35, saturation: 0.85, contrast: 1.05, warmth: 0.25, vignette: 0.4 } },
  { id: "bw", label: "B&W", effects: { grayscale: 1, contrast: 1.1 } },
  { id: "sepia", label: "Sepia", effects: { sepia: 0.85, contrast: 1.05 } },
  { id: "dreamy", label: "Dreamy", effects: { blur: 1.5, brightness: 1.08, saturation: 1.1 } },
  { id: "punchy", label: "Punchy", effects: { contrast: 1.3, saturation: 1.35 } },
  { id: "faded", label: "Faded", effects: { contrast: 0.85, saturation: 0.75, brightness: 1.05 } },
  { id: "noir", label: "Noir", effects: { grayscale: 1, contrast: 1.4, brightness: 0.9, vignette: 0.5 } },
  { id: "sunny", label: "Sunny", effects: { brightness: 1.12, saturation: 1.2, warmth: 0.35 } },
  { id: "moody", label: "Moody", effects: { brightness: 0.85, contrast: 1.2, saturation: 0.9, warmth: -0.15, vignette: 0.45 } },
  { id: "vibrant", label: "Vibrant", effects: { saturation: 1.5, contrast: 1.1 } },
  { id: "cyber", label: "Cyber", effects: { hueRotate: 220, saturation: 1.4, contrast: 1.15 } },
  { id: "invert", label: "Invert", effects: { invert: 1 } },
];

export function applyFilterPreset(id: string): ClipEffects | undefined {
  const p = FILTER_PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  return { ...p.effects };
}
