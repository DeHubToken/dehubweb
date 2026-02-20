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
import { Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2, MessageSquare, Languages, Globe, Pencil, Trash2, Ticket, Gift, Lock, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import dehubCoinSmall from '@/assets/dehub-coin.png';
import dehubCoin from '@/assets/dehub-coin.png';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsSection } from './CommentsSection';
import { PostMetadata } from './PostMetadata';
import { PPVDrawerContent } from './PPVDrawerContent';
import { useTranslation, LANGUAGE_NAMES } from '../TranslatableText';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';
import { EditPostModal } from '../modals/EditPostModal';
import { DeletePostModal } from '../modals/DeletePostModal';
import { TipModal } from '../modals/TipModal';
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
  description,
  isTranslated,
  translatedText,
}: { 
  title?: string; 
  description?: string;
  isTranslated?: boolean;
  translatedText?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LENGTH = 150;
  
  if (!title && !description) return null;
  
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
    </div>
  );
}

export const ImageCard = memo(function ImageCard({ post }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const isOwnPost = walletAddress && post.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  
  // PPV/Bounty/Locked status
  const isPPV = post.isPPV || false;
  const isW2E = post.isW2E || false;
  const isLocked = post.isLocked || false;
  const hasBadges = isPPV || isW2E || isLocked;

  // Format numbers with abbreviations (1K, 1M, etc.)
  const formatCompact = (num: number): string => {
    if (num >= 1000000) return `${Math.floor(num / 1000000)}M`;
    if (num >= 1000) return `${Math.floor(num / 1000)}K`;
    return String(num);
  };
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);
  
  // Translation hook for text content
  const descriptionText = [post.title, post.description].filter(Boolean).join('\n\n');
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    handleTranslate,
    handleShowOriginal,
  } = useTranslation(descriptionText);
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
    // Don't navigate if a drawer is open (PPV/Bounty/Locked)
    if (showPPVDrawer || showBountyDrawer || showLockedDrawer) return;
    
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    
    // Cache the post data before navigation for instant display
    cacheImageForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`);
  }, [navigate, post.id, queryClient, post, showPPVDrawer, showBountyDrawer, showLockedDrawer]);

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
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all"
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
            <DrawerTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); openLoginModal(); } }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DrawerTrigger>
            <DrawerContent glass className="px-4 pb-6">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-1">
                {!isOwnPost && (
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <img src={dehubCoin} alt="DHB" className="w-5 h-5" /> {t('postOptions.sendTip')}
                  </button>
                )}
                <button
                  onClick={handleTranslateImage}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Languages className="w-5 h-5" /> {t('postOptions.translateImage')}
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Download className="w-5 h-5" /> {t('postOptions.download')}
                </button>
                <button
                  onClick={() => setShowReportModal(true)}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Flag className="w-5 h-5" /> {t('postOptions.report')}
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/app/post/${post.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success(t('postOptions.postUrlCopied'));
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Link2 className="w-5 h-5" /> {t('postOptions.copyPostUrl')}
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Ban className="w-5 h-5" /> {t('postOptions.blockCreator')}
                </button>
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <EyeOff className="w-5 h-5" /> {t('postOptions.seeLessLikeThis')}
                </button>
                {isOwnPost && (
                  <>
                    <div className="border-t border-white/10 my-1" />
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      <Trash2 className="w-5 h-5" /> {t('postOptions.deletePost')}
                    </button>
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
      <div className="relative">
        {isPPV ? (
          <>
            {/* PPV: show blurred image with ticket overlay */}
            <div className="relative rounded-md overflow-hidden">
              <img 
                src={images[0]} 
                alt="" 
                className="w-full max-h-[600px] object-cover blur-lg"
                loading="lazy"
              />
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
                onTouchStart={(e) => {
                  (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const start = (e.currentTarget as any)._touchStart;
                  if (!start) return;
                  const touch = e.changedTouches[0];
                  const dx = Math.abs(touch.clientX - start.x);
                  const dy = Math.abs(touch.clientY - start.y);
                  if (dx < 10 && dy < 10) {
                    e.preventDefault();
                    setShowPPVDrawer(true);
                  }
                }}
              >
                <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                  <Ticket className="h-7 w-7 text-white" />
                </div>
                <p className="text-white font-semibold text-sm mb-1">Pay-Per-View Content</p>
                <p className="text-white/70 text-xs">
                  Unlock for {formatCompact(Number(post.ppvPrice))} {post.ppvCurrency || 'USDC'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <SwipeableCarousel>
            <ImageCarousel images={images} onImageClick={handleImageClick} />
          </SwipeableCarousel>
        )}

        {/* Content Type Badges - PPV/Bounty/Locked */}
        {hasBadges && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
            {/* PPV Badge */}
            {isPPV && post.ppvPrice && (
              <button 
                className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
              >
                <Ticket className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {formatCompact(Number(post.ppvPrice))} {post.ppvCurrency || 'USDC'}
                </span>
              </button>
            )}
            
            {/* Bounty Badge */}
            {isW2E && (
              <button 
                className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowBountyDrawer(true); }}
              >
                <Gift className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {post.bountyAmount && post.bountyAmount > 0 
                    ? `${formatCompact(post.bountyAmount)} ${post.bountyCurrency || 'DHB'}` 
                    : 'Bounty'}
                </span>
              </button>
            )}
            
            {/* Locked/Gated Badge */}
            {isLocked && (
              <button 
                className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowLockedDrawer(true); }}
              >
                <Lock className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {post.lockedPrice && post.lockedPrice > 0 
                    ? `${formatCompact(post.lockedPrice)} ${post.lockedCurrency || 'DHB'}` 
                    : ''}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info & Actions */}
      <div className="pt-3 space-y-2">
        {/* Title & Description */}
        <FeedDescription 
          title={post.title} 
          description={post.description}
          isTranslated={isTranslated}
          translatedText={translatedText}
        />
        
        {/* Metadata: timestamp and views */}
        <PostMetadata 
          timestamp={post.timeAgo} 
          viewCount={post.views}
          translateControl={{
            isTranslated,
            isLoading: isTranslateLoading,
            error: translateError,
            onTranslate: handleTranslate,
            onShowOriginal: handleShowOriginal,
          }}
        />
        
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

      {/* Edit Post Modal */}
      <EditPostModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        tokenId={post.id}
        currentTitle={post.title}
        currentDescription={post.description}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
        }}
      />

      {/* Delete Post Modal */}
      <DeletePostModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        tokenId={post.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
          queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
        }}
      />

      {/* Tip Modal */}
      <TipModal
        open={showTipModal}
        onOpenChange={setShowTipModal}
        creatorAddress={post.creatorId}
        creatorName={post.username}
        context={post.id}
      />

      {/* PPV Drawer - controlled, rendered at root level for mobile compatibility */}
      {isPPV && post.ppvPrice && (
        <Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
          <PPVDrawerContent
            tokenId={post.id}
            price={Number(post.ppvPrice)}
            currency={post.ppvCurrency || 'DHB'}
            creatorAddress={post.creatorId}
            onClose={() => setShowPPVDrawer(false)}
            formatCompact={formatCompact}
          />
        </Drawer>
      )}

      {/* Bounty Drawer - controlled, rendered at root level for mobile compatibility */}
      {isW2E && (
        <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                {post.bountyViews && post.bountyViews > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstViews', { count: post.bountyViews })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedWatching')}</p>
                    </div>
                  </div>
                )}
                {post.bountyComments && post.bountyComments > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t('drawers.firstComments', { count: post.bountyComments })}</p>
                      <p className="text-zinc-400 text-xs">{t('drawers.rewardedEngaging')}</p>
                    </div>
                  </div>
                )}
              </div>
              {post.bountyAmount && post.bountyAmount > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.rewardPerUser')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{post.bountyAmount} {post.bountyCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.bountyDescription')}
              </p>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Locked Drawer - controlled, rendered at root level for mobile compatibility */}
      {isLocked && (
        <Drawer open={showLockedDrawer} onOpenChange={setShowLockedDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-3">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-4">
              {post.lockedPrice && post.lockedPrice > 0 && (
                <div className="flex items-center justify-between px-4 py-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white text-sm">{t('drawers.mustHoldToView')}</span>
                  <div className="flex items-center gap-2">
                    <img src={dehubCoinSmall} alt="DHB" className="w-5 h-5" />
                    <span className="text-white text-lg font-bold">{formatCompact(post.lockedPrice)} {post.lockedCurrency || 'DHB'}</span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.gatedDescription')}
              </p>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
});
