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

import { useState, useRef, useCallback, memo } from 'react';
import { Eye, MoreVertical, ListPlus, Clock, Flag, Download, Ban, Sparkles, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { CommentsSection } from './CommentsSection';
import { useIsTouchDevice } from '@/hooks/use-touch-device';
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
  const [showAIChat, setShowAIChat] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isTouchDevice = useIsTouchDevice();

  const handlePlayClick = useCallback(() => {
    if (!video.videoUrl) return;
    
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      videoRef.current?.play().then(() => {
        setIsPlaying(true);
        setIsLoading(false);
      }).catch(() => {
        setIsLoading(false);
        setHasError(true);
      });
    }
  }, [isPlaying, video.videoUrl]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => !prev);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  }, [isMuted]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen();
  }, []);

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
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
        className="relative aspect-video bg-zinc-800 cursor-pointer group/thumb"
        onClick={handlePlayClick}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
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
        
        {/* Play/Pause button overlay */}
        {(!isPlaying || (showControls && !isTouchDevice)) && !isLoading && (
          <div className={`absolute inset-0 flex items-center justify-center bg-black/20 ${isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/thumb:opacity-100'} transition-opacity`}>
            <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary-foreground fill-current" />
              ) : (
                <Play className="h-6 w-6 text-primary-foreground fill-current ml-1" />
              )}
            </div>
          </div>
        )}

        {/* Top-aligned video controls (volume & fullscreen) */}
        {isPlaying && (showControls || isTouchDevice) && (
          <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
            <button 
              className="h-8 w-8 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button 
              className="h-8 w-8 bg-black/60 backdrop-blur-sm text-white rounded-full flex items-center justify-center"
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
              <span className="text-white/70 text-xs min-w-[32px]">{formatTime(currentTime)}</span>
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
              <span className="text-white/70 text-xs min-w-[32px] text-right">{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white/70 text-sm">Video format not supported</p>
          </div>
        )}
        
        {/* Duration badge - hide when progress bar visible */}
        {!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
            {video.duration}
          </div>
        )}
        
        {/* View count - hide when progress bar visible */}
        {!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
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
