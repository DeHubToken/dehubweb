/**
 * Video Thumbnail Component
 * =========================
 * Extracts and displays the first frame of a video as a thumbnail image.
 * Uses a hidden video element + canvas to capture the frame.
 */

import { useState, useEffect, memo } from 'react';

interface VideoThumbnailProps {
  videoUrl: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export const VideoThumbnail = memo(function VideoThumbnail({
  videoUrl,
  alt,
  className = '',
  fallback,
}: VideoThumbnailProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!videoUrl) {
      setFailed(true);
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
          setThumbnailSrc(dataUrl);
        } else {
          setFailed(true);
        }
      } catch {
        // CORS or other canvas error
        setFailed(true);
      }
      cleanup();
    };

    video.onerror = () => {
      cleanup();
      setFailed(true);
    };

    video.src = videoUrl;
    video.load();

    return () => {
      cleanup();
    };
  }, [videoUrl]);

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
