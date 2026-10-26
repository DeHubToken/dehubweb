import type { FramePixels } from "./clipTools";
import { waitForVideoFrame } from "./videoFrame";

/** Small RGBA samples of a video at the given source times, for bar detection. */
export async function sampleVideoFrames(url: string, times: number[], signal?: AbortSignal): Promise<FramePixels[]> {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto"; video.crossOrigin = "anonymous";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) { resolve(); return; }
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Video could not be read")), { once: true });
    });
    const width = Math.min(240, video.videoWidth || 240);
    const height = Math.max(2, Math.round(width * (video.videoHeight || 1) / (video.videoWidth || 1)));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    const frames: FramePixels[] = [];
    for (const time of times) {
      await waitForVideoFrame(video, Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.05)), { signal, forCanvasRead: true, timeoutMs: 8000 });
      ctx.drawImage(video, 0, 0, width, height);
      frames.push(ctx.getImageData(0, 0, width, height));
    }
    return frames;
  } finally {
    video.removeAttribute("src"); video.load();
  }
}
