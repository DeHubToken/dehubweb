import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { animate, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion';
import { containedPicture } from '@/lib/live-overlay/layout';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { visualActivity } from '@/lib/visual-activity';

/** Keep the viewer and its media mounted while its frame moves over the feed. */
/**
 * `wideOnly`: phones keep drag-down for paging back (and leaving from the first
 * short), so only a wide or square picture minimizes there, as in the app.
 */
export function useInAppVideoMini(root: RefObject<HTMLElement | null>, index: number, enabled: boolean, wideOnly = false) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const resets = useRef<Array<{ stop: () => void }>>([]);
  const origin = useRef<number | null>(null);
  const scale = useMotionValue(1);
  const y = useMotionValue(0);
  const reveal = useMotionValue(0);
  const backdropOpacity = useTransform(reveal, value => 1 - value);
  const chromeOpacity = useTransform(reveal, value => 1 - Math.min(1, value * 3));
  const minimized = aspect !== null;
  const owner = useId();
  useEffect(() => {
    const player = () => root.current?.querySelector<HTMLVideoElement>(`[data-shorts-slide="${index}"] video`) ?? null;
    videoPlaybackManager.register(owner, () => player()?.pause(), muted => { const video = player(); if (video) video.muted = muted; }, () => true, player);
    videoPlaybackManager.play(owner);
    if (!visualActivity.isCallBusy()) videoPlaybackManager.claimAudio(owner);
    return () => videoPlaybackManager.unregister(owner);
  }, [root, index, owner]);
  const reducedMotion = useReducedMotion();
  useEffect(() => () => { resets.current.forEach(animation => animation.stop()); }, []);
  useEffect(() => {
    if (minimized) return;
    const release = lockBodyScroll('shorts-viewer');
    document.body.classList.add('shorts-viewer-open');
    return () => { release(); document.body.classList.remove('shorts-viewer-open'); };
  }, [minimized]);
  const reset = useCallback(() => {
    resets.current.forEach(animation => animation.stop());
    resets.current = [
      animate(scale, 1, { duration: 0.18 }),
      animate(y, 0, { duration: 0.18 }),
      animate(reveal, 0, { duration: 0.18, onComplete: () => { draggingRef.current = false; setDragging(false); } }),
    ];
    origin.current = null;
  }, [scale, y, reveal]);
  const start = useCallback((event: Event, info: PanInfo) => {
    resets.current.forEach(animation => animation.stop());
    origin.current = null;
    if (!enabled || minimized || (event.target as Element | null)?.closest('button, a, input, [data-shorts-scrollable]')) return;
    const video = root.current?.querySelector<HTMLVideoElement>(`[data-shorts-slide="${index}"] video`);
    if (!video?.videoWidth || !video.videoHeight) return;
    if (wideOnly && video.videoWidth < video.videoHeight) return;
    const box = video.getBoundingClientRect();
    const picture = containedPicture(box.width, box.height, video.videoWidth, video.videoHeight);
    const x = info.point.x - window.scrollX - info.offset.x;
    const y = info.point.y - window.scrollY - info.offset.y;
    if (x >= box.left + picture.left && x <= box.left + picture.left + picture.width &&
        y >= box.top + picture.top && y <= box.top + picture.top + picture.height) {
      origin.current = video.videoWidth / video.videoHeight;
    }
  }, [enabled, minimized, root, index, wideOnly]);
  const drag = useCallback((info: PanInfo) => {
    if (origin.current === null) return false;
    if (info.offset.y <= 0 || Math.abs(info.offset.x) > info.offset.y) {
      scale.set(1);
      y.set(0);
      reveal.set(0);
      return false;
    }
    if (!draggingRef.current) { draggingRef.current = true; setDragging(true); }
    reveal.set(Math.min(1, info.offset.y / 160));
    if (!reducedMotion) {
      scale.set(1 - Math.min(0.55, info.offset.y / Math.max(window.innerHeight, 1)));
      y.set(info.offset.y * 0.5);
    }
    return true;
  }, [scale, y, reveal, reducedMotion]);
  const finish = useCallback((info: PanInfo) => {
    const ratio = origin.current;
    const pictureDrag = ratio !== null && info.offset.y > 0 && info.offset.y > Math.abs(info.offset.x);
    // Use the viewer's existing swipe distances; these are interaction defaults.
    if (pictureDrag && (info.offset.y > 80 || info.velocity.y > 300)) {
      scale.set(1);
      y.set(0);
      reveal.set(0);
      draggingRef.current = false;
      setDragging(false);
      setAspect(ratio);
      origin.current = null;
      return true;
    }
    reset();
    return pictureDrag;
  }, [reset, scale, y, reveal]);
  const restore = useCallback(() => setAspect(null), []);
  const width = Math.min(240, window.innerWidth * 0.5, 240 * (aspect ?? 1));
  return { minimized, dragging, backdropOpacity, chromeOpacity, reducedMotion, scale, y, start, drag, finish, cancel: reset, restore,
    frame: aspect === null ? undefined : {
      top: 'auto', left: 'auto', right: 12, bottom: 'calc(84px + env(safe-area-inset-bottom))',
      width, height: width / aspect, borderRadius: 12, overflow: 'hidden' as const,
    },
  };
}
