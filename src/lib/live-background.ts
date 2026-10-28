/**
 * Keeping a live up while the viewer is somewhere else
 * ====================================================
 *
 * A live has no "where you left off": pausing it when the tab is hidden, or
 * tearing the player down, is the same as walking the viewer out of the room.
 * So an opened live keeps playing in the background (browsers let audible
 * media run in a hidden tab), offers Picture in Picture, and goes to it by
 * itself when the tab is switched where the browser allows that:
 *
 * - Chrome / Edge desktop (and Chrome Android): the Media Session
 *   `enterpictureinpicture` action. The browser calls it when the tab is
 *   hidden while the video plays with sound; the user can turn it off per
 *   site from the PiP window.
 * - Safari (macOS / iPadOS): the `autopictureinpicture` attribute. iPhone
 *   Safari goes to PiP on Home/app switch for a playing inline video when the
 *   user has "Start PiP automatically" on.
 * - Firefox: no page API. Its own "PiP on tab switch" setting works on any
 *   playing video; otherwise the audio keeps playing in the background.
 * - Samsung Internet: follows Chrome Android (PiP button works; auto-PiP from
 *   the media notification / Home gesture when the video is playing).
 *
 * Whatever the browser does, coming back must not show a spinner: the player
 * is never torn down, and an HLS player that fell behind while timers were
 * throttled jumps back to the live edge.
 */
import { useEffect, type RefObject } from 'react';
import type Hls from 'hls.js';
import { isVideoInPictureInPicture } from './picture-in-picture';

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  autoPictureInPicture?: boolean;
};

export function canPictureInPicture(video: HTMLVideoElement | null): boolean {
  if (typeof document === 'undefined') return false;
  if (document.pictureInPictureEnabled) return true;
  const v = video as WebkitVideo | null;
  return !!v?.webkitSupportsPresentationMode?.('picture-in-picture');
}

export async function togglePictureInPicture(video: HTMLVideoElement | null): Promise<void> {
  if (!video) return;
  const v = video as WebkitVideo;
  try {
    if (isVideoInPictureInPicture(video)) {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else v.webkitSetPresentationMode?.('inline');
      return;
    }
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
      await video.requestPictureInPicture();
    } else {
      v.webkitSetPresentationMode?.('picture-in-picture');
    }
  } catch {
    /* Refused (no user gesture, no frames yet, disabled by the user). */
  }
}

type PipSession = MediaSession & { setActionHandler(action: string, handler: (() => void) | null): void };
/** The video whose handler is installed, so a stale cleanup can't clear a newer one. */
let autoPipOwner: HTMLVideoElement | null = null;

/**
 * Let the browser put this video in PiP by itself when the tab is switched,
 * while `enabled` (the live is playing). Opened viewers only: the feed keeps
 * its rule of never jumping into PiP on its own.
 */
export function useAutoPictureInPicture(ref: RefObject<HTMLVideoElement | null>, enabled: boolean): void {
  useEffect(() => {
    const video = ref.current as WebkitVideo | null;
    if (!video || !enabled) return;
    video.setAttribute('autopictureinpicture', '');
    try { video.autoPictureInPicture = true; } catch { /* read-only elsewhere */ }
    const session = typeof navigator !== 'undefined' && 'mediaSession' in navigator
      ? (navigator.mediaSession as PipSession)
      : null;
    let installed = false;
    try {
      session?.setActionHandler('enterpictureinpicture', () => {
        if (!isVideoInPictureInPicture(video)) void video.requestPictureInPicture?.().catch(() => undefined);
      });
      installed = !!session;
      autoPipOwner = video;
    } catch {
      /* This browser has no automatic PiP action. */
    }
    return () => {
      video.removeAttribute('autopictureinpicture');
      try { video.autoPictureInPicture = false; } catch { /* ignore */ }
      if (installed && autoPipOwner === video) {
        autoPipOwner = null;
        try { session?.setActionHandler('enterpictureinpicture', null); } catch { /* ignore */ }
      }
    };
  }, [ref, enabled]);
}

/**
 * Back on the live edge after the tab was in the background. hls.js keeps
 * loading while hidden, but throttled timers can leave it a long way behind;
 * native HLS (Safari) can drift the same way. WebRTC is always live.
 */
export function catchUpToLiveEdge(video: HTMLVideoElement, hls?: Hls | null): void {
  if (video.srcObject) return;
  let edge: number | null = null;
  const sync = hls?.liveSyncPosition;
  if (typeof sync === 'number' && Number.isFinite(sync)) edge = sync;
  else if (video.seekable.length) edge = video.seekable.end(video.seekable.length - 1) - 3;
  if (edge == null || !Number.isFinite(edge)) return;
  // A few seconds behind is normal HLS latency; only jump a real gap.
  if (edge - video.currentTime > 8) video.currentTime = edge;
}

/** Runs when the tab comes back into view (tab switch, app switch, bfcache restore). */
export function onReturnToTab(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onVisibility = () => { if (document.visibilityState === 'visible') callback(); };
  const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) callback(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
  };
}
