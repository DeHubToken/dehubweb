/**
 * Video Thumbnail Component
 * =========================
 * Extracts and displays the first frame of a video as a thumbnail image.
 * Uses a hidden video element + canvas to capture the frame.
 * Caches extracted thumbnails in a module-level Map so they persist across remounts.
 */

import { useState, useEffect, memo } from 'react';

// ─── Persistent thumbnail cache (survives component remounts / tab switches) ───
// Bounded: each entry is a JPEG dataURL string held for the whole session, so
// an unbounded map grows without limit as the user scrolls stories. Map keeps
// insertion order → evict the oldest entry once full (simple FIFO ≈ LRU here,
// since a cache hit means the component already has the string).
const MAX_CACHED_THUMBNAILS = 100;
const thumbnailCache = new Map<string, string>();
function cacheThumbnail(url: string, dataUrl: string) {
  if (thumbnailCache.size >= MAX_CACHED_THUMBNAILS) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest !== undefined) thumbnailCache.delete(oldest);
  }
  thumbnailCache.set(url, dataUrl);
}

// Thumbnails render small — capture at most 360px wide instead of the video's
// native resolution (a 1080×1920 frame is ~10× the dataURL bytes for no
// visible gain at thumbnail size).
const MAX_THUMB_WIDTH = 360;

interface VideoThumbnailProps {
  videoUrl: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Called when the thumbnail has loaded or failed */
  onReady?: () => void;
}

export const VideoThumbnail = memo(function VideoThumbnail({
  videoUrl,
  alt,
  className = '',
  fallback,
  onReady,
}: VideoThumbnailProps) {
  // Check cache synchronously on mount — instant display if available
  const cached = videoUrl ? thumbnailCache.get(videoUrl) : null;
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(cached);
  const [failed, setFailed] = useState(false);

  // If we got a cache hit, signal ready immediately
  useEffect(() => {
    if (cached) {
      onReady?.();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Skip extraction if already cached
    if (!videoUrl || thumbnailCache.has(videoUrl)) {
      if (!videoUrl) {
        setFailed(true);
        onReady?.();
      }
      return;
    }

    let revoked = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'metadata';

    const timeout = setTimeout(() => {
      cleanup();
      setFailed(true);
      onReady?.();
    }, 8000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeAttribute('src');
      video.load();
      if (!revoked) {
        revoked = true;
      }
    }

    video.onloadeddata = () => {
      video.currentTime = 0.1; // slight offset to ensure frame is decoded
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const srcW = video.videoWidth || 180;
        const srcH = video.videoHeight || 320;
        const scale = Math.min(1, MAX_THUMB_WIDTH / srcW);
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          // Store in persistent cache
          cacheThumbnail(videoUrl, dataUrl);
          setThumbnailSrc(dataUrl);
          onReady?.();
        } else {
          setFailed(true);
          onReady?.();
        }
      } catch {
        // CORS or other canvas error
        setFailed(true);
        onReady?.();
      }
      cleanup();
    };

    video.onerror = () => {
      cleanup();
      setFailed(true);
      onReady?.();
    };

    video.src = videoUrl;
    video.load();

    return () => {
      cleanup();
    };
  }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed || !thumbnailSrc) {
    return <>{fallback}</> || null;
  }

  return (
    <img
      src={thumbnailSrc}
      alt={alt}
      className={className}
    />
  );
});

export default VideoThumbnail;
