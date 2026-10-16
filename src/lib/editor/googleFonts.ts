import { graphicFontCss } from "./graphicFonts";
/**
 * Curated list of popular free Google Fonts + lazy loader.
 * We inject a stylesheet link on demand for the family/weight requested;
 * the browser cache keeps subsequent uses instant.
 */

import { GOOGLE_FONTS, type GoogleFont } from "./fontCatalogue";
import type { Clip } from "./types";
export { GOOGLE_FONTS };
export type { GoogleFont };


const loaded = new Map<string, Promise<void>>();

function toUrlFamily(family: string): string {
  return family.trim().replace(/\s+/g, "+");
}

/** Inject a Google Fonts stylesheet for a family + weights (once per key). */
export function loadGoogleFont(family: string, weights: number[] = [400, 700]): void {
  void requestFontStylesheet(family, weights).catch(() => {});
}

function requestFontStylesheet(family: string, weights: number[]): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const key = `${family}|${weights.slice().sort().join(",")}`;
  const previous = loaded.get(key);
  if (previous) return previous;
  const url = `https://fonts.googleapis.com/css2?family=${toUrlFamily(family)}:wght@${weights
    .slice()
    .sort((a, b) => a - b)
    .join(";")}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.setAttribute("data-google-font", family);
  const promise = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { link.onload = null; link.onerror = null; loaded.delete(key); link.remove(); reject(new Error(`Could not load ${family}`)); }, 8000);
    link.onload = () => { window.clearTimeout(timer); link.onload = null; link.onerror = null; resolve(); };
    link.onerror = () => { window.clearTimeout(timer); link.onload = null; link.onerror = null; loaded.delete(key); link.remove(); reject(new Error(`Could not load ${family}`)); };
  });
  loaded.set(key, promise);
  document.head.appendChild(link);
  return promise;
}

/** Export waits for fonts actually used by the project instead of capturing temporary fallbacks. */
export async function ensureProjectFonts(clips: readonly Clip[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const fonts = new Map<string, { font: GoogleFont; weights: Set<number>; sample: string }>();
  for (const clip of clips) {
    if (clip.kind === "shape" && (clip.chart || clip.table)) {
      const graphic = clip.chart ?? clip.table!, font = findFontByCss(graphicFontCss(graphic.fontFamily));
      if (font) { const entry = fonts.get(font.family) ?? { font, weights: new Set<number>(), sample: "" }; for (const wanted of [400, 500, 600, 700]) entry.weights.add(font.weights.reduce((best, weight) => Math.abs(weight - wanted) < Math.abs(best - wanted) ? weight : best, font.weights[0])); entry.sample = (entry.sample + JSON.stringify(graphic)).slice(0, 1000); fonts.set(font.family, entry); }
    }
    if (clip.kind !== "text") continue;
    const font = findFontByCss(clip.fontFamily);
    if (!font) continue;
    const entry = fonts.get(font.family) ?? { font, weights: new Set<number>(), sample: "" };
    const weight = font.weights.reduce((best, value) => Math.abs(value - clip.fontWeight) < Math.abs(best - clip.fontWeight) ? value : best, font.weights[0]);
    entry.weights.add(weight); entry.sample = (entry.sample + clip.text).slice(0, 1000); fonts.set(font.family, entry);
  }
  await Promise.all([...fonts.values()].map(async ({ font, weights, sample }) => {
    await requestFontStylesheet(font.family, font.weights);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.all([...weights].map(weight => document.fonts.load(`${weight} 16px "${font.family}"`, sample || "Design"))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Could not load ${font.family}`)), 8000); })]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }));
}

/** Extract the primary family name from a CSS font-family value. */
export function primaryFamily(css: string): string {
  const first = css.split(",")[0] ?? css;
  return first.trim().replace(/^['"]|['"]$/g, "");
}

/** Build a CSS font-family value with sensible fallbacks. */
export function fontFamilyCss(family: string, category: GoogleFont["category"] = "sans-serif"): string {
  const fallback =
    category === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : category === "monospace"
      ? "ui-monospace, SFMono-Regular, Menlo, monospace"
      : category === "handwriting"
      ? "cursive"
      : category === "display"
      ? "system-ui, sans-serif"
      : "ui-sans-serif, system-ui, sans-serif";
  return `'${family}', ${fallback}`;
}

export function findFontByCss(css: string): GoogleFont | null {
  const name = primaryFamily(css);
  return GOOGLE_FONTS.find((f) => f.family.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function ensureGraphicFont(family?: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const font = findFontByCss(graphicFontCss(family)); if (!font) return;
  await requestFontStylesheet(font.family, font.weights);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([Promise.all([400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 16px "${font.family}"`))), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Could not load the graphic font")), 8000); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
