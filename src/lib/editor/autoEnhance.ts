/**
 * One-click enhance, measured from the picture itself (on the device, free).
 * Samples the image at 64×64, looks at average brightness and spread, and
 * nudges brightness, contrast and saturation towards a balanced exposure.
 * Deliberately gentle: it should never make a good photo worse.
 */
import type { ClipEffects } from "./types";

export async function autoEnhanceEffects(url: string, current: ClipEffects | undefined): Promise<ClipEffects> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const S = 64;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return { ...current };
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  let sum = 0;
  let sumSq = 0;
  let sat = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue; // ignore transparent cut-out areas
    const r = px[i] / 255;
    const gg = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const mx = Math.max(r, gg, b);
    const mn = Math.min(r, gg, b);
    sum += l;
    sumSq += l * l;
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    n++;
  }
  if (!n) return { ...current };
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const meanSat = sat / n;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    ...current,
    // Aim average brightness at ~0.5, and a spread of ~0.22.
    brightness: round(clamp(1 + (0.5 - mean) * 0.8, 0.85, 1.3)),
    contrast: round(clamp(1 + (0.22 - std) * 1.5, 0.95, 1.3)),
    // Lift dull colour, leave already-vivid pictures alone.
    saturation: round(clamp(1 + (0.35 - meanSat) * 0.8, 1, 1.3)),
  };
}
