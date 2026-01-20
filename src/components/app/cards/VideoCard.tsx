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
import { motion } from 'framer-motion';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { TranslatableText } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const handleVideoError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  }, []);
  
  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={video.channel}
          avatarSeed={video.channelAvatar}
          verified={video.verified}
          contentType="video"
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
            onEnded={handleVideoEnded}
            onError={handleVideoError}
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
        {(!isPlaying || showControls) && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary-foreground fill-current" />
              ) : (
                <Play className="h-6 w-6 text-primary-foreground fill-current ml-1" />
              )}
            </div>
          </div>
        )}

        {/* Video controls */}
        {isPlaying && showControls && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
            <button 
              className="h-8 w-8 text-white hover:bg-white/20 rounded flex items-center justify-center"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button 
              className="h-8 w-8 text-white hover:bg-white/20 rounded flex items-center justify-center"
              onClick={handleFullscreen}
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white/70 text-sm">Video unavailable</p>
          </div>
        )}
        
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs text-white font-medium">
          {video.duration}
        </div>
        
        {/* View count */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
          <Eye className="w-3 h-3 text-white" />
          <span className="text-white text-xs font-medium">{video.views}</span>
        </div>
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <ActionBar postId={video.id} className="p-0 mb-2" />
        <TranslatableText text={video.title} className="text-white text-sm font-medium" as="h3" />
        <p className="text-zinc-500 text-xs mt-1">{video.uploadedAgo}</p>
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
