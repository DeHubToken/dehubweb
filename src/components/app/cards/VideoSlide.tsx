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

interface VideoSlideProps {
  short: ShortVideo;
  isActive: boolean;
  isMuted: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onTap?: () => void;
  showPlayIndicator?: 'play' | 'pause' | null;
}

export const VideoSlide = memo(function VideoSlide({
  short,
  isActive,
  isMuted,
  onTimeUpdate,
  onTap,
  showPlayIndicator,
}: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const handleProgressPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsSeeking(true);
    seekToPosition(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [seekToPosition]);

  const handleProgressPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isSeeking) return;
    seekToPosition(e.clientX);
  }, [isSeeking, seekToPosition]);

  const handleProgressPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isSeeking) return;
    e.stopPropagation();
    setIsSeeking(false);
  }, [isSeeking]);

  return (
    <div className="absolute inset-0 bg-black" style={{ willChange: 'transform' }}>
      {/* Liquid glass background for non-portrait videos */}
      {videoAspect !== 'portrait' && short.thumbnail && (
        <>
          {/* Blurred thumbnail background */}
          <div 
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${short.thumbnail})`,
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
            className={`w-full h-full ${videoAspect === 'portrait' ? 'object-cover' : 'object-contain'} transition-none`}
            style={{ willChange: 'transform' }}
            loop
            playsInline
            muted={isMuted}
            poster={short.thumbnail}
            preload={isActive ? 'auto' : 'metadata'}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onError={() => console.error('Video load error:', short.videoUrl)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900">
            <img 
              src={short.thumbnail} 
              alt={short.description || 'Short video'}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="text-white/70">Video unavailable</p>
            </div>
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
        className="absolute bottom-0 left-0 right-0 z-20 cursor-pointer touch-none select-none"
        style={{ height: '15%' }}
        onPointerDown={handleProgressPointerDown}
        onPointerMove={handleProgressPointerMove}
        onPointerUp={handleProgressPointerUp}
        onPointerCancel={handleProgressPointerUp}
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
