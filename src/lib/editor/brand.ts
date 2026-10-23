import { applyBrandStyles } from "./brandStyles";
import { commitCommand, type CommandCommit } from "./editorCommand";
/**
 * Apply the brand kit to the whole design in one undo step: headings (text of
 * 100px and up) take the heading font, other text the body font, and shapes
 * and text take brand colours in turn, keeping contrast with the background.
 */
import { useEditorStore } from "@/store/editorStore";
import { useBrandStore, type BrandKit } from "@/store/editorBrandStore";
import { findFontByCss, loadGoogleFont, primaryFamily } from "./googleFonts";

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
