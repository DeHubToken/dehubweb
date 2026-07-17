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
  { id: "cinematic", label: "Cinematic", effects: { contrast: 1.15, saturation: 1.1, brightness: 0.95 } },
  { id: "warm", label: "Warm", effects: { saturation: 1.15, hueRotate: 15, brightness: 1.05 } },
  { id: "cool", label: "Cool", effects: { saturation: 1.1, hueRotate: 340, brightness: 1.02 } },
  { id: "vintage", label: "Vintage", effects: { sepia: 0.4, saturation: 0.85, contrast: 1.05 } },
  { id: "bw", label: "B&W", effects: { grayscale: 1, contrast: 1.1 } },
  { id: "sepia", label: "Sepia", effects: { sepia: 0.85, contrast: 1.05 } },
  { id: "dreamy", label: "Dreamy", effects: { blur: 1.5, brightness: 1.08, saturation: 1.1 } },
  { id: "punchy", label: "Punchy", effects: { contrast: 1.3, saturation: 1.35 } },
  { id: "faded", label: "Faded", effects: { contrast: 0.85, saturation: 0.75, brightness: 1.05 } },
  { id: "noir", label: "Noir", effects: { grayscale: 1, contrast: 1.4, brightness: 0.9 } },
  { id: "sunny", label: "Sunny", effects: { brightness: 1.15, saturation: 1.2, hueRotate: 10 } },
  { id: "moody", label: "Moody", effects: { brightness: 0.85, contrast: 1.2, saturation: 0.9 } },
  { id: "vibrant", label: "Vibrant", effects: { saturation: 1.5, contrast: 1.1 } },
  { id: "cyber", label: "Cyber", effects: { hueRotate: 220, saturation: 1.4, contrast: 1.15 } },
  { id: "invert", label: "Invert", effects: { invert: 1 } },
];

export function applyFilterPreset(id: string): ClipEffects | undefined {
  const p = FILTER_PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  return { ...p.effects };
}
