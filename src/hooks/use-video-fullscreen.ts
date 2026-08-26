import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Fullscreen for a video player, with the fallbacks that actually matter.
 *
 * Three environments need three different things, and the wrong one fails
 * silently rather than throwing:
 *
 * - **iOS Safari on iPhone** has no element fullscreen at all. Only
 *   `webkitEnterFullscreen()` on the `<video>` itself works, and it reports
 *   through `webkitbeginfullscreen`/`webkitendfullscreen` on the element rather
 *   than `fullscreenchange` on the document.
 * - **Embedded WebViews** (SafePal's in particular) expose `requestFullscreen`
 *   and then do nothing — the promise resolves and no fullscreen happens. The
 *   300ms re-check catches that and falls back to simulated fullscreen.
 * - **Everything else** takes the standard API on the container, so the
 *   player's own controls come with it rather than being left behind.
 *
 * "Simulated fullscreen" is the caller's job: when `isFullscreen` is true and
 * `document.fullscreenElement` is null, the caller pins its container with
 * `fixed inset-0 z-[9999]`. That is the only thing that works in a WebView.
 */
/**
 * Whether a real, native fullscreen is reachable in this browser.
 *
 * Callers that refuse the simulated fallback use this to decide whether to draw
 * a control at all — a button that provably cannot do anything is worse than no
 * button. Feature-detected off the prototype so it can be called during render,
 * before any ref is attached.
 */
export function canNativeFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenEnabled ||
    (document as any).webkitFullscreenEnabled ||
    typeof (HTMLVideoElement.prototype as any).webkitEnterFullscreen === 'function'
  );
}

export interface VideoFullscreenOptions {
  /**
   * Whether the caller can actually paint a simulated fullscreen.
   *
   * It pins the container with `fixed inset-0`, and **a transformed ancestor
   * makes `fixed` resolve against that ancestor instead of the viewport**. The
   * shorts carousel animates every slide with `translateY`, so a pinned slide
   * would be laid out inside the moving wrapper and land somewhere arbitrary.
   * Those callers pass `false` and get nothing rather than something broken —
   * native fullscreen puts the element in the top layer, where no ancestor
   * transform applies, so the real path is unaffected either way.
   */
  allowSimulated?: boolean;
}

export function useVideoFullscreen(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  { allowSimulated = true }: VideoFullscreenOptions = {},
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || (document as any).webkitFullscreenElement),
      );
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // iOS fires these on the video element itself, not the document.
    const videoEl = videoRef.current;
    const onIOSFullscreen = () => setIsFullscreen(true);
    const onIOSExitFullscreen = () => setIsFullscreen(false);
    videoEl?.addEventListener('webkitbeginfullscreen', onIOSFullscreen);
    videoEl?.addEventListener('webkitendfullscreen', onIOSExitFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      videoEl?.removeEventListener('webkitbeginfullscreen', onIOSFullscreen);
      videoEl?.removeEventListener('webkitendfullscreen', onIOSExitFullscreen);
    };
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const videoEl = videoRef.current as any;
    const containerEl = containerRef.current as any;

    // Leaving simulated fullscreen: there is no native state to exit.
    if (
      isFullscreen &&
      !document.fullscreenElement &&
      !(document as any).webkitFullscreenElement
    ) {
      setIsFullscreen(false);
      return;
    }

    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      return;
    }

    if (videoEl && typeof videoEl.webkitEnterFullscreen === 'function') {
      try {
        videoEl.webkitEnterFullscreen();
        return;
      } catch {
        // Fall through to container fullscreen or simulated.
      }
    }

    if (containerEl) {
      const activateSimulated = () => {
        if (!allowSimulated) return;
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          setIsFullscreen(true);
        }
      };
      if (containerEl.requestFullscreen) {
        containerEl.requestFullscreen().catch(activateSimulated);
        setTimeout(activateSimulated, 300);
        return;
      } else if (containerEl.webkitRequestFullscreen) {
        try {
          containerEl.webkitRequestFullscreen();
        } catch {
          activateSimulated();
        }
        setTimeout(activateSimulated, 300);
        return;
      }
    }

    if (allowSimulated) setIsFullscreen(true);
  }, [isFullscreen, videoRef, containerRef, allowSimulated]);

  return { isFullscreen, toggleFullscreen, setIsFullscreen };
}
