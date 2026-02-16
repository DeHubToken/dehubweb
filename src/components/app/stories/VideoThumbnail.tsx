/**
 * Video Thumbnail Component
 * =========================
 * Extracts and displays the first frame of a video as a thumbnail image.
 * Uses a hidden video element + canvas to capture the frame.
 * Caches extracted thumbnails in a module-level Map so they persist across remounts.
 */

import { useState, useEffect, memo } from 'react';

// ─── Persistent thumbnail cache (survives component remounts / tab switches) ───
const thumbnailCache = new Map<string, string>();

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
        canvas.width = video.videoWidth || 180;
        canvas.height = video.videoHeight || 320;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          // Store in persistent cache
          thumbnailCache.set(videoUrl, dataUrl);
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
