import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  claimHandoffVideo,
  isHandoffVideoActive,
  releaseHandoffVideo,
  subscribeHandoffVideo,
} from '@/lib/video-handoff';

/**
 * Binds a card to the shared `<video>` element for a post (see lib/video-handoff).
 *
 * The card renders an empty slot `<div>` and hands it here; the element itself is
 * never React's to own, which is the only way it can outlive the card that put it
 * on screen. Everything a `<video>` JSX tag used to declare — src, poster, muted,
 * loop, preload, className, the four media events — is applied to whatever element
 * the pool hands back, and only while this card is the one holding it.
 */
export interface UseHandoffVideoOptions {
  /** The ref the card already threads through its player logic. */
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  /** Post id. Cards showing the same post share one element. */
  handoffKey: string;
  /** Left undefined until the card decides the media may load. */
  src?: string;
  poster?: string;
  muted: boolean;
  loop: boolean;
  /** Narrower than `string` on purpose — this is assigned straight to `el.preload`. */
  preload: '' | 'none' | 'metadata' | 'auto';
  className: string;
  onEnded?: () => void;
  onError?: () => void;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onAdopt?: (el: HTMLVideoElement) => void;
  onPlaybackChange?: (playing: boolean) => void;
}

export function useHandoffVideo({
  videoRef,
  handoffKey,
  src,
  poster,
  muted,
  loop,
  preload,
  className,
  onEnded,
  onError,
  onTimeUpdate,
  onLoadedMetadata,
  onAdopt,
  onPlaybackChange,
}: UseHandoffVideoOptions) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const claimRef = useRef<{ key: string; token: object } | null>(null);

  // Read through a ref so the listeners below attach once per claim instead of
  // re-binding on every render that changes a callback identity.
  const handlersRef = useRef({ onEnded, onError, onTimeUpdate, onLoadedMetadata, onAdopt, onPlaybackChange });
  handlersRef.current = { onEnded, onError, onTimeUpdate, onLoadedMetadata, onAdopt, onPlaybackChange };

  /**
   * Whether this card is the one currently showing the element. Callers need it
   * to give up anything they hold globally on its behalf — audio ownership in
   * particular, which is tracked per card instance and would otherwise stay with
   * the feed while the post page plays.
   */
  const [isActive, setIsActive] = useState(false);

  // Bumped whenever the element changes hands, so the sync effect below re-runs
  // and this card re-applies its own attributes when it takes over.
  const [claimVersion, setClaimVersion] = useState(0);
  useEffect(
    () => subscribeHandoffVideo(handoffKey, () => {
      const active = isHandoffVideoActive(handoffKey, slotRef.current);
      videoRef.current = active ? elRef.current : null;
      if (active && elRef.current) handlersRef.current.onAdopt?.(elRef.current);
      setClaimVersion((v) => v + 1);
    }),
    [handoffKey],
  );

  /** Detaches the listeners bound to the element this card is currently holding. */
  const unbindRef = useRef<(() => void) | null>(null);
  const elRef = useRef<HTMLVideoElement | null>(null);
  const syncedClaimRef = useRef<object | null>(null);

  const attachSlot = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = claimRef.current;
      if (previous) {
        unbindRef.current?.();
        unbindRef.current = null;
        claimRef.current = null;
        videoRef.current = null;
        releaseHandoffVideo(previous.key, previous.token);
      }
      slotRef.current = node;
      if (!node) return;

      const { el, token } = claimHandoffVideo(handoffKey, node);
      claimRef.current = { key: handoffKey, token };
      elRef.current = el;
      // Set during the commit's ref phase, before this card's own effects and
      // before any sibling that reads the ref (the subtitle overlay) runs.
      videoRef.current = el;
      handlersRef.current.onAdopt?.(el);

      // Every listener no-ops unless this card currently holds the element.
      // Both cards stay subscribed while the post is open over the feed, and
      // only one of them should advance a progress bar or count a view.
      const owned = () => el.parentNode === slotRef.current;
      const ended = () => owned() && handlersRef.current.onEnded?.();
      const error = () => owned() && handlersRef.current.onError?.();
      const timeUpdate = () => owned() && handlersRef.current.onTimeUpdate?.();
      const loadedMetadata = () => owned() && handlersRef.current.onLoadedMetadata?.();
      const playback = () => owned() && handlersRef.current.onPlaybackChange?.(!el.paused);

      el.addEventListener('ended', ended);
      el.addEventListener('error', error);
      el.addEventListener('timeupdate', timeUpdate);
      el.addEventListener('loadedmetadata', loadedMetadata);
      el.addEventListener('play', playback);
      el.addEventListener('pause', playback);
      unbindRef.current = () => {
        el.removeEventListener('ended', ended);
        el.removeEventListener('error', error);
        el.removeEventListener('timeupdate', timeUpdate);
        el.removeEventListener('loadedmetadata', loadedMetadata);
        el.removeEventListener('play', playback);
        el.removeEventListener('pause', playback);
      };
    },
    [handoffKey, videoRef],
  );

  // React nulls a callback ref on unmount, so `attachSlot(null)` already releases
  // the claim. This is the belt-and-braces path for a StrictMode double-invoke.
  useEffect(
    () => () => {
      unbindRef.current?.();
      unbindRef.current = null;
      const held = claimRef.current;
      if (held) {
        claimRef.current = null;
        releaseHandoffVideo(held.key, held.token);
      }
    },
    [],
  );

  // Push this card's props onto the element it holds. Assignments are guarded on
  // change: re-assigning `src` restarts the download and throws away the buffer,
  // which is the whole thing this pool exists to avoid.
  useLayoutEffect(() => {
    const el = elRef.current;
    const active = !!el && isHandoffVideoActive(handoffKey, slotRef.current);

    // The card that is not showing the element must not be able to touch it.
    // Both cards are mounted while a post is open over the feed, and the feed
    // card's own autoplay/pause-when-offscreen logic is all written as
    // `if (videoRef.current)` — pointing its ref at nothing is what stops it
    // pausing, muting or seeking the copy the post page is playing. It gets the
    // element straight back when the post closes and the claim returns.
    videoRef.current = active ? el : null;
    setIsActive(active);
    if (!active || !el) return;
    const firstSync = syncedClaimRef.current !== claimRef.current?.token;
    syncedClaimRef.current = claimRef.current?.token ?? null;

    if (el.className !== className) el.className = className;
    const adoptingLoaded = firstSync && !!el.getAttribute('src');
    if (!adoptingLoaded && el.muted !== muted) el.muted = muted;
    if (!adoptingLoaded && el.loop !== loop) el.loop = loop;
    if (el.preload !== preload) el.preload = preload;
    if (poster) {
      if (el.poster !== poster && el.getAttribute('poster') !== poster) el.poster = poster;
    } else if (el.hasAttribute('poster')) {
      el.removeAttribute('poster');
    }
    if (src) {
      if (el.getAttribute('src') !== src) el.src = src;
    } else if (!firstSync && el.hasAttribute('src') && el.paused) {
      // The card has scrolled out of range and wants the media detached again.
      // Only reachable while this card holds the element, so a post page reading
      // the same clip can never have the source pulled out from under it — and
      // dropping the attribute alone does not free the decoder, the load() does.
      el.removeAttribute('src');
      el.load();
    }
  }, [videoRef, handoffKey, className, muted, loop, preload, poster, src, claimVersion]);

  return { attachSlot, isActive };
}
