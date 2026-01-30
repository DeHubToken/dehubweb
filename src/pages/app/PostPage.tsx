/**
 * Dedicated Post Page
 * ===================
 * Displays a single post (video, image, or text) with full playback,
 * creator info, actions, and comments. Enables content sharing via direct URLs.
 */

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Share2, MoreVertical, Eye, Play, Pause, Volume2, VolumeX, Maximize, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Flag, Ban, ListPlus, Clock, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { getNFTInfo, type DeHubNFT } from '@/lib/api/dehub';
import { buildImageUrl, buildVideoUrl, buildFeedImageUrls, buildAvatarUrl } from '@/lib/media-url';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { useVideoViewTracking } from '@/hooks/use-view-tracking';
import { useTranslation, LANGUAGE_NAMES } from '@/components/app/TranslatableText';
import { ActionBar } from '@/components/app/cards/ActionBar';
import { CommentsSection } from '@/components/app/cards/CommentsSection';
import { FullscreenImageViewer } from '@/components/app/cards/FullscreenImageViewer';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Just now';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  
  return `${Math.floor(diffDays / 365)}y ago`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return views.toString();
}

// ============================================================================
// VIDEO PLAYER COMPONENT
// ============================================================================

interface VideoPlayerProps {
  videoUrl: string;
  thumbnail: string;
  tokenId: string;
}

function VideoPlayer({ videoUrl, thumbnail, tokenId }: VideoPlayerProps) {
  const instanceId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => videoPlaybackManager.globalMuted);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { onTimeUpdate: trackView } = useVideoViewTracking(tokenId);

  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    videoPlaybackManager.register(instanceId, pauseVideo);
    return () => {
      videoPlaybackManager.unregister(instanceId);
    };
  }, [instanceId, pauseVideo]);

  const handlePlayClick = useCallback(() => {
    if (!videoUrl) return;
    
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      videoPlaybackManager.stop(instanceId);
    } else {
      const currentGlobalMuted = videoPlaybackManager.globalMuted;
      setIsMuted(currentGlobalMuted);
      if (videoRef.current) {
        videoRef.current.muted = currentGlobalMuted;
      }
      
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
  }, [isPlaying, videoUrl, instanceId]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoPlaybackManager.globalMuted = newMuted;
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  }, [isMuted]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen();
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setCurrentTime(ct);
      if (dur > 0) {
        trackView(ct, dur);
      }
    }
  }, [trackView]);

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

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false);
    videoPlaybackManager.stop(instanceId);
  }, [instanceId]);

  const handleVideoError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    setIsPlaying(false);
  }, []);

  if (hasError) {
    return (
      <div className="aspect-video bg-zinc-800 flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Video format not supported</p>
          <p className="text-zinc-500 text-xs mt-1">This video uses a codec not available in your browser</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative aspect-video bg-zinc-800 cursor-pointer group"
      onClick={handlePlayClick}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => !isPlaying && setShowControls(true)}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={thumbnail}
        muted={isMuted}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        onEnded={handleVideoEnded}
        onError={handleVideoError}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className="w-full h-full object-cover"
      />

      {/* Play/Pause overlay */}
      <AnimatePresence>
        {(!isPlaying || showControls) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
          >
            {isLoading ? (
              <Loader2 className="w-16 h-16 text-white animate-spin" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-white" />
                ) : (
                  <Play className="w-8 h-8 text-white ml-1" />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls bar */}
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <span className="text-white text-xs font-mono">{formatDuration(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-1 bg-zinc-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <span className="text-white text-xs font-mono">{formatDuration(duration)}</span>
            <button onClick={toggleMute} className="text-white hover:text-zinc-300 transition-colors">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button onClick={handleFullscreen} className="text-white hover:text-zinc-300 transition-colors">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// IMAGE CAROUSEL COMPONENT
// ============================================================================

interface ImageCarouselProps {
  images: string[];
  onImageClick: (index: number) => void;
}

function ImageCarousel({ images, onImageClick }: ImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [currentIndex, setCurrentIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const hasMultiple = images.length > 1;

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((img, idx) => (
            <div key={idx} className="flex-[0_0_100%] min-w-0">
              <div 
                className="aspect-square bg-zinc-800 cursor-pointer"
                onClick={() => onImageClick(idx)}
              >
                <img 
                  src={img} 
                  alt="" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {hasMultiple && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={scrollPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={scrollNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </>
      )}

      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => emblaApi?.scrollTo(idx)}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                idx === currentIndex ? 'bg-white w-2' : 'bg-white/50 hover:bg-white/70'
              )}
            />
          ))}
        </div>
      )}

      {hasMultiple && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
          {currentIndex + 1}/{images.length}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DESCRIPTION COMPONENT
// ============================================================================

interface PostDescriptionProps {
  title?: string;
  description?: string;
}

function PostDescription({ title, description }: PostDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LENGTH = 200;

  if (!title && !description) return null;

  const fullText = [title, description].filter(Boolean).join('\n\n');

  const {
    userLang,
    isTranslated,
    translatedText,
    sourceLang,
    isLoading,
    error,
    isDetecting,
    shouldOfferTranslation,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(fullText);

  const [displayTitle, displayDescription] = (() => {
    if (isTranslated && translatedText) {
      const parts = translatedText.split('\n\n');
      if (title && description) {
        return [parts[0] || title, parts.slice(1).join('\n\n') || description];
      }
      return title ? [translatedText, undefined] : [undefined, translatedText];
    }
    return [title, description];
  })();

  const hasLongDescription = displayDescription && displayDescription.length > MAX_LENGTH;
  const shownDescription = expanded || !hasLongDescription 
    ? displayDescription 
    : `${displayDescription.slice(0, MAX_LENGTH)}...`;

  const renderTranslateControl = () => {
    if (isTranslated) {
      return (
        <button
          onClick={handleShowOriginal}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors mt-2"
        >
          Translated from {LANGUAGE_NAMES[sourceLang || ''] || sourceLang} • Show original
        </button>
      );
    }

    if (isDetecting) {
      return <span className="text-xs text-zinc-600 mt-2">Detecting language...</span>;
    }

    if (shouldOfferTranslation) {
      return (
        <button
          onClick={handleTranslate}
          disabled={isLoading}
          className={cn(
            "text-xs transition-colors mt-2",
            error ? 'text-red-400' : 'text-blue-400 hover:text-blue-300'
          )}
        >
          {isLoading ? 'Translating...' : error || `Translate to ${LANGUAGE_NAMES[userLang] || 'English'}`}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="space-y-1">
      {displayTitle && (
        <h1 className="text-white text-base font-semibold leading-tight">{displayTitle}</h1>
      )}
      {displayDescription && (
        <div>
          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">{shownDescription}</p>
          {hasLongDescription && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-500 text-xs flex items-center gap-0.5 mt-1 hover:text-zinc-400 transition-colors"
            >
              {expanded ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Show more <ChevronDown className="w-3 h-3" /></>}
            </button>
          )}
        </div>
      )}
      {renderTranslateControl()}
    </div>
  );
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function PostPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-24 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
      </div>

      {/* Media */}
      <Skeleton className="aspect-video w-full" />

      {/* Content */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-20 h-3" />
          </div>
        </div>
        <Skeleton className="w-full h-5" />
        <Skeleton className="w-3/4 h-4" />
        <Skeleton className="w-1/2 h-4" />
      </div>
    </div>
  );
}

// ============================================================================
// NOT FOUND STATE
// ============================================================================

function PostNotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <AlertCircle className="w-16 h-16 text-zinc-500 mb-4" />
      <h1 className="text-white text-xl font-semibold mb-2">Post Not Found</h1>
      <p className="text-zinc-400 text-sm text-center mb-6">
        This post may have been deleted or the link is invalid.
      </p>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Go Back
      </button>
    </div>
  );
}

// ============================================================================
// MAIN POST PAGE COMPONENT
// ============================================================================

export default function PostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(true);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);

  const { data: nftInfo, isLoading, error } = useQuery({
    queryKey: ['nft-info', postId],
    queryFn: () => getNFTInfo(postId!),
    enabled: !!postId,
    staleTime: 5 * 60 * 1000,
  });

  const handleShare = useCallback(() => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: nftInfo?.name || 'Check this out', url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    }
  }, [nftInfo?.name]);

  if (isLoading) return <PostPageSkeleton />;
  if (error || !nftInfo) return <PostNotFound />;

  // Determine content type and build media URLs
  const isVideo = nftInfo.postType === 'video';
  const isImage = nftInfo.postType === 'image';

  const videoUrl = isVideo ? buildVideoUrl(nftInfo.tokenId) : '';
  const thumbnailUrl = buildImageUrl(nftInfo.tokenId, nftInfo.imageUrl);

  // For multi-image posts
  const imageUrls = buildFeedImageUrls(nftInfo.imageUrls) || (isImage ? [thumbnailUrl] : []);

  // Creator info
  const creatorName = nftInfo.minterDisplayName || nftInfo.mintername || 'Creator';
  const creatorUsername = nftInfo.creator?.username || nftInfo.mintername;
  const creatorAvatar = buildAvatarUrl(nftInfo.minter, nftInfo.minterAvatarUrl || nftInfo.creator?.avatarImageUrl);
  const isVerified = nftInfo.creator?.isVerified || false;

  // Stats - get view count from API response
  const views = nftInfo.views ?? nftInfo.view_count ?? 0;
  const timeAgo = formatTimeAgo(nftInfo.createdAt);
  const likes = nftInfo.totalVotes?.for ?? 0;
  const dislikes = nftInfo.totalVotes?.against ?? 0;
  const commentCount = nftInfo.commentCount ?? nftInfo.comment_count ?? 0;

  const handleImageClick = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenOpen(true);
  };

  const handleProfileClick = () => {
    if (creatorUsername) {
      navigate(`/${creatorUsername.replace('@', '')}`);
    } else if (nftInfo.minter) {
      navigate(`/app/profile?id=${nftInfo.minter}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-zinc-800">
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handleShare}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-zinc-800 transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <Drawer>
              <DrawerTrigger asChild>
                <button className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-zinc-800 transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DrawerTrigger>
              <DrawerContent glass className="px-4 pb-6">
                <DrawerHeader className="pb-2">
                  <DrawerTitle className="text-white text-lg">Options</DrawerTitle>
                </DrawerHeader>
                <div className="flex flex-col gap-1">
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <img src={dehubCoin} alt="DHB" className="w-5 h-5" /> Send Tip
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <ListPlus className="w-5 h-5" /> Add to Queue
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Clock className="w-5 h-5" /> Watch Later
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Download className="w-5 h-5" /> Download
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Flag className="w-5 h-5" /> Report
                  </button>
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Ban className="w-5 h-5" /> Block Creator
                  </button>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </div>

      {/* Media Section */}
      {isVideo && videoUrl && (
        <VideoPlayer videoUrl={videoUrl} thumbnail={thumbnailUrl} tokenId={String(nftInfo.tokenId)} />
      )}
      {isImage && imageUrls.length > 0 && (
        <ImageCarousel images={imageUrls} onImageClick={handleImageClick} />
      )}

      {/* Content Section */}
      <div className="p-4 space-y-4">
        {/* Creator Info */}
        <button 
          onClick={handleProfileClick}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <Avatar className="w-10 h-10">
            {creatorAvatar && <AvatarImage src={creatorAvatar} />}
            <AvatarFallback className="bg-zinc-700 text-white font-medium">
              {creatorName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="text-white font-semibold text-sm">{creatorName}</span>
              {isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
            </div>
            {creatorUsername && (
              <span className="text-zinc-500 text-xs">@{creatorUsername.replace('@', '')}</span>
            )}
          </div>
        </button>

        {/* Title & Description */}
        <PostDescription title={nftInfo.name || nftInfo.title} description={nftInfo.description} />

        {/* Action Bar */}
        <ActionBar
          postId={String(nftInfo.tokenId)}
          className="p-0"
          onComment={() => setShowComments(!showComments)}
          isLiked={nftInfo.isLiked}
          isDisliked={nftInfo.isDisliked}
          hideDislike={isImage}
          likeCount={likes}
          dislikeCount={dislikes}
          commentCount={commentCount}
        />

        {/* Stats Row */}
        <div className="flex items-center gap-3 text-zinc-500 text-xs">
          <span className="inline-flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            {formatViews(views)} views
          </span>
          <span>•</span>
          <span>{timeAgo}</span>
        </div>
      </div>

      {/* Comments Section - Always visible by default */}
      <div className="border-t border-zinc-800">
        <AnimatePresence>
          {showComments && (
            <CommentsSection
              tokenId={String(nftInfo.tokenId)}
              onClose={() => setShowComments(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Fullscreen Image Viewer */}
      <FullscreenImageViewer
        images={imageUrls}
        initialIndex={fullscreenIndex}
        isOpen={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
      />
    </div>
  );
}
