/**
 * Apply the brand kit to the whole design in one undo step: headings (text of
 * 100px and up) take the heading font, other text the body font, and shapes
 * and text take brand colours in turn, keeping contrast with the background.
 */
import { useEditorStore } from "@/store/editorStore";
import { useBrandStore, type BrandKit } from "@/store/editorBrandStore";
import { findFontByCss, loadGoogleFont, primaryFamily } from "./googleFonts";

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 0.5;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function ensureFont(css: string | null) {
  if (!css) return;
  const f = findFontByCss(css);
  if (f) loadGoogleFont(f.family, f.weights);
  else loadGoogleFont(primaryFamily(css), [400, 700, 900]);
}

export async function applyBrand(kit: BrandKit = useBrandStore.getState().kit): Promise<number> {
  const store = useEditorStore.getState();
  ensureFont(kit.headingFont);
  ensureFont(kit.bodyFont);
  const bg = store.settings.background;
  // Readable text colours first; fall back to white or black when no brand colour reads on this background.
  const readable = kit.colors.filter((c) => contrast(c, bg) >= 3);
  const fallbackText = luminance(bg) > 0.4 ? "#111111" : "#ffffff";
  let changed = 0;
  let shapeIdx = 0;
  let textIdx = 0;
  await store.runAsOneStep(() => {
    for (const c of useEditorStore.getState().clips) {
      if (c.kind === "text") {
        const heading = c.fontSize >= 100;
        const font = heading ? kit.headingFont ?? kit.bodyFont : kit.bodyFont ?? kit.headingFont;
        const color = readable.length ? readable[textIdx++ % readable.length] : kit.colors.length ? fallbackText : undefined;
        const patch: Record<string, unknown> = {};
        if (font) patch.fontFamily = font;
        if (color) patch.color = color;
        if (Object.keys(patch).length) {
          useEditorStore.getState().patchClip(c.id, patch);
          changed++;
        }
      } else if (c.kind === "shape" && kit.colors.length) {
        const color = kit.colors[shapeIdx++ % kit.colors.length];
        const patch: Record<string, unknown> = {};
        if (c.fill) patch.fill = color;
        if (c.stroke) patch.stroke = { ...c.stroke, color };
        if (Object.keys(patch).length) {
          useEditorStore.getState().patchClip(c.id, patch);
          changed++;
        }
      }
    }
  });
  return changed;
}

/** Put the brand logo on the page, small, in the top-right corner. */
export function addBrandLogo(kit: BrandKit = useBrandStore.getState().kit): string | null {
  const store = useEditorStore.getState();
  if (!kit.logoMediaId || !store.media.some((m) => m.id === kit.logoMediaId)) return null;
  const id = store.addClipFromMedia(kit.logoMediaId, undefined, undefined, { layer: true });
  if (!id) return null;
  const s = useEditorStore.getState();
  const clip = s.clips.find((c) => c.id === id);
  if (clip) s.patchClip(id, { transform: { x: 0.88, y: 0.1, scale: 0.16, rotation: 0 } });
  return id;
}
