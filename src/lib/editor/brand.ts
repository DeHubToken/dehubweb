import { applyBrandStyles } from "./brandStyles";
import { commitCommand, type CommandCommit } from "./editorCommand";
/**
 * Apply the brand kit to the whole design in one undo step: headings (text of
 * 100px and up) take the heading font, other text the body font, and shapes
 * and text take brand colours in turn, keeping contrast with the background.
 */
import { useEditorStore } from "@/store/editorStore";
import { useBrandStore, type BrandKit } from "@/store/editorBrandStore";
import { findFontByCss, fontFamilyCss, loadGoogleFont, primaryFamily } from "./googleFonts";
import { importOneFile } from "./importFiles";

function ensureFont(css: string | null) {
  if (!css) return;
  const f = findFontByCss(css);
  if (f) loadGoogleFont(f.family, f.weights);
  else loadGoogleFont(primaryFamily(css), [400, 700, 900]);
}

export async function applyBrand(kit: BrandKit = useBrandStore.getState().kit, command?: CommandCommit): Promise<number> {
  const store = useEditorStore.getState();
  ensureFont(kit.headingFont);
  ensureFont(kit.bodyFont);
  let changed = 0;
  await commitCommand(command, () => store.runAsOneStep(() => {
    const before = useEditorStore.getState().toSnapshot(), next = applyBrandStyles(before, kit);
    next.clips.forEach((clip, index) => {
      if (clip !== before.clips[index]) { useEditorStore.getState().patchClip(clip.id, clip); changed++; }
    });
  }));
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

/** The official DeHub look: monochrome palette, Exo headings, Inter body, white wordmark. */
export const DEHUB_BRAND_COLORS = ["#ffffff", "#c9ccd1", "#6b6f76", "#1a1b1e", "#000000"];
const DEHUB_LOGO_URL = "/brand-kit/brand/wordmark-white.png";
const DEHUB_LOGO_NAME = "dehub-wordmark-white.png";

/**
 * One click: load the DeHub brand into the kit (adding the wordmark to Media
 * once), restyle the design with it and put the logo on. Returns the number of
 * layers restyled.
 */
export async function applyDehubBrand(): Promise<number> {
  const store = useEditorStore.getState();
  let logoMediaId = store.media.find((m) => m.name === DEHUB_LOGO_NAME)?.id ?? null;
  if (!logoMediaId) {
    try {
      const response = await fetch(DEHUB_LOGO_URL);
      if (response.ok) {
        const blob = await response.blob();
        logoMediaId = await importOneFile(new File([blob], DEHUB_LOGO_NAME, { type: blob.type || "image/png" }));
      }
    } catch { /* offline: the colours and fonts still apply */ }
  }
  const kit: BrandKit = {
    colors: DEHUB_BRAND_COLORS,
    headingFont: fontFamilyCss("Exo"),
    bodyFont: fontFamilyCss("Inter"),
    logoMediaId,
  };
  useBrandStore.getState().update(kit);
  const changed = await applyBrand(kit);
  addBrandLogo(kit);
  return changed;
}
