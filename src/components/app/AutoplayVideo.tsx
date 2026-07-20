/**
 * Autoplay Video Component
 * ========================
 * Lazy-loading video that only plays when visible on screen.
 * Uses IntersectionObserver to start/stop playback and control preloading.
 * Shows a skeleton shimmer while the video is loading.
 * Prevents bandwidth waste from off-screen videos.
 */

import { useRef, useEffect, useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { VideoGlitchLoader } from '@/components/app/video/VideoGlitchLoader';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';

interface AutoplayVideoProps {
  src: string;
  poster?: string;
  className?: string;
  /** How much of the video must be visible to trigger play (0-1). Default 0.5 */
  threshold?: number;
  /** Root margin for earlier/later trigger. Default "100px" */
  rootMargin?: string;
  /** When true, video won't load or play regardless of visibility. Used for staged loading. */
  disabled?: boolean;
  /**
   * Opt-in concurrency cap: instances sharing a group name compete for
   * playback and only the MAX_GROUP_PLAYING most-visible actually play —
   * the rest hold a still frame. A strip of 10 looping shorts would
   * otherwise run 3-5 simultaneous video decodes and tank mid-range
   * mobile to ~30fps. Omit for the normal single-video behavior.
   */
  playbackGroup?: string;
}

// ─── Playback group arbiter (module-level) ──────────────────────────────────
interface GroupMember {
  ratio: number;
  allowed: boolean;
  setAllowed: (v: boolean) => void;
}
const playbackGroups = new Map<string, Set<GroupMember>>();
const MAX_GROUP_PLAYING = 2;
// Fine-grained thresholds so intersectionRatio updates as tiles scroll,
// letting the arbiter track which tiles are most visible.
const GROUP_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

function recomputeGroup(group: string) {
  const members = playbackGroups.get(group);
  if (!members) return;
  const winners = new Set(
    [...members]
      .filter(m => m.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, MAX_GROUP_PLAYING)
  );
  members.forEach(m => {
    const next = winners.has(m);
    if (m.allowed !== next) {
      m.allowed = next;
      m.setAllowed(next);
    }
  });
}

export const AutoplayVideo = memo(function AutoplayVideo({
  src,
  poster: posterProp,
  className,
  threshold = 0.5,
  rootMargin = '100px',
  disabled = false,
  playbackGroup,
}: AutoplayVideoProps) {
  // Shorts thumbnails may live at shorts/{id}.jpg instead of the mapped
  // images/{id}.jpg — resolve to whichever exists so the poster isn't a 403.
  const poster = useResolvedThumbnail(posterProp);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Grouped instances start un-allowed until the arbiter grants a slot
  const [groupAllowed, setGroupAllowed] = useState(!playbackGroup);
  const memberRef = useRef<GroupMember | null>(null);

  // Register with the playback group (if any)
  useEffect(() => {
    if (!playbackGroup) {
      setGroupAllowed(true);
      return;
    }
    const member: GroupMember = { ratio: 0, allowed: false, setAllowed: setGroupAllowed };
    memberRef.current = member;
    let members = playbackGroups.get(playbackGroup);
    if (!members) {
      members = new Set();
      playbackGroups.set(playbackGroup, members);
    }
    members.add(member);
    setGroupAllowed(false);
    recomputeGroup(playbackGroup);
    return () => {
      members!.delete(member);
      memberRef.current = null;
      if (members!.size === 0) playbackGroups.delete(playbackGroup);
      else recomputeGroup(playbackGroup);
    };
  }, [playbackGroup]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (playbackGroup) {
          const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
          if (memberRef.current) {
            memberRef.current.ratio = ratio;
            recomputeGroup(playbackGroup);
          }
          setIsVisible(entry.isIntersecting && ratio >= threshold);
        } else {
          setIsVisible(entry.isIntersecting);
        }
      },
      { threshold: playbackGroup ? GROUP_THRESHOLDS : threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, playbackGroup]);

  // Play/pause based on visibility, disabled state, and group slot
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible && !disabled && groupAllowed) {
      // Delay lets src settle after layout shifts (sidebar collapse etc.)
      const timer = setTimeout(async () => {
        try {
          await video.play();
        } catch {
          // Autoplay blocked — ensure muted and retry
          video.muted = true;
          try { await video.play(); } catch { /* wait for user interaction */ }
        }
      }, 80);
      return () => clearTimeout(timer);
    } else {
      video.pause();
    }
  }, [isVisible, disabled, groupAllowed, src]);

  // Reset state when src changes or becomes disabled
  useEffect(() => {
    if (disabled) {
      setHasLoaded(false);
      setHasError(false);
    }
  }, [disabled, src]);

  const shouldLoad = isVisible && !disabled;

  // If video has a format error (H.265/HEVC), just show poster
  if (hasError) {
    return (
      <div ref={containerRef} className={cn("relative", className)}>
        {poster ? (
          <img src={poster} alt="" className="w-full h-full object-cover rounded-lg" />
        ) : (
          <div className="w-full h-full bg-white/[0.06]" />
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Skeleton shimmer — visible until video has loaded data */}
      {!hasLoaded && (
        <div className="absolute inset-0 z-[1]">
          <VideoGlitchLoader poster={poster} />
        </div>
      )}
      <video
        ref={videoRef}
        src={shouldLoad ? src : undefined}
        poster={poster}
        className="w-full h-full object-cover rounded-lg"
        loop
        muted
        playsInline
        {...{"webkit-playsinline": ""}}
        preload={shouldLoad ? (groupAllowed ? 'auto' : 'metadata') : 'none'}
        onLoadedData={() => setHasLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
});
