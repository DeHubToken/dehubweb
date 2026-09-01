/**
 * Live Feed Preview
 * =================
 * The picture a live post shows IN THE FEED. Until this existed the feed drew
 * a poster frame (often a stock fallback, because a MediaMTX stream renders no
 * thumbnail) and the stream itself only appeared after a click-through to the
 * post page — so a live post read as an empty card while it was on air.
 *
 * Deliberately not LiveStreamCard: that card is the full room (WHEP, tips,
 * chat, shop, host controls) and mounting one per feed item would open a
 * WebRTC session for every card on screen. This is the cheap half — muted,
 * inline, HLS only, and only while the card is actually visible.
 */

import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { LiveEndedMedia } from './LiveEndedMedia';

interface LiveFeedPreviewProps {
  /** HLS ladder for the stream. First playable URL wins. */
  urls: (string | undefined)[];
  /** Poster frame, shown until the first video frame lands. */
  thumbnail?: string;
  className?: string;
  /** Chip shown when there is nothing playable. */
  fallbackLabel?: string;
}

export function LiveFeedPreview({ urls, thumbnail, className, fallbackLabel = 'Live ended' }: LiveFeedPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  const src = urls.find((u): u is string => !!u && u.includes('.m3u8'));

  // Only attach while the card is on screen. A feed can hold dozens of live
  // cards; each attached HLS instance is a rolling segment download.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src || !visible || failed) return;
    let cancelled = false;

    const attach = async () => {
      // Safari (and iOS in general) plays HLS natively; hls.js is only pulled
      // in where it is actually needed, and never on first paint.
      if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = src;
      } else {
        const { default: HlsCtor } = await import('hls.js');
        if (cancelled || !HlsCtor.isSupported()) {
          if (!cancelled) setFailed(true);
          return;
        }
        const hls = new HlsCtor({ lowLatencyMode: true, backBufferLength: 10 });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          // A stream that has stopped publishing 404s its playlist. Fall back
          // to the poster rather than retrying a source that is gone.
          hls.destroy();
          hlsRef.current = null;
          if (!cancelled) setFailed(true);
        });
        hls.loadSource(src);
        hls.attachMedia(el);
      }
      el.play().catch(() => {/* autoplay refused — the poster stays up */});
    };

    void attach();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute('src');
      el.load();
    };
  }, [src, visible, failed]);

  if (!src || failed) {
    return <LiveEndedMedia thumbnail={thumbnail} label={fallbackLabel} />;
  }

  return (
    <div className={className ?? 'absolute inset-0 w-full h-full'}>
      {thumbnail && !playing && (
        <img
          src={thumbnail}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        autoPlay
        preload="none"
        poster={thumbnail}
        onPlaying={() => setPlaying(true)}
      />
    </div>
  );
}
