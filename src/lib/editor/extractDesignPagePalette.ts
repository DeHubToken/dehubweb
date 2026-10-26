import { requestDesignPagePreview } from "./designPagePreviews";
import { extractDominantColours } from "./paletteQuantization";
import type { ProjectSnapshot } from "./types";
import { EditorError } from "./editorError";

export async function extractDesignPagePalette(project: ProjectSnapshot, time: number, signal: AbortSignal): Promise<string[]> {
  const source = await requestDesignPagePreview(project, time, 128, signal);
  return new Promise<string[]>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener("abort", cancel); image.src = ""; };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const cancel = () => fail(new Error("Palette extraction cancelled")), timer = setTimeout(() => fail(new EditorError("copy.35c66cde2823", "Page colour extraction timed out")), 15000);
    image.onload = () => {
      try {
        if (signal.aborted) { cancel(); return; }
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, image.naturalWidth); canvas.height = Math.max(1, image.naturalHeight);
        const context = canvas.getContext("2d"); if (!context) throw new EditorError("copy.26523ff5a2cb", "Page colours are unavailable");
        context.drawImage(image, 0, 0); const colours = extractDominantColours(context.getImageData(0, 0, canvas.width, canvas.height).data);
        if (!colours.length) throw new EditorError("copy.e4e51c7bf013", "This page has no visible colours"); cleanup(); resolve(colours);
      } catch (reason) { fail(reason instanceof Error ? reason : new EditorError("copy.3779c1aa6862", "Could not read page colours")); }
    };
    image.onerror = () => fail(new EditorError("copy.aa3a73794233", "Could not read the page preview"));
    signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel(); else image.src = source;
  });
}
