/**
 * Frozen live picture detection
 * =============================
 * A live player can stop moving without a single event saying so. iOS
 * Safari's native HLS sits on `waiting` for good after a missed playlist
 * refresh, and a WebRTC session can stay "connected" while no frame arrives.
 * The viewer sees a still picture and nothing ever recovers it.
 *
 * This watches the element instead of its events: while the video is meant to
 * be running (not paused, page visible) it checks every couple of seconds
 * whether the clock or the decoded frame count moved. When neither has for
 * `stallMs`, `onStall` gets called with how many stalls in a row this is, so
 * the caller can escalate (jump to live edge first, reload after).
 */

export interface LiveStallWatchOptions {
  /** How long without progress counts as frozen. */
  stallMs: number;
  /** Called on each freeze; `count` is 1 for the first in a row. */
  onStall: (count: number) => void;
  /** Extra gate, e.g. "playback was requested". Defaults to always. */
  shouldWatch?: () => boolean;
}

const CHECK_EVERY_MS = 2000;

function decodedFrames(video: HTMLVideoElement): number {
  try {
    return video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
  } catch {
    return 0;
  }
}

export function watchLiveProgress(
  video: HTMLVideoElement,
  { stallMs, onStall, shouldWatch }: LiveStallWatchOptions,
): () => void {
  let lastTime = video.currentTime;
  let lastFrames = decodedFrames(video);
  let stillFor = 0;
  let stalls = 0;

  const rebase = () => {
    lastTime = video.currentTime;
    lastFrames = decodedFrames(video);
    stillFor = 0;
  };

  const tick = () => {
    const watching =
      !video.paused &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      (shouldWatch?.() ?? true);
    if (!watching) {
      rebase();
      return;
    }
    const time = video.currentTime;
    const frames = decodedFrames(video);
    if (time !== lastTime || frames !== lastFrames) {
      lastTime = time;
      lastFrames = frames;
      stillFor = 0;
      stalls = 0;
      return;
    }
    stillFor += CHECK_EVERY_MS;
    if (stillFor >= stallMs) {
      stillFor = 0;
      stalls += 1;
      onStall(stalls);
    }
  };

  const id = setInterval(tick, CHECK_EVERY_MS);
  // Coming back to the page is a fresh start, not a stall that lasted the
  // whole time the tab was away.
  const onVisible = () => rebase();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Live edge of a native HLS element, a couple of seconds back so it can play. */
export function nativeLiveEdge(video: HTMLVideoElement): number | null {
  const ranges = video.seekable;
  if (!ranges || ranges.length === 0) return null;
  const end = ranges.end(ranges.length - 1);
  return Number.isFinite(end) && end > 0 ? Math.max(ranges.start(0), end - 2) : null;
}
