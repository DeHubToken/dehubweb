/**
 * Video Slide Component
 * =====================
 * Individual video slide for the vertical carousel shorts viewer.
 * Handles its own playback, aspect ratio detection, and liquid glass background.
 * 
 * @module components/app/cards/VideoSlide
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ShortVideo } from '@/types/feed.types';
import { cn } from '@/lib/utils';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';

interface VideoSlideProps {
  short: ShortVideo;
  isActive: boolean;
  isMuted: boolean;
  playbackRate?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onTap?: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  showPlayIndicator?: 'play' | 'pause' | null;
  /**
   * When true, never crop the video: fit the whole frame with `object-contain`
   * over a blurred liquid-glass fill, whatever the aspect ratio. Used on desktop
   * so off-9:16 portrait videos (4:5, 3:4, …) don't get their sides sheared off
   * by `object-cover`. Mobile stays full-bleed (phone-native) and leaves this off.
   */
  letterbox?: boolean;
}

export const VideoSlide = memo(function VideoSlide({
  short,
  isActive,
  isMuted,
  playbackRate = 1,
  onTimeUpdate,
  onTap,
  onSeekStart,
  onSeekEnd,
  showPlayIndicator,
  letterbox = false,
}: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Shorts thumbnails may live at shorts/{id}.jpg instead of the mapped
  // images/{id}.jpg — resolve to whichever exists so the poster isn't a 403.
  const thumbnail = useResolvedThumbnail(short.thumbnail);
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Handle video metadata load to detect aspect ratio
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight) {
        const ratio = videoWidth / videoHeight;
        if (ratio > 1.1) {
          setVideoAspect('landscape');
        } else if (ratio < 0.9) {
          setVideoAspect('portrait');
        } else {
          setVideoAspect('square');
        }
      }
      setIsVideoReady(true);
    }
  }, []);

  // Handle canplay event for faster ready state
  const handleCanPlay = useCallback(() => {
    setIsVideoReady(true);
  }, []);

  // Play/pause based on isActive state - delay playback for buttery landing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      // Delay playback slightly to let transition settle completely
      const timer = setTimeout(() => {
        if (video.currentTime === 0 || video.ended) {
          video.currentTime = 0;
        }
        video.play().catch(() => {});
      }, 50); // 50ms delay for buttery smooth landing
      
      return () => clearTimeout(timer);
    } else {
      video.pause();
    }
  }, [isActive]);

  // Update muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Update playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle time update for view tracking + progress
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isSeeking) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      if (dur > 0) {
        setProgress(ct / dur);
        onTimeUpdate?.(ct, dur);
      }
    }
  }, [onTimeUpdate, isSeeking]);

  // Seek to position from progress bar interaction
  const seekToPosition = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !video.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
  }, []);

  // Use a ref to track seeking so native listeners always see latest value
  const isSeekingRef = useRef(false);
  // The in-flight gesture that started inside the seek strip. We stay 'pending'
  // until enough movement reveals whether it's a horizontal scrub or a vertical
  // navigation swipe.
  const gestureRef = useRef<{ x: number; y: number; id: number; mode: 'pending' | 'seek' | 'swipe' } | null>(null);

  // Native DOM listeners on the seek strip.
  //
  // The strip spans the bottom 15% of the frame full-width, so a big share of
  // vertical navigation swipes — especially on large phones where the thumb
  // rests low — actually *begin* here. The old code captured the pointer and
  // disabled the carousel drag the instant a finger touched the strip, so those
  // swipes did nothing at all ("scrolling up/down doesn't work"). Now we stay
  // hands-off until the gesture reveals its direction: a horizontal drag scrubs
  // the timeline; a vertical drag is left to bubble to the carousel's drag layer
  // so it navigates next/prev; a stationary tap seeks to the tapped point.
  useEffect(() => {
    const bar = progressBarRef.current;
    if (!bar) return;

    // Movement (px) required before we classify the gesture.
    const DECIDE_PX = 10;

    const stopAll = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const beginSeek = (e: PointerEvent) => {
      isSeekingRef.current = true;
      setIsSeeking(true);
      onSeekStart?.();
      try { bar.setPointerCapture(e.pointerId); } catch { /* capture may be unavailable */ }
      seekToPosition(e.clientX);
    };

    const endSeek = (e: PointerEvent) => {
      isSeekingRef.current = false;
      setIsSeeking(false);
      onSeekEnd?.();
      if (bar.hasPointerCapture?.(e.pointerId)) {
        try { bar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      }
    };

    const onDown = (e: PointerEvent) => {
      // NB: do NOT capture / stop the event here — a vertical swipe that starts
      // in this strip must still reach the carousel drag layer to navigate.
      gestureRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'pending' };
    };

    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.id !== e.pointerId) return;

      if (g.mode === 'pending') {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          // Vertical → hand it to the carousel for navigation, stay out of it.
          g.mode = 'swipe';
          return;
        }
        // Horizontal → this is a timeline scrub.
        g.mode = 'seek';
        stopAll(e);
        beginSeek(e);
        return;
      }

      if (g.mode === 'seek') {
        stopAll(e);
        seekToPosition(e.clientX);
      }
    };

    const onUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;

      if (g && g.mode === 'seek') {
        stopAll(e);
        endSeek(e);
        return;
      }

      // A stationary tap inside the strip seeks to that position.
      if (g && g.mode === 'pending') {
        const dx = Math.abs(e.clientX - g.x);
        const dy = Math.abs(e.clientY - g.y);
        if (dx < DECIDE_PX && dy < DECIDE_PX) seekToPosition(e.clientX);
      }
      // 'swipe' → the carousel already handled it.

      // Failsafe: never leave the carousel drag disabled.
      if (isSeekingRef.current) endSeek(e);
    };

    // Belt-and-suspenders: if a scrub's pointerup/cancel is ever lost (iOS
    // pointer-capture quirks), make sure isSeeking can't stick `true` and
    // permanently freeze navigation for the whole viewer session.
    const windowFailsafe = (e: PointerEvent) => {
      if (!isSeekingRef.current) return;
      const g = gestureRef.current;
      if (g && g.id !== e.pointerId) return; // a different finger — leave the scrub alone
      gestureRef.current = null;
      endSeek(e);
    };

    // Swallow the ghost click that follows a scrub.
    const blockClick = (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); };

    bar.addEventListener('pointerdown', onDown, { capture: true });
    bar.addEventListener('pointermove', onMove, { capture: true });
    bar.addEventListener('pointerup', onUp, { capture: true });
    bar.addEventListener('pointercancel', onUp, { capture: true });
    bar.addEventListener('click', blockClick, { capture: true });
    window.addEventListener('pointerup', windowFailsafe);
    window.addEventListener('pointercancel', windowFailsafe);

    return () => {
      bar.removeEventListener('pointerdown', onDown, { capture: true });
      bar.removeEventListener('pointermove', onMove, { capture: true });
      bar.removeEventListener('pointerup', onUp, { capture: true });
      bar.removeEventListener('pointercancel', onUp, { capture: true });
      bar.removeEventListener('click', blockClick, { capture: true });
      window.removeEventListener('pointerup', windowFailsafe);
      window.removeEventListener('pointercancel', windowFailsafe);
    };
  }, [seekToPosition, onSeekStart, onSeekEnd]);

  // Show the video whole (never cropped) whenever it isn't a perfect fit for the
  // frame: always in `letterbox` mode (desktop), otherwise only for non-portrait.
  // For a true 9:16 short this fills edge-to-edge, so the glass fill stays hidden.
  const fitWhole = letterbox || videoAspect !== 'portrait';

  return (
    <div className="absolute inset-0 bg-black" style={{ willChange: 'transform' }}>
      {/* Liquid glass fill behind letterboxed / non-portrait videos */}
      {fitWhole && thumbnail && (
        <>
          {/* Blurred thumbnail background */}
          <div 
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${thumbnail})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(40px) saturate(150%)',
              transform: 'scale(1.1)',
            }}
          />
          {/* Liquid glass overlay */}
          <div className="absolute inset-0 z-[1] bg-black/40 backdrop-blur-[24px] saturate-[180%]" />
        </>
      )}

      {/* Video element */}
      <div className="absolute inset-0 z-[2]" onClick={onTap}>
        {short.videoUrl ? (
          <video
            ref={videoRef}
            src={short.videoUrl}
            className={`w-full h-full ${fitWhole ? 'object-contain' : 'object-cover'} transition-none`}
            style={{ willChange: 'transform' }}
            loop
            playsInline
            {...{"webkit-playsinline": ""}}
            muted={isMuted}
            poster={thumbnail}
            preload={isActive ? 'auto' : 'metadata'}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onError={() => console.error('Video load error:', short.videoUrl)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <img 
              src={thumbnail} 
              alt={short.description || 'Short video'}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Play/Pause indicator - only shown on explicit tap */}
      {showPlayIndicator && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="w-16 h-16 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded-xl flex items-center justify-center border border-white/10"
          >
            {showPlayIndicator === 'play' ? (
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            ) : (
              <Pause className="w-8 h-8 text-white fill-white" />
            )}
          </motion.div>
        </div>
      )}

      {/* Bottom 15% seek zone + progress bar */}
      <div
        ref={progressBarRef}
        data-no-swipe
        className="absolute bottom-0 left-0 right-0 z-20 cursor-pointer touch-none select-none"
        style={{ height: '15%' }}
      >
        {/* Visual progress bar pinned to very bottom */}
        <div className={cn(
          "absolute bottom-0 left-0 right-0",
          isSeeking ? "h-2" : "h-1",
          "transition-[height] duration-150"
        )}>
          <div className="absolute inset-0 bg-white/20" />
          <div
            className="absolute top-0 left-0 bottom-0 bg-white/80"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export default VideoSlide;
