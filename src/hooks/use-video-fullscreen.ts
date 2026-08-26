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
export function useVideoFullscreen(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
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

    setIsFullscreen(true);
  }, [isFullscreen, videoRef, containerRef]);

  return { isFullscreen, toggleFullscreen, setIsFullscreen };
}
