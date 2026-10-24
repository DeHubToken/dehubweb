/**
 * Creator Flow — pull a still out of a video, in the browser.
 * ===========================================================
 * Other tools do this server-side with ffmpeg. DeHub has
 * no such function and does not need one: a <video> element can seek and a
 * canvas can read the frame, as long as the clip is served with CORS — which
 * every URL that reaches a node here is (Supabase storage, or the provider
 * that rendered it).
 */
import { hostDataUrl } from '@/lib/creator/generationEngine';
import { translateCopy as _translateCopy } from '@/i18n/copy';

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const fail = () => reject(new Error(_translateCopy("copy.77d6f412627f", { defaultValue: "Could not load that video for frame capture." })));
    video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
    video.addEventListener('error', fail, { once: true });
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => resolve();
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => reject(new Error(_translateCopy("copy.7aacd91ad5d0", { defaultValue: "Seek failed." }))), { once: true });
    // A seek exactly at the end lands on nothing; nudge inside the clip.
    const max = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : seconds;
    video.currentTime = Math.min(Math.max(0, seconds), max);
  });
}

/** Duration in seconds, or null if the browser cannot say. */
export async function readVideoDuration(url: string): Promise<number | null> {
  try {
    const video = await loadVideo(url);
    const d = video.duration;
    video.removeAttribute('src');
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Capture the frame at `seconds` (or the last frame when `last` is set) and
 * host it, returning a durable https URL a generator can take as an input.
 */
export async function captureVideoFrame(
  url: string,
  options: { seconds?: number; last?: boolean } = {},
): Promise<string> {
  const video = await loadVideo(url);
  try {
    const at = options.last ? (Number.isFinite(video.duration) ? video.duration : 0) : (options.seconds ?? 0);
    await seek(video, at);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(_translateCopy("copy.b85f3cb0c6c2", { defaultValue: "Canvas unavailable." }));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      throw new Error(_translateCopy("copy.b362c76d5af4", { defaultValue: "That video does not allow frame capture (no CORS). Upload it as a file instead." }));
    }
    return await hostDataUrl(dataUrl);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
