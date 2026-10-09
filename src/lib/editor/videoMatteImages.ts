import type { MediaItem } from "./types";
import type { VideoMatteFrame } from "./videoMattePageCache";

export function loadVideoMatteImage(media: MediaItem[], frame: VideoMatteFrame, signal?: AbortSignal): Promise<HTMLImageElement> {
  const source = media.find(m => m.id === frame.mediaId && m.kind === "image" && m.width === frame.atlasWidth && m.height === frame.atlasHeight);
  if (!source) return Promise.reject(new Error("Background page is missing"));
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!source.url.startsWith("blob:")) image.crossOrigin = "anonymous";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true;
      clearTimeout(timer); signal?.removeEventListener("abort", abort); image.onload = null; image.onerror = null;
      if (error) { image.src = ""; reject(error); } else resolve(image);
    };
    const abort = () => finish(new DOMException("Background page load cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Background page did not load")), 30000);
    image.onload = () => finish(); image.onerror = () => finish(new Error("Background page could not be decoded"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    image.src = source.url;
  });
}
