/**
 * Image Card Component
 * ====================
 * Displays image post content with Instagram-style swipeable carousel for multi-image posts.
 * 
 * @example
 * ```tsx
 * <ImageCard post={imageData} />
 * ```
 */

import { useState, memo, useCallback, useEffect, useRef, useMemo } from 'react';
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { useTranslation, LANGUAGE_NAMES } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { SwipeableCarousel } from '../SwipeableCarousel';
import { isWithinTabSwitchCooldown } from '@/lib/gesture-state';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ImagePost } from '@/types/feed.types';

interface ImageCardProps {
  post: ImagePost;
}

/**
 * Instagram-style image carousel component
 * Supports swipe navigation with dot indicators
 */
function ImageCarousel({ 
  images, 
  onImageClick 
}: { 
  images: string[];
  onImageClick: (index: number) => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Gesture lock refs for trackpad navigation
  const gestureTriggered = useRef(false);
  const gestureLockTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const TRACKPAD_THRESHOLD = 50;
  const GESTURE_LOCK_DURATION = 400;
  const TAB_SWITCH_COOLDOWN = 500; // Ignore gestures for 500ms after any tab switch
  
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  
  // Set up the select callback when emblaApi becomes available
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
  
  // Handle trackpad swipe for image navigation - one gesture = one image
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!emblaApi || images.length <= 1) return;
    
    // Ignore gestures during global tab switch cooldown (prevents bleed-through)
    if (isWithinTabSwitchCooldown(TAB_SWITCH_COOLDOWN)) return;
    
    // LOCKED? Ignore all events until lock expires
    if (gestureTriggered.current) return;
    
    const absDeltaX = Math.abs(e.deltaX);
    const absDeltaY = Math.abs(e.deltaY);
    
    // Only respond to horizontal swipes
    if (absDeltaY > absDeltaX) return;
    
    // Stop propagation to prevent tab switching
    e.stopPropagation();
    
    // Single event threshold check
    if (absDeltaX > TRACKPAD_THRESHOLD) {
      if (e.deltaX > 0) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollPrev();
      }
      
      gestureTriggered.current = true;
      if (gestureLockTimeout.current) clearTimeout(gestureLockTimeout.current);
      gestureLockTimeout.current = setTimeout(() => {
        gestureTriggered.current = false;
      }, GESTURE_LOCK_DURATION);
    }
  }, [emblaApi, images.length]);
  
  const hasMultiple = images.length > 1;
  
  return (
    <div className="relative" onWheel={handleWheel}>
      {/* Carousel container */}
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
      
      {/* Navigation arrows - only show if multiple images */}
      {hasMultiple && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={scrollPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={scrollNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </>
      )}
      
      {/* Dot indicators - only show if multiple images */}
      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => emblaApi?.scrollTo(idx)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                idx === currentIndex 
                  ? 'bg-white w-2' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}
      
      {/* Image counter badge - only show if multiple images */}
      {hasMultiple && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
          {currentIndex + 1}/{images.length}
        </div>
      )}
    </div>
  );
}

/**
 * Feed description component with expandable text
 * Uses useTranslation hook directly to properly display translated content
 */
function FeedDescription({ 
  title, 
  description 
}: { 
  title?: string; 
  description?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LENGTH = 150;
  
  if (!title && !description) return null;
  
  // Combine texts for translation (use newlines to split later)
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
  
  // Parse translated text back into title/description
  const [displayTitle, displayDescription] = useMemo(() => {
    if (isTranslated && translatedText) {
      const parts = translatedText.split('\n\n');
      if (title && description) {
        return [parts[0] || title, parts.slice(1).join('\n\n') || description];
      }
      return title ? [translatedText, undefined] : [undefined, translatedText];
    }
    return [title, description];
  }, [isTranslated, translatedText, title, description]);
  
  const hasLongDescription = displayDescription && displayDescription.length > MAX_LENGTH;
  const shownDescription = expanded || !hasLongDescription 
    ? displayDescription 
    : `${displayDescription.slice(0, MAX_LENGTH)}...`;
  
  // Render translation control
  const renderTranslateControl = () => {
    if (isTranslated) {
      return (
        <button
          onClick={handleShowOriginal}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors mt-1"
        >
          <span>
            Translated from {LANGUAGE_NAMES[sourceLang || ''] || sourceLang}
            {' • Show original'}
          </span>
        </button>
      );
    }

    if (isDetecting) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-zinc-600 mt-1">
          <span>Detecting language...</span>
        </span>
      );
    }

    if (shouldOfferTranslation) {
      return (
        <button
          onClick={handleTranslate}
          disabled={isLoading}
          className={`flex items-center gap-1.5 text-xs transition-colors mt-1 ${
            error ? 'text-red-400' : 'text-blue-400 hover:text-blue-300'
          }`}
        >
          {isLoading ? (
            <span>Translating...</span>
          ) : error ? (
            <span>{error}</span>
          ) : (
            <span>Translate to {LANGUAGE_NAMES[userLang] || 'English'}</span>
          )}
        </button>
      );
    }

    return null;
  };
  
  return (
    <div className="space-y-1">
      {displayTitle && (
        <h3 className="text-white text-sm font-semibold leading-tight">
          {displayTitle}
        </h3>
      )}
      {displayDescription && (
        <div>
          <p className="text-zinc-300 text-sm leading-relaxed">
            {shownDescription}
          </p>
          {hasLongDescription && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-zinc-500 text-xs flex items-center gap-0.5 mt-1 hover:text-zinc-400 transition-colors"
            >
              {expanded ? (
                <>Show less <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Show more <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
      )}
      {renderTranslateControl()}
    </div>
  );
}

export const ImageCard = memo(function ImageCard({ post }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);

  // Get images array - use imageUrls if available, otherwise fall back to single image
  const images = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : [post.image];

  const handleImageClick = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenOpen(true);
  };

  return (
    <div ref={viewRef} className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header with AI and menu buttons */}
      <div className="flex items-center justify-between">
        <CardHeader
          username={post.username}
          avatarSeed={post.avatar}
          verified={post.verified}
          contentType="image"
          creatorId={post.creatorId}
          creatorUsername={post.creatorUsername}
        />
        <div className="flex items-center gap-1 pr-3">
          <button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all"
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Flag className="w-4 h-4" /> Report
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  const url = `${window.location.origin}/app/post/${post.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Post URL copied to clipboard');
                }}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Link2 className="w-4 h-4" /> Copy Post URL
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <Ban className="w-4 h-4" /> Block Creator
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                <EyeOff className="w-4 h-4" /> See Less Like This
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Image Carousel - wrapped to prevent tab switching on swipe */}
      <SwipeableCarousel>
        <ImageCarousel images={images} onImageClick={handleImageClick} />
      </SwipeableCarousel>

      {/* Info & Actions */}
      <div className="p-3 space-y-2">
        <ActionBar 
          postId={post.id} 
          className="p-0" 
          onComment={() => setShowComments(true)} 
          isLiked={post.isLiked} 
          isDisliked={post.isDisliked}
          hideDislike
          likeCount={post.likes}
          commentCount={post.comments}
        />
        
        
        
        {/* Title & Description */}
        <FeedDescription 
          title={post.title} 
          description={post.description} 
        />
        
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-xs">{post.timeAgo}</span>
          <span className="inline-flex items-center gap-1 text-zinc-500 text-xs leading-none">
            <Eye className="w-3 h-3 shrink-0 translate-y-[0.5px]" />
            <span className="leading-none">{post.views || '0'}</span>
          </span>
        </div>

        {/* Inline Comments Section - inside padded container to match VideoCard */}
        <AnimatePresence>
          {showComments && (
            <CommentsSection
              tokenId={post.id}
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
          type: 'image',
          author: post.username,
          caption: post.description || post.title || post.caption,
          imageUrl: post.image
        }}
      />

      {/* Fullscreen Image Viewer */}
      <FullscreenImageViewer
        images={images}
        initialIndex={fullscreenIndex}
        isOpen={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
      />
    </div>
  );
});
