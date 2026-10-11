import type { VideoDownloadRequest } from "./downloadProject";
import { downloadProject } from "./downloadProject";
import { readEndingBoundary } from "./endingFile";
import { legacyEndingBoundary } from "./endingVisual";
import { loadBrandOutroArtwork } from "./brandOutroArtwork";
import { drawBrandOutro } from "./brandOutro";

export async function renderVideoDownload(request: VideoDownloadRequest, signal: AbortSignal, onProgress?: (fraction: number, label?: string) => void) {
  const { exportProject, isExportSupported } = await import("./exporter");
  if (!isExportSupported()) throw new Error("Video export is unavailable in this browser");
  signal.throwIfAborted();
  const response = await fetch(request.url, { signal });
  if (!response.ok) throw new Error("Video download failed: " + response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        video.onloadeddata = null; video.onerror = null;
        error ? reject(error) : resolve();
      };
      const abort = () => finish(new DOMException("Download cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Video metadata did not load")), 20000);
      video.onloadeddata = () => finish();
      video.onerror = () => finish(new Error("Video could not be decoded"));
      signal.addEventListener("abort", abort, { once: true });
      video.src = url;
      if (signal.aborted) abort();
    });
    const duration = video.duration;
    const tail = new Uint8Array(await blob.slice(-48).arrayBuffer());
    let boundary = readEndingBoundary(tail, duration);
    if (boundary == null) {
      const artwork = await loadBrandOutroArtwork();
      boundary = await legacyEndingBoundary(video, artwork.logo, drawBrandOutro, signal);
    }
    const contentDuration = boundary ?? duration;
    const snapshot = downloadProject("download-source", { duration, width: video.videoWidth, height: video.videoHeight }, request.title, contentDuration);
    return await exportProject({
      snapshot, media: [{ id: "download-source", name: request.title || "video", kind: "video", url, mimeType: blob.type || "video/mp4", size: blob.size, duration, createdAt: Date.now() }],
      format: "mp4", scale: 1, videoBitrate: 8_000_000, username: request.username, signal,
      onProgress: (p, label) => onProgress?.(p, label),
    });
  } finally { video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
