/**
 * Creator Flow — pull a still out of a video, in the browser.
 * ===========================================================
 * HeliosGen does this server-side with ffmpeg (/api/extract-frame). DeHub has
 * no such function and does not need one: a <video> element can seek and a
 * canvas can read the frame, as long as the clip is served with CORS — which
 * every URL that reaches a node here is (Supabase storage, or the provider
 * that rendered it).
 */
import { hostDataUrl } from '@/lib/creator/generationEngine';

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const fail = () => reject(new Error('Could not load that video for frame capture.'));
    video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
    video.addEventListener('error', fail, { once: true });
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => resolve();
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', () => reject(new Error('Seek failed.')), { once: true });
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
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      throw new Error('That video does not allow frame capture (no CORS). Upload it as a file instead.');
    }
    return await hostDataUrl(dataUrl);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
