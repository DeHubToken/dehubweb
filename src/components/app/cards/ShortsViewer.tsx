/**
 * Shorts Viewer Component
 * =======================
 * Full-screen shorts viewer with video playback and comments overlay.
 * Desktop: Centered portrait video with side panels.
 * Mobile: Full-screen video.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Heart, Share2, Send, Volume2, VolumeX, ChevronUp, ChevronDown, Play, Pause } from 'lucide-react';
import { motion, PanInfo } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import type { ShortVideo } from '@/types/feed.types';

interface ShortsViewerProps {
  shorts: ShortVideo[];
  initialIndex: number;
  onClose: () => void;
}

// Comments are now loaded from real API - no mock data

export function ShortsViewer({ shorts, initialIndex, onClose }: ShortsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [comment, setComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPlayIndicator, setShowPlayIndicator] = useState<'play' | 'pause' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const currentShort = shorts[currentIndex];
  
  // View tracking for the current short
  const { onTimeUpdate: trackView } = useVideoViewTracking(currentShort?.id);
  
  // Handle video time update for view tracking
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      if (dur > 0) {
        trackView(ct, dur);
      }
    }
  }, [trackView]);

  // Lock body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    setIsLiked(false);
    setIsPlaying(true);
  }, [currentIndex]);

  const goToNext = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Handle mouse wheel scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (isScrolling) return;
      
      const threshold = 50;
      if (Math.abs(e.deltaY) < threshold) return;

      setIsScrolling(true);
      
      if (e.deltaY > 0) {
        goToNext();
      } else {
        goToPrev();
      }

      // Debounce to prevent rapid scrolling
      setTimeout(() => setIsScrolling(false), 500);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [currentIndex, isScrolling]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'm') toggleMute();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isPlaying]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Swipe right to close (like Instagram stories)
    if (info.offset.x > 100) {
      onClose();
      return;
    }
    // Vertical swipe for navigation
    if (info.offset.y < -100) goToNext();
    else if (info.offset.y > 100) goToPrev();
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowPlayIndicator('pause');
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      setShowPlayIndicator('play');
    }
    
    setTimeout(() => setShowPlayIndicator(null), 500);
  };

  // Prevent touch events from bubbling to parent page
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Layout with Side Panels */}
      <div className={`relative flex items-center justify-center h-full ${isMobile ? 'w-full' : 'gap-4 px-4'}`}>
        
        {/* Left Side Panel - Desktop Only */}
        {!isMobile && (
          <div className="w-[268px] lg:w-[320px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col">
            {/* Creator Info - Top */}
            <div className="bg-zinc-900/50 rounded-2xl p-3 lg:p-4 mb-3">
              <div className="flex items-center gap-2 lg:gap-3">
                <Avatar className="w-10 h-10 lg:w-12 lg:h-12 border-2 border-white/20 flex-shrink-0">
                  <AvatarFallback className="bg-zinc-700 text-white font-medium">{currentShort.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm lg:text-base truncate">@{currentShort.username}</p>
                  <p className="text-white/60 text-xs lg:text-sm">{currentShort.likes} likes</p>
                </div>
                <button className="bg-white text-black text-xs lg:text-sm font-semibold px-3 lg:px-4 py-1 lg:py-1.5 rounded-full hover:bg-white/90 transition-colors flex-shrink-0">
                  Follow
                </button>
              </div>
              {currentShort.description && (
                <p className="text-white/80 text-xs lg:text-sm mt-2 lg:mt-3 line-clamp-2">{currentShort.description}</p>
              )}
            </div>

            {/* Comments - Rest of panel */}
            <div className="flex-1 bg-zinc-900/50 rounded-2xl p-4 flex flex-col min-h-0">
              <p className="text-white/60 text-xs mb-3 flex-shrink-0">Comments</p>
              <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 flex items-center justify-center">
                <p className="text-white/40 text-sm">No comments yet</p>
              </div>
              
              {/* Comment input */}
              <div className="flex-shrink-0 mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="flex-1 bg-zinc-800 text-white placeholder-white/40 text-sm rounded-full px-4 py-2 border border-white/10 focus:outline-none focus:border-white/30"
                  />
                  {comment && (
                    <button className="text-primary">
                      <Send className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Container */}
        <div className={`relative ${isMobile ? 'w-full h-full' : 'w-[360px] h-[calc(100vh-80px)] max-h-[640px]'} bg-zinc-900 rounded-none md:rounded-2xl overflow-hidden`}>
          <motion.div
            className="absolute inset-0"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            onTap={togglePlayPause}
          >
            {currentShort.videoUrl ? (
              <video
                ref={videoRef}
                src={currentShort.videoUrl}
                className="w-full h-full object-cover"
                loop
                playsInline
                autoPlay
                muted={isMuted}
                poster={currentShort.thumbnail}
                onTimeUpdate={handleTimeUpdate}
                onError={() => console.error('Video load error:', currentShort.videoUrl)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <img 
                  src={currentShort.thumbnail} 
                  alt={currentShort.description || 'Short video'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <p className="text-white/70">Video unavailable</p>
                </div>
              </div>
            )}
            
            {/* Play/Pause indicator */}
            {showPlayIndicator && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center"
                >
                  {showPlayIndicator === 'play' ? (
                    <Play className="w-8 h-8 text-white fill-white" />
                  ) : (
                    <Pause className="w-8 h-8 text-white" />
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>

          {/* Mobile-only overlays */}
          {isMobile && (
            <>
              {/* Creator Info */}
              <div className="absolute top-4 left-4 z-10">
                <div className="flex items-center gap-2 bg-zinc-800/70 backdrop-blur-sm rounded-full pl-1 pr-3 py-1">
                  <Avatar className="w-8 h-8 border border-white/20">
                    <AvatarFallback className="bg-zinc-700 text-white font-medium">{currentShort.username[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-white text-sm font-medium">@{currentShort.username}</span>
                    <span className="text-white/60 text-xs">{currentShort.likes} likes</span>
                  </div>
                  <button className="ml-2 bg-white text-black text-xs font-semibold px-3 py-1 rounded-full">
                    Follow
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <div className="absolute bottom-0 left-0 right-0 z-10 p-4 space-y-3">
                <div className="space-y-3 max-h-[150px] overflow-y-auto scrollbar-hide flex items-center justify-center">
                  <p className="text-white/40 text-sm">No comments yet</p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Add Comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full bg-zinc-800/70 backdrop-blur-sm text-white placeholder-white/40 text-sm rounded-full px-4 py-2.5 pr-10 border border-white/10 focus:outline-none focus:border-white/30"
                    />
                    {comment && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-primary">
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setIsLiked(!isLiked)}
                    className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center"
                  >
                    <Heart className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                  </button>
                  <button className="w-10 h-10 bg-zinc-800/70 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Side Panel - Desktop Only */}
        {!isMobile && (
          <div className="w-[80px] h-[calc(100vh-80px)] max-h-[640px] flex flex-col items-center justify-center gap-6">
            {/* Navigation */}
            <button
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </button>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors">
                  <Heart className={`w-6 h-6 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
                </div>
                <span className="text-white text-xs">{currentShort.likes}</span>
              </button>

              <button className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-white text-xs">Share</span>
              </button>

              <button
                onClick={toggleMute}
                className="w-12 h-12 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="w-6 h-6 text-white" />
                ) : (
                  <Volume2 className="w-6 h-6 text-white" />
                )}
              </button>
            </div>

            <button
              onClick={goToNext}
              disabled={currentIndex === shorts.length - 1}
              className="w-10 h-10 bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Close button - always visible */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 lg:w-10 lg:h-10 bg-zinc-800/80 hover:bg-zinc-700 rounded-full flex items-center justify-center z-20 transition-colors"
      >
        <X className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
      </button>

      {/* Mobile header controls */}
      {isMobile && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-16 w-8 h-8 bg-zinc-800/80 rounded-full flex items-center justify-center z-20"
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-white" />
          ) : (
            <Volume2 className="w-4 h-4 text-white" />
          )}
        </button>
      )}

      {/* Mobile swipe hint */}
      {isMobile && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-white/40 text-xs animate-pulse z-10">
          Swipe up for next
        </div>
      )}
    </motion.div>
  );
}
