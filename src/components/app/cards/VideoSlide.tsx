/**
 * Video Slide Component
 * =====================
 * Individual video slide for the vertical carousel shorts viewer.
 * Handles its own playback, aspect ratio detection, and liquid glass background.
 * 
 * @module components/app/cards/VideoSlide
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Play, Pause, Maximize, Minimize } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ShortVideo } from '@/types/feed.types';
import { cn } from '@/lib/utils';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';
import { useVideoFullscreen, canNativeFullscreen } from '@/hooks/use-video-fullscreen';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';

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
  /**
   * Buffering hint for the underlying <video>. The viewer sets this to `'auto'`
   * for the active slide *and the next one* so the neighbour is already buffered
   * when you swipe to it (no cold-load lag on landing), and `'metadata'` for
   * slides further out. Defaults to the old isActive-based behaviour.
   */
  preload?: 'auto' | 'metadata' | 'none';
  /**
   * Whether to offer a fullscreen control. Desktop only — the viewer is
   * `fixed inset-0` on mobile, so a short there already fills the screen and
   * "fullscreen" would be a button that visibly does nothing. Off by default so
   * a new caller has to opt in deliberately.
   */
  allowFullscreen?: boolean;
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
  preload,
  allowFullscreen = false,
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
  // The slide frame, not the <video>: fullscreening the frame carries the seek
  // strip and the play indicator into fullscreen with it.
  //
  // `allowSimulated: false` because the carousel animates every slide with
  // `translateY`, and a transformed ancestor makes the `fixed inset-0` that
  // simulated fullscreen relies on resolve against that wrapper rather than the
  // viewport — it would land somewhere arbitrary. Native fullscreen promotes the
  // element to the top layer, where no ancestor transform applies, so the real
  // path still works; only the fake one is refused.
  const frameRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useVideoFullscreen(videoRef, frameRef, {
    allowSimulated: false,
  });
  // Desktop only, and only where a native fullscreen is actually reachable —
  // with the simulated fallback refused, anything else would be a dead control.
  const canFullscreen = allowFullscreen && canNativeFullscreen();

  /**
   * Tap handling on the video area.
   *
   * A single tap plays/pauses (that is `onTap`, owned by the viewer) and a
   * double tap in the middle toggles fullscreen — the same split VideoCard's
   * immersive mode uses, so the gesture means the same thing on both players.
   *
   * Only a tap inside the centre band pays the 300ms wait needed to tell one
   * tap from two. Outside it there is no double-tap to disambiguate, so
   * play/pause still fires instantly — which is most of the frame, and keeps
   * the viewer feeling as immediate as it did before.
   */
  /**
   * Mobile only: double 👍, triple ❤️, hold for the tray. Desktop keeps the
   * centre double-tap for fullscreen instead — `allowFullscreen` is the desktop
   * signal, so the two gesture models never coexist on one slide.
   *
   * ShortsViewer owns the listener for these, since it renders no ActionBar.
   */
  const tapGestures = useTapGestures({
    postId: short.id,
    onSingleTap: () => onTap?.(),
    disabled: allowFullscreen,
  });

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const handleVideoTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeX = (e.clientX - rect.left) / rect.width;
      const inCentre = relativeX >= 0.375 && relativeX <= 0.625;

      // No fullscreen to reach means no second tap to wait for.
      if (!inCentre || !canFullscreen) {
        onTap?.();
        return;
      }

      const now = e.timeStamp;
      if (tapTimerRef.current && now - lastTapRef.current < 300) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
        lastTapRef.current = 0;
        toggleFullscreen();
        return;
      }

      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        onTap?.();
      }, 300);
    },
    [onTap, toggleFullscreen, canFullscreen],
  );

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

  // No simulated-fullscreen branch here on purpose: `allowSimulated: false`
  // means this frame only ever enters *native* fullscreen, where the Fullscreen
  // API's UA stylesheet pins it with `position: fixed !important; inset: 0
  // !important` from the top layer. That outranks these classes and is immune to
  // the carousel's ancestor transform, so `absolute inset-0` stays correct in
  // both states.
  return (
    <div ref={frameRef} className="absolute inset-0 bg-black" style={{ willChange: 'transform' }}>
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

      {/* Video element.
          Desktop drives the centre double-tap through onClick (fullscreen);
          mobile gets the reaction ladder off pointer events instead. The two
          are mutually exclusive — `allowFullscreen` IS the desktop signal — so
          only one tap model is ever bound and they cannot double-fire. */}
      <div
        className="absolute inset-0 z-[2]"
        onClick={allowFullscreen ? handleVideoTap : undefined}
        {...(allowFullscreen ? {} : tapGestures)}
      >
        {short.videoUrl ? (
          <video
            ref={videoRef}
            src={short.videoUrl}
            className={`w-full h-full ${fitWhole || isFullscreen ? 'object-contain' : 'object-cover'} transition-none`}
            style={{ willChange: 'transform' }}
            loop
            playsInline
            {...{"webkit-playsinline": ""}}
            muted={isMuted}
            poster={thumbnail}
            preload={preload ?? (isActive ? 'auto' : 'metadata')}
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

      {/* Fullscreen toggle. Only the active slide gets one — the carousel keeps
          neighbouring slides mounted, and a column of stacked buttons would all
          sit at the same screen position. `data-no-swipe` keeps a press on it
          from being read as the start of a navigation drag. */}
      {isActive && canFullscreen && (
        <button
          type="button"
          data-no-swipe
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="absolute top-3 right-3 z-30 h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-xl flex items-center justify-center border border-white/10"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      )}

      {/* 👍 / ❤️ for the tap ladder. Sits above the controls so the burst is not
          drawn under them, which is safe because every layer of it is
          pointer-events-none and cannot take a tap from the seek strip. */}
      {isActive && <TapReactionBurst postId={short.id} />}

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
