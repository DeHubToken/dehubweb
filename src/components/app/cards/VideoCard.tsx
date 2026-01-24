/**
 * Video Card Component
 * ====================
 * Displays video content with thumbnail, duration, and universal styling.
 * 
 * @example
 * ```tsx
 * <VideoCard video={videoData} />
 * ```
 */

import { useState, useRef, useCallback, memo, useEffect, useId } from 'react';
import { Eye, MoreVertical, ListPlus, Clock, Flag, Download, Ban, Sparkles, Play, Pause, Volume2, VolumeX, Maximize, FastForward, Rewind, PictureInPicture2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { CommentsSection } from './CommentsSection';
import { useIsTouchDevice } from '@/hooks/use-touch-device';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { VideoItem } from '@/types/feed.types';

interface VideoCardProps {
  video: VideoItem;
}

export const VideoCard = memo(function VideoCard({ video }: VideoCardProps) {
  const instanceId = useId();
  const [showAIChat, setShowAIChat] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => videoPlaybackManager.globalMuted);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [seekIndicator, setSeekIndicator] = useState<'left' | 'right' | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchDevice = useIsTouchDevice();

  // Pause callback for the playback manager
  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  // Register with playback manager and setup IntersectionObserver
  useEffect(() => {
    videoPlaybackManager.register(instanceId, pauseVideo);

    // Auto-pause when scrolled out of view
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && isPlaying) {
            pauseVideo();
            videoPlaybackManager.stop(instanceId);
          }
        });
      },
      { threshold: 0.3 } // Pause when less than 30% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      videoPlaybackManager.unregister(instanceId);
      observer.disconnect();
    };
  }, [instanceId, pauseVideo, isPlaying]);

  const handlePlayClick = useCallback(() => {
    if (!video.videoUrl) return;
    
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      videoPlaybackManager.stop(instanceId);
    } else {
      // Notify manager - this will pause any other playing video
      videoPlaybackManager.play(instanceId);
      setIsLoading(true);
      videoRef.current?.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        setHasError(true);
        videoPlaybackManager.stop(instanceId);
      });
    }
  }, [isPlaying, video.videoUrl, instanceId]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoPlaybackManager.globalMuted = newMuted; // Persist globally for future videos
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  }, [isMuted]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen();
  }, []);

  const handlePictureInPicture = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else if (videoRef.current) {
      videoRef.current.requestPictureInPicture();
    }
  }, []);

  const adjustVolume = useCallback((delta: number) => {
    if (videoRef.current) {
      const newVolume = Math.max(0, Math.min(1, volume + delta));
      setVolume(newVolume);
      videoRef.current.volume = newVolume;
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  }, [volume, isMuted]);

  const seekBy = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, videoRef.current.duration || 0));
      setSeekIndicator(seconds > 0 ? 'right' : 'left');
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    videoPlaybackManager.stop(instanceId);
  }, [instanceId]);

  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    console.error('Video error:', video.videoUrl, videoEl.error?.message || 'Unknown error');
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  }, [video.videoUrl]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleDoubleTapSeek = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.changedTouches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const isRightSide = x > rect.width / 2;
    
    if (videoRef.current && isPlaying) {
      if (isRightSide) {
        videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
        setSeekIndicator('right');
      } else {
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        setSeekIndicator('left');
      }
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, [isPlaying]);

  const handleVideoAreaClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Clear any pending single-click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    // Check for double-click (within 300ms and similar x position)
    if (now - lastTapRef.current.time < 300 && Math.abs(x - lastTapRef.current.x) < 50) {
      // Double-click detected - seek without pausing
      handleDoubleTapSeek(e);
      lastTapRef.current = { time: 0, x: 0 }; // Reset to prevent triple-tap
    } else {
      lastTapRef.current = { time: now, x };
      // Delay single click action to distinguish from double-click
      clickTimeoutRef.current = setTimeout(() => {
        handlePlayClick();
        clickTimeoutRef.current = null;
      }, 300);
    }
  }, [handleDoubleTapSeek, handlePlayClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const relativeX = x / rect.width; // 0 to 1
    const relativeY = y / rect.height; // 0 to 1
    
    // Ignore touches in top-right corner (where controls are) - top 20% and right 40%
    if (relativeY < 0.20 && relativeX > 0.60) {
      return; // Let the button handle the touch natively
    }
    
    // Also ignore bottom area where progress bar is - bottom 20%
    if (relativeY > 0.80) {
      return; // Let the progress bar handle the touch natively
    }
    
    // Only prevent default after we've confirmed this isn't a button/control touch
    e.preventDefault();
    
    // Center zone (30-70%) for play/pause
    if (relativeX > 0.3 && relativeX < 0.7) {
      handlePlayClick();
      return;
    }
    
    // Left/right zones for seeking (only when playing)
    if (videoRef.current && isPlaying) {
      if (relativeX >= 0.7) {
        // Right side - fast forward
        videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
        setSeekIndicator('right');
      } else {
        // Left side - rewind
        videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        setSeekIndicator('left');
      }
      setTimeout(() => setSeekIndicator(null), 500);
    }
  }, [isPlaying, handlePlayClick]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isFocused || !isPlaying) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayClick();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => {
            if (videoRef.current) videoRef.current.muted = !prev;
            return !prev;
          });
          break;
        case 'p':
          e.preventDefault();
          if (videoRef.current) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture();
            } else {
              videoRef.current.requestPictureInPicture();
            }
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, isPlaying, handlePlayClick, seekBy, adjustVolume]);
  
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={video.channel}
          avatarSeed={video.channelAvatar}
          verified={video.verified}
          contentType="video"
          creatorId={video.creatorId}
          creatorUsername={video.creatorUsername}
        />
        <div className="flex items-center gap-1 pr-3">
          <motion.button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Ask AI about this video"
          >
            <Sparkles className="w-5 h-5" />
          </motion.button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <ListPlus className="w-4 h-4" /> Queue
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Clock className="w-4 h-4" /> Watch List
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Flag className="w-4 h-4" /> Report
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> Block Creator
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Video Player / Thumbnail */}
      <div 
        ref={containerRef}
        tabIndex={0}
        className="relative aspect-video bg-zinc-800 cursor-pointer group/thumb outline-none"
        onClick={isTouchDevice ? undefined : handleVideoAreaClick}
        onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {/* Show video element when we have a video URL */}
        {video.videoUrl && !hasError ? (
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnail}
            muted={isMuted}
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            onEnded={handleVideoEnded}
            onError={handleVideoError}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={() => console.log('Video loaded:', video.videoUrl)}
            className="w-full h-full object-cover"
          />
        ) : (
          <img 
            src={video.thumbnail} 
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        
        {/* Play/Pause button overlay - double click/tap for fullscreen */}
        {(!isPlaying || (showControls && !isTouchDevice)) && !isLoading && (
          <div 
            className={`absolute inset-0 flex items-center justify-center bg-black/20 ${isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'} transition-opacity`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              videoRef.current?.requestFullscreen();
            }}
          >
            <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary-foreground fill-current" />
              ) : (
                <Play className="h-6 w-6 text-primary-foreground fill-current ml-1" />
              )}
            </div>
          </div>
        )}

        {/* Top-aligned video controls (volume, PiP & fullscreen) - liquid glass */}
        {isPlaying && (showControls || isTouchDevice) && (
          <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-full flex items-center justify-center border border-white/10"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-full flex items-center justify-center border border-white/10"
              onClick={handlePictureInPicture}
              title="Picture in Picture (P)"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
            <button 
              className="h-8 w-8 bg-black/40 backdrop-blur-[24px] saturate-[180%] text-white rounded-full flex items-center justify-center border border-white/10"
              onClick={handleFullscreen}
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Progress bar at bottom */}
        {isPlaying && duration > 0 && (showControls || isTouchDevice) && (
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent z-10">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded border border-white/10 text-white text-xs min-w-[36px] text-center">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:w-3 
                  [&::-webkit-slider-thumb]:h-3 
                  [&::-webkit-slider-thumb]:bg-white 
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-moz-range-thumb]:w-3
                  [&::-moz-range-thumb]:h-3
                  [&::-moz-range-thumb]:bg-white
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:border-0"
                style={{
                  background: `linear-gradient(to right, white ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.3) ${(currentTime / (duration || 1)) * 100}%)`
                }}
              />
              <span className="px-1.5 py-0.5 bg-black/40 backdrop-blur-[24px] saturate-[180%] rounded border border-white/10 text-white text-xs min-w-[36px] text-center">{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Seek indicator */}
        <AnimatePresence>
          {seekIndicator && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator === 'right' ? 'right-8' : 'left-8'}`}
            >
              <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                {seekIndicator === 'right' ? (
                  <FastForward className="h-6 w-6 text-white" />
                ) : (
                  <Rewind className="h-6 w-6 text-white" />
                )}
              </div>
              <p className="text-white text-xs text-center mt-1">10s</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white/70 text-sm">Video format not supported</p>
          </div>
        )}
        
        {/* Duration badge - liquid glass - hide when progress bar visible */}
        {!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && (
          <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-1.5 py-0.5 rounded border border-white/10 text-xs text-white font-medium">
            {video.duration}
          </div>
        )}
        
        {/* View count - liquid glass - hide when progress bar visible */}
        {!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-0.5 rounded border border-white/10">
            <Eye className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-medium">{video.views}</span>
          </div>
        )}
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar 
          postId={video.id} 
          className="p-0 mb-2" 
          isLiked={video.isLiked} 
          isDisliked={video.isDisliked}
          onComment={() => setShowComments(!showComments)}
          likeCount={video.likeCount}
          dislikeCount={video.dislikeCount}
          commentCount={video.commentCount}
        />
        <TranslatableText text={video.title} className="text-white text-sm font-medium" as="h3" />
        <p className="text-zinc-500 text-xs mt-1">{video.uploadedAgo}</p>

        {/* Inline Comments Section */}
        <AnimatePresence>
          {showComments && (
            <CommentsSection
              tokenId={video.id}
              onClose={() => setShowComments(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'video',
          author: video.channel,
          title: video.title,
          imageUrl: video.thumbnail
        }}
      />
    </div>
  );
});
