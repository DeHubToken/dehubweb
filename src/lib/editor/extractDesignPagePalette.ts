import { requestDesignPagePreview } from "./designPagePreviews";
import { extractDominantColours } from "./paletteQuantization";
import type { ProjectSnapshot } from "./types";

export async function extractDesignPagePalette(project: ProjectSnapshot, time: number, signal: AbortSignal): Promise<string[]> {
  const source = await requestDesignPagePreview(project, time, 128, signal);
  return new Promise<string[]>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener("abort", cancel); image.src = ""; };
    const fail = (message: string) => { cleanup(); reject(new Error(message)); };
    const cancel = () => fail("Palette extraction cancelled"), timer = setTimeout(() => fail("Page colour extraction timed out"), 15000);
    image.onload = () => {
      try {
        if (signal.aborted) { cancel(); return; }
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, image.naturalWidth); canvas.height = Math.max(1, image.naturalHeight);
        const context = canvas.getContext("2d"); if (!context) throw new Error("Page colours are unavailable");
        context.drawImage(image, 0, 0); const colours = extractDominantColours(context.getImageData(0, 0, canvas.width, canvas.height).data);
        if (!colours.length) throw new Error("This page has no visible colours"); cleanup(); resolve(colours);
      } catch (reason) { fail(reason instanceof Error ? reason.message : "Could not read page colours"); }
    };
    image.onerror = () => fail("Could not read the page preview");
    signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel(); else image.src = source;
  });
}
