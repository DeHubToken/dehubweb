import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export function canNativeFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled
    || typeof (HTMLVideoElement.prototype as any).webkitEnterFullscreen === 'function');
}
export interface VideoFullscreenOptions {
  allowSimulated?: boolean;
  /** Keep the fallback outside transformed or clipped feed ancestors. */
  escapeAncestors?: boolean;
}
/** Move the existing player without replacing its media connection. */
export function liftFullscreenElement(element: HTMLElement): () => void {
  const parent = element.parentNode;
  if (!parent) return () => {};
  const placeholder = document.createElement('div');
  placeholder.style.height = `${element.getBoundingClientRect().height}px`;
  placeholder.setAttribute('aria-hidden', 'true');
  parent.insertBefore(placeholder, element);
  document.body.appendChild(element);
  return () => {
    if (placeholder.parentNode) placeholder.parentNode.insertBefore(element, placeholder);
    placeholder.remove();
  };
}
export function useVideoFullscreen(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  { allowSimulated = true, escapeAncestors = false }: VideoFullscreenOptions = {},
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const generation = useRef(0);
  const restore = useRef<(() => void) | null>(null);
  const simulated = useRef(false);
  const cancelPending = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const restoreInline = useCallback(() => {
    restore.current?.(); restore.current = null; simulated.current = false;
  }, []);
  // Restore before React removes its children, including on route changes.
  useLayoutEffect(() => () => { cancelPending(); restoreInline(); }, [cancelPending, restoreInline]);
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const own = !!active && (active === containerRef.current || active === videoRef.current);
      cancelPending();
      if (!own) restoreInline();
      setIsFullscreen(own);
    };
    const video = videoRef.current;
    const onIOSFullscreen = () => { cancelPending(); setIsFullscreen(true); };
    const onIOSExit = () => { cancelPending(); restoreInline(); setIsFullscreen(false); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && simulated.current) {
        cancelPending(); restoreInline(); setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    video?.addEventListener('webkitbeginfullscreen', onIOSFullscreen);
    video?.addEventListener('webkitendfullscreen', onIOSExit);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
      video?.removeEventListener('webkitbeginfullscreen', onIOSFullscreen);
      video?.removeEventListener('webkitendfullscreen', onIOSExit);
    };
  }); // A gated or loading stream can mount its video after the first render.
  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current as any;
    const container = containerRef.current as any;
    const active = document.fullscreenElement || (document as any).webkitFullscreenElement;
    cancelPending();
    if (video?.webkitDisplayingFullscreen) { video.webkitExitFullscreen?.(); return; }
    if (active === container && active) {
      try {
        const result = document.exitFullscreen ? document.exitFullscreen() : (document as any).webkitExitFullscreen?.();
        result?.catch?.(() => {});
      } catch {}
      return;
    }
    if (isFullscreen || simulated.current) { restoreInline(); setIsFullscreen(false); return; }
    if (!container) return;
    if (typeof video?.webkitEnterFullscreen === 'function') {
      try { video.webkitEnterFullscreen(); return; } catch { /* Try the container next. */ }
    }
    const requestGeneration = generation.current;
    const activateSimulated = () => {
      if (requestGeneration !== generation.current || !allowSimulated || simulated.current) return;
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) return;
      simulated.current = true;
      if (escapeAncestors) restore.current = liftFullscreenElement(container);
      setIsFullscreen(true);
    };
    try {
      const request = container.requestFullscreen || container.webkitRequestFullscreen;
      if (request) {
        const result = request.call(container);
        result?.catch?.(activateSimulated);
        timer.current = setTimeout(activateSimulated, 300);
        return;
      }
    } catch { /* Synchronous rejection uses the same fallback. */ }
    activateSimulated();
  }, [isFullscreen, videoRef, containerRef, allowSimulated, escapeAncestors, cancelPending, restoreInline]);
  return { isFullscreen, toggleFullscreen, setIsFullscreen };
}
