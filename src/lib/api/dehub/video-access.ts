/**
 * Gated video playback
 * ====================
 * A pay-per-view, hold-gated, subscriber-only, followers-only or direct
 * post's video is stored private, so the CDN URL built from its token id
 * is refused. Once the viewer is through the gate, the player asks the API
 * for a short-lived signed URL and plays that instead. Open posts never call
 * this.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiCall } from './core';
import { isHoldGated } from '@/lib/content-gate';

export interface VideoAccess {
  url: string;
  /** False when the post is open and `url` is the plain CDN file. */
  private: boolean;
  /** When a signed `url` stops working; null for a CDN URL. */
  expiresAt: string | null;
}

/** Fetch a fresh URL this long before the signed one lapses. */
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/**
 * Whether the post's file is gated at all, before the viewer's own unlock
 * state. The same test the gated audio player uses.
 */
export function videoNeedsAccess(post: {
  isPPV?: boolean;
  isLocked?: boolean;
  lockedPrice?: number | string | null;
  subscriberPlans?: unknown[] | null;
  /** A followers-only or direct post's video is stored private as well. */
  visibility?: string | null;
}): boolean {
  return (!!post.visibility && post.visibility !== 'public') || !!post.isPPV || isHoldGated(post.isLocked, post.lockedPrice) || !!post.subscriberPlans?.length;
}

export function fetchVideoAccess(tokenId: string): Promise<VideoAccess> {
  return apiCall<VideoAccess>(`/api/nfts/video/${encodeURIComponent(tokenId)}/access`, { requiresAuth: true });
}

/** True once a signed URL is close enough to lapsing that a failure is probably the signature. */
export function isVideoAccessExpiring(access: VideoAccess | null | undefined, now = Date.now()): boolean {
  return !!access?.expiresAt && Date.parse(access.expiresAt) - now < EXPIRY_MARGIN_MS;
}

export function useVideoAccess(tokenId: string | undefined, enabled: boolean, viewerKey?: string | null) {
  return useQuery({
    queryKey: ['video-access', tokenId, viewerKey || 'anonymous'],
    queryFn: () => fetchVideoAccess(tokenId!),
    enabled: enabled && !!tokenId,
    // Fresh until shortly before the signature lapses: a remount reuses it,
    // and a page left open picks up a new one.
    staleTime: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      return expiresAt ? Math.max(0, Date.parse(expiresAt) - Date.now() - EXPIRY_MARGIN_MS) : Infinity;
    },
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

const sameFile = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
};

/**
 * Keeps a `<video>` where it was when its signed URL is swapped for a fresh
 * signature of the same file — reassigning `src` would otherwise start it
 * over. Call it before the hook that assigns `src`, so it reads the position
 * while the element still holds the old URL.
 */
export function useResumeAcrossRefresh(videoRef: RefObject<HTMLVideoElement | null>, src: string | undefined) {
  const previous = useRef(src);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = src;
    const el = videoRef.current;
    if (!el || !before || !src || before === src || !sameFile(before, src)) return;
    if (el.getAttribute('src') !== before) return;
    const time = el.currentTime;
    const playing = !el.paused;
    if (!(time > 0) && !playing) return;
    el.addEventListener('loadedmetadata', () => {
      if (el.getAttribute('src') !== src) return;
      if (time > 0 && time < el.duration) el.currentTime = time;
      if (playing) el.play().catch(() => {});
    }, { once: true });
  }, [videoRef, src]);
}
