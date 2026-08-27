/**
 * Video Slide Component
 * =====================
 * Individual video slide for the vertical carousel shorts viewer.
 * Handles its own playback, aspect ratio detection, and liquid glass background.
 * 
 * @module components/app/cards/VideoSlide
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ShortVideo } from '@/types/feed.types';
import { cn } from '@/lib/utils';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';

interface VideoSlideProps {
  short: ShortVideo;
  isActive: boolean;
  isMuted: boolean;
  playbackRate?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onTap?: () => void;
  /**
   * Reverses `onTap` silently. Supplying it is what lets the first tap act
   * immediately instead of waiting 260ms to see whether a second is coming —
   * see useTapGestures.
   */
  onTapUndo?: () => void;
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
  /** Only tells the frame to fit the whole video; the control lives in the viewer. */
  isFullscreen?: boolean;
  /**
   * Where to paint the progress bar, if not in place.
   *
   * The viewer's action bar lays a 96px `from-black/80` gradient across the
   * bottom of the video container, and it is a sibling of the carousel, so it
   * paints over everything inside a slide — including this bar, which is what
   * "the action bar shadows over the scroll line" was. The bar cannot simply
   * out-z-index it: each slide is its own stacking context, so nothing inside
   * one can reach past the container's own layers.
   *
   * Given the container element, the *visual* bar is portalled there instead
   * and sits above the gradient. The seek zone stays put — the gradient is
   * `pointer-events-none`, so clicks were always reaching it, and hoisting the
   * zone as well would park a 15%-tall target on top of the action buttons.
   */
  progressLayer?: HTMLElement | null;
}

export const VideoSlide = memo(function VideoSlide({
  short,
  isActive,
  isMuted,
  playbackRate = 1,
  onTimeUpdate,
  onTap,
  onTapUndo,
  onSeekStart,
  onSeekEnd,
  showPlayIndicator,
  letterbox = false,
  preload,
  isFullscreen = false,
  progressLayer = null,
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
   * The tap ladder on a short: double 👍, triple ❤️, hold for the tray. Every
   * platform, so the gesture means the same thing here as on every other feed
   * surface — a short IS a feed, just a vertical one.
   *
   * Desktop used to spend the centre double-tap on fullscreen instead. One
   * gesture cannot mean two things, and reacting is the far more frequent
   * intent, so fullscreen keeps its button and gives the gesture up.
   *
   * ShortsViewer owns the listener for these, since it renders no ActionBar.
   */
  const tapGestures = useTapGestures({
    postId: short.id,
    // Play/pause is a toggle, so it can fire on the first tap and be toggled
    // straight back if a second one turns up — no 260ms wait to find out. The
    // video never visibly pauses on a double tap, and tap-to-pause stays as
    // instant as it was before the ladder existed.
    onSingleTap: () => onTap?.(),
    onUndoSingleTap: () => (onTapUndo ?? onTap)?.(),
  });

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

  // Pinned to the very bottom of whichever box it lands in — the seek zone in
  // place, or the viewer's video container through the portal below. `z-20`
  // clears the action bar's gradient (`z-10`) once it is a sibling of it, and
  // it never takes a click either way: the zone below owns the interaction.
  const progressBar = (
    <div className={cn(
      "absolute bottom-0 left-0 right-0 z-20 pointer-events-none",
      isSeeking ? "h-2" : "h-1",
      "transition-[height] duration-150"
    )}>
      <div className="absolute inset-0 bg-white/20" />
      <div
        className="absolute top-0 left-0 bottom-0 bg-white/80"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );

  // The frame stays `absolute inset-0` in every state, fullscreen included: it
  // is the viewer's container that goes fullscreen, and this frame simply fills
  // it as it always did. Nothing here may go `fixed` — the carousel transforms
  // each slide, and a transformed ancestor makes `fixed` resolve against that
  // wrapper rather than the viewport.
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

      {/* Video element. One tap model on every platform now: the reaction
          ladder, off pointer events. Desktop used to bind a competing onClick
          for centre-double-tap fullscreen; fullscreen kept its button and gave
          the gesture up, because one gesture cannot mean two things. */}
      <div className="absolute inset-0 z-[2]" {...tapGestures}>
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

      {/* The fullscreen toggle used to live here, and it showed: a slide is
          translated by the carousel, so the button slid along with the video on
          every step while the viewer's mute button — its neighbour in the same
          row — held still. It now sits beside the mute button in the viewer,
          which is also the only way the two can be guaranteed the same
          treatment. */}

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

      {/* Bottom 15% seek zone. The bar it draws goes out to `progressLayer`
          when there is one, so the action bar's gradient cannot sit on top of
          it — see the prop. The zone itself never moves. */}
      <div
        ref={progressBarRef}
        data-no-swipe
        className="absolute bottom-0 left-0 right-0 z-20 cursor-pointer touch-none select-none"
        style={{ height: '15%' }}
      >
        {!progressLayer && progressBar}
      </div>
      {progressLayer && createPortal(progressBar, progressLayer)}
    </div>
  );
});

export default VideoSlide;
