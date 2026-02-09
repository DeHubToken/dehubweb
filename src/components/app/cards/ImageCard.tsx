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
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2, MessageSquare, Languages, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { PostMetadata } from './PostMetadata';
import { useTranslation, LANGUAGE_NAMES } from '../TranslatableText';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { SwipeableCarousel } from '../SwipeableCarousel';
import { isWithinTabSwitchCooldown } from '@/lib/gesture-state';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { ImageTranslationSheet } from './ImageTranslationSheet';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { useImageTranslation } from '@/hooks/use-image-translation';
import { useAuth } from '@/contexts/AuthContext';
import { updateTokenVisibility, type TokenVisibility } from '@/lib/api/dehub';
import { cacheImageForNavigation } from '@/lib/post-cache';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import type { ImagePost } from '@/types/feed.types';

// Use lg breakpoint (1024px) to determine if we show drawer vs inline
function useIsTabletOrMobile() {
  const [isTabletOrMobile, setIsTabletOrMobile] = useState(false);
  
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsTabletOrMobile(mql.matches);
    mql.addEventListener('change', onChange);
    setIsTabletOrMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  
  return isTabletOrMobile;
}

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
    <div className="relative rounded-md overflow-hidden" onWheel={handleWheel} data-no-navigate>
      {/* Carousel container */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((img, idx) => (
            <div key={idx} className="flex-[0_0_100%] min-w-0">
              <div 
                className="relative cursor-pointer max-h-[600px] overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick(idx);
                }}
              >
                {/* Blurred background fill - liquid glass effect from image colors */}
                <img 
                  src={img} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-[24px] saturate-[180%] opacity-60"
                  aria-hidden="true"
                />
                <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
                {/* Actual image - natural aspect ratio */}
                <img 
                  src={img} 
                  alt="" 
                  className="relative w-full max-h-[600px] object-contain"
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
              className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 items-center justify-center text-white hover:bg-black/60 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={scrollNext}
              className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 items-center justify-center text-white hover:bg-black/60 transition-colors"
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
          className="flex items-center gap-1.5 text-xs text-white hover:text-zinc-300 transition-colors mt-1"
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
            error ? 'text-red-400' : 'text-white hover:text-zinc-300'
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();
  const isOwnPost = walletAddress && post.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);
  
  // Image translation hook
  const { isLoading: isTranslating, error: translationError, result: translationResult, translateImage, clearResult } = useImageTranslation();

  // Get images array - use imageUrls if available, otherwise fall back to single image
  const images = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : [post.image];

  const handleImageClick = (index: number) => {
    setFullscreenIndex(index);
    setFullscreenOpen(true);
  };
  
  const handleTranslateImage = useCallback(async () => {
    // Use the first image for translation (or could allow selecting which image)
    const imageUrl = images[0];
    if (!imageUrl) return;
    
    setShowTranslationSheet(true);
    await translateImage(imageUrl);
  }, [images, translateImage]);
  
  const handleCloseTranslation = useCallback(() => {
    setShowTranslationSheet(false);
    clearResult();
  }, [clearResult]);

  // Navigate to single post page when clicking non-interactive areas
  // Pre-cache post data for instant display on the single post page
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    
    // Cache the post data before navigation for instant display
    cacheImageForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`);
  }, [navigate, post.id, queryClient, post]);

  return (
    <div 
      ref={viewRef} 
      onClick={handleCardClick}
      className="overflow-hidden cursor-pointer isolate"
    >
      {/* Header with AI and menu buttons */}
      <div className="flex items-start justify-between">
        <CardHeader
          username={post.username}
          handle={post.creatorUsername}
          avatarSeed={post.avatar}
          verified={post.verified}
          contentType="image"
          creatorId={post.creatorId}
          creatorUsername={post.creatorUsername}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAIChat(true)}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all"
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <Drawer>
            <DrawerTrigger asChild>
              <button className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DrawerTrigger>
            <DrawerContent glass className="px-4 pb-6">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-white text-lg">Options</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleTranslateImage}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Languages className="w-5 h-5" /> Translate Image
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Download className="w-5 h-5" /> Download
                </button>
                <button
                  onClick={() => setShowReportModal(true)}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Flag className="w-5 h-5" /> Report
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/app/post/${post.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success('Post URL copied to clipboard');
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Link2 className="w-5 h-5" /> Copy Post URL
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Ban className="w-5 h-5" /> Block Creator
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <EyeOff className="w-5 h-5" /> See Less Like This
                </button>
                {isOwnPost && (
                  <>
                    <div className="border-t border-white/10 my-1" />
                    <button
                      onClick={async () => {
                        const next: TokenVisibility = visibility === 'public' ? 'private' : 'public';
                        try {
                          await updateTokenVisibility(post.id, next);
                          setVisibility(next);
                          toast.success(`Post set to ${next}`);
                        } catch { toast.error('Failed to update visibility'); }
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      {visibility === 'public' ? <EyeOff className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                      {visibility === 'public' ? 'Make Private' : 'Make Public'}
                    </button>
                  </>
                )}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Image Carousel - wrapped to prevent tab switching on swipe */}
      <SwipeableCarousel>
        <ImageCarousel images={images} onImageClick={handleImageClick} />
      </SwipeableCarousel>

      {/* Info & Actions */}
      <div className="pt-3 space-y-2">
        {/* Title & Description */}
        <FeedDescription 
          title={post.title} 
          description={post.description} 
        />
        
        {/* Metadata: timestamp and views */}
        <PostMetadata timestamp={post.timeAgo} viewCount={post.views} />
        
        <ActionBar 
          postId={post.id} 
          className="p-0" 
          onComment={() => setShowComments(true)} 
          isLiked={post.isLiked} 
          isDisliked={post.isDisliked}
          likeCount={post.likes}
          commentCount={post.comments}
          isOptimistic={post.isOptimistic}
        />
        

        {/* Comments - Always use Drawer for consistent liquid glass style */}
        <Drawer open={showComments} onOpenChange={setShowComments}>
          <DrawerContent glass hideHandle className="max-h-[70vh] flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
              <CommentsSection
                tokenId={post.id}
                onClose={() => setShowComments(false)}
              />
            </div>
          </DrawerContent>
        </Drawer>
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

      {/* Image Translation Sheet */}
      <ImageTranslationSheet
        isOpen={showTranslationSheet}
        onClose={handleCloseTranslation}
        isLoading={isTranslating}
        error={translationError}
        result={translationResult}
      />

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={post.id}
        contentType="image"
      />
    </div>
  );
});
