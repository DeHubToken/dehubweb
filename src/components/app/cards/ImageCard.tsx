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
import { hasCommunityLink, stripCommunityLinks } from '@/components/app/communities/CommunityLinkEmbed';
import { useAutoOpenComments } from '@/hooks/use-auto-open-comments';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Music, Pause, Eye, MoreVertical, Download, Flag, Ban, EyeOff, Sparkles, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2, MessageSquare, Languages, Globe, Info, Trash2, Ticket, Gift, Lock, MessageCircle, Gem, X, BarChart2, Plus, Bookmark, Pin } from 'lucide-react';
import { useCreatePoll } from '@/hooks/use-polls';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import dehubCoinSmall from '@/assets/dehub-coin.png';
import dehubCoin from '@/assets/dehub-coin.png';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { CommentsWrapper } from './CommentsWrapper';
import { PostMetadata } from './PostMetadata';
import { PPVDrawerContent } from './PPVDrawerContent';
import { useTranslation, LANGUAGE_NAMES, renderTextWithLinks } from '../TranslatableText';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChat } from './PostAIChat';
import { ReportModal } from '../modals/ReportModal';

import { DeletePostModal } from '../modals/DeletePostModal';
import { QuotePostModal } from '../modals/QuotePostModal';
import { QuotedPostEmbed } from './QuotedPostEmbed';
import { TipModal } from '../modals/TipModal';
import { SwipeableCarousel } from '../SwipeableCarousel';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
import { isWithinTabSwitchCooldown } from '@/lib/gesture-state';
import { useDoubleTapLike } from '@/hooks/use-double-tap-like';
import { useConnectionQuality } from '@/hooks/use-connection-quality';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { ImageTranslationSheet } from './ImageTranslationSheet';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { useImageTranslation } from '@/hooks/use-image-translation';
import { useAuth } from '@/contexts/AuthContext';
import { VerifyUnlockButton } from './VerifyUnlockButton';
import { updateTokenVisibility, repostPost, type TokenVisibility } from '@/lib/api/dehub';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin } from '@/hooks/use-pins';
import { cacheImageForNavigation } from '@/lib/post-cache';
import { isTokenUnlocked, markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  wasDrawerJustDismissed,
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
  /** First few feed items — skip lazy loading so LCP image loads immediately */
  aboveFold?: boolean;
}

/**
 * Single slide inside the Instagram-style carousel. Extracted so we can
 * safely call the double-tap-to-like hook per-image (hooks may not run
 * inside a .map callback).
 */
function ImageSlide({
  img,
  idx,
  aboveFold,
  postId,
  onImageClick,
}: {
  img: string;
  idx: number;
  aboveFold: boolean;
  postId?: string;
  onImageClick: (index: number) => void;
}) {
  const { onClick } = useDoubleTapLike({
    postId,
    onSingleTap: () => onImageClick(idx),
  });
  // Data-Saver / slow network: drop the decorative blur-fill. It re-decodes the
  // full-size image and runs a 24px blur+saturate composite per slide — wasted
  // GPU/decode on the low-end devices that usually pair with a slow connection.
  const { liteMode } = useConnectionQuality();
  return (
    <div
      className="relative cursor-pointer max-h-[600px] overflow-hidden select-none"
      style={{ minHeight: '200px' }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {/* Blurred background fill — skipped on above-fold cards so it
          never delays LCP (background-image is an LCP candidate in Chrome 96+),
          and skipped entirely in Lite mode to save the extra decode/blur. */}
      {!liteMode && !(aboveFold && idx === 0) && (
        <div
          className="absolute inset-0 scale-110 blur-[24px] saturate-[180%] opacity-60"
          style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <img
        src={img}
        alt=""
        className="relative w-full max-h-[600px] object-contain"
        loading={aboveFold && idx === 0 ? 'eager' : 'lazy'}
        fetchPriority={aboveFold && idx === 0 ? 'high' : 'auto'}
        decoding={aboveFold && idx === 0 ? 'sync' : 'async'}
        draggable={false}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}

/**
 * Instagram-style image carousel component
 * Supports swipe navigation with dot indicators
 */
function ImageCarousel({
  images,
  onImageClick,
  onIndexChange,
  aboveFold = false,
  postId,
}: {
  images: string[];
  onImageClick: (index: number) => void;
  onIndexChange?: (index: number) => void;
  aboveFold?: boolean;
  postId?: string;
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
    const idx = emblaApi.selectedScrollSnap();
    setCurrentIndex(idx);
    onIndexChange?.(idx);
  }, [emblaApi, onIndexChange]);
  
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
    <div data-media-full className="relative rounded-2xl overflow-hidden" onWheel={handleWheel} data-no-navigate>
      {/* Carousel container */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((img, idx) => (
            <div key={idx} className="flex-[0_0_100%] min-w-0">
              <ImageSlide
                img={img}
                idx={idx}
                aboveFold={aboveFold}
                postId={postId}
                onImageClick={onImageClick}
              />
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
  
  // Suppress duplicate: if description starts with the title text, strip it out
  const dedupedDescription = useMemo(() => {
    if (!displayTitle || !displayDescription) return displayDescription;
    const trimTitle = displayTitle.trim();
    const trimDesc = displayDescription.trim();
    if (trimDesc === trimTitle) return undefined;
    if (trimDesc.startsWith(trimTitle)) {
      const rest = trimDesc.slice(trimTitle.length).replace(/^\s*\n+/, '').trim();
      return rest || undefined;
    }
    return displayDescription;
  }, [displayTitle, displayDescription]);

  const hasLongDescription = dedupedDescription && dedupedDescription.length > MAX_LENGTH;
  const shownDescription = expanded || !hasLongDescription 
    ? dedupedDescription 
    : `${dedupedDescription.slice(0, MAX_LENGTH)}...`;
  
  if (!title && !description) return null;

  // Strip community URLs from display text — card embed handles them visually elsewhere
  const cleanedTitle = displayTitle && hasCommunityLink(displayTitle) ? stripCommunityLinks(displayTitle) : displayTitle;
  const cleanedShownDescription = shownDescription && hasCommunityLink(shownDescription) ? stripCommunityLinks(shownDescription) : shownDescription;

  return (
    <div className="space-y-1">
      {cleanedTitle && (
        <h3 className="text-white text-sm font-semibold leading-tight">
          {renderTextWithLinks(cleanedTitle)}
        </h3>
      )}
      {cleanedShownDescription && (
        <div>
          <p className="text-zinc-300 text-sm leading-relaxed">
            {renderTextWithLinks(cleanedShownDescription)}
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

export const ImageCard = memo(function ImageCard({ post, aboveFold = false }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialTab, setCommentsInitialTab] = useState<'replies' | 'quotes' | 'reposts' | 'search' | undefined>(undefined);
  useAutoOpenComments(setShowComments);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollExpiry, setPollExpiry] = useState('');
  const createPollMutation = useCreatePoll();
  const { data: tipCount = 0 } = usePostTipCount(post.id);
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const isOwnPost = walletAddress && post.creatorId?.toLowerCase() === walletAddress.toLowerCase();
  const openPostInfoPage = useCallback(() => {
    setShowOptionsDrawer(false);
    navigate(`/app/post/${post.id}/info`);
  }, [navigate, post.id]);
  // Bookmark/pin state for the mobile/tablet three-dot menu (desktop shows
  // these in the ActionBar's left-anchored utility cluster instead).
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(post.id);
  const [isPinned, setIsPinned] = useState(false);
  const togglePinMutation = useTogglePin();
  const postTokenId = parseInt(post.id, 10) || undefined;

  // PPV/Bounty/Locked status - bypass for owners & already-unlocked content
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const storedUnlocked = isTokenUnlocked(post.id);
  const canBypassGating = !!(isOwnPost || post.isOwner || post.isUnlocked || locallyUnlocked || storedUnlocked);
  const isPPV = (post.isPPV || false) && !canBypassGating;
  const isW2E = (post.isW2E || false) && !canBypassGating;
  const isLocked = (post.isLocked || false) && !canBypassGating;
  const isComboLocked = isPPV && isLocked;
  // PPV/Lock badges are redundant with the centered overlay, so only show bounty here
  const hasBadges = isW2E;


  // Format numbers with abbreviations (1K, 1M, etc.)
  const formatCompact = (num: number | null | undefined): string => {
    const n = Number(num);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1000000) return `${Math.floor(n / 1000000)}M`;
    if (n >= 1000) return `${Math.floor(n / 1000)}K`;
    return String(Math.floor(n));
  };
  
  // View tracking - batches views when post is visible for 2+ seconds
  const viewRef = useFeedViewTracking(post.id);

  // Soundtrack: user-initiated play/pause; auto-pause when card scrolls out of view
  const soundtrackAudioRef = useRef<HTMLAudioElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const handleSoundtrackToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = soundtrackAudioRef.current;
    console.log('[Soundtrack] badge clicked', { audioEl: !!audio, src: audio?.src, isAudioPlaying, readyState: audio?.readyState, networkState: audio?.networkState });
    if (!audio) { console.warn('[Soundtrack] no audio element ref'); return; }
    if (isAudioPlaying) {
      audio.pause();
      setIsAudioPlaying(false);
    } else {
      console.log('[Soundtrack] calling audio.play()...');
      audio.play()
        .then(() => { console.log('[Soundtrack] play() resolved OK'); setIsAudioPlaying(true); })
        .catch((err) => { console.error('[Soundtrack] play() rejected:', err); });
    }
  }, [isAudioPlaying]);

  useEffect(() => {
    if (!post.soundtrackUrl) return;
    console.log('[Soundtrack] effect running, post.id=', post.id, 'url=', post.soundtrackUrl);
    const audio = soundtrackAudioRef.current;
    console.log('[Soundtrack] audio ref at effect time:', audio ? 'EXISTS' : 'NULL', audio?.src);
    if (audio) {
      audio.onerror = () => console.error('[Soundtrack] audio error, code:', audio.error?.code, 'msg:', audio.error?.message, 'src:', audio.src);
      audio.oncanplay = () => console.log('[Soundtrack] canplay, readyState=', audio.readyState);
      audio.onloadstart = () => console.log('[Soundtrack] loadstart, src=', audio.src);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        const aud = soundtrackAudioRef.current;
        if (!aud) return;
        if (entry.isIntersecting) {
          console.log('[Soundtrack] in-view, attempting autoplay');
          aud.play()
            .then(() => { console.log('[Soundtrack] autoplay OK'); setIsAudioPlaying(true); })
            .catch((err) => { console.warn('[Soundtrack] autoplay blocked:', err.name, err.message); });
        } else {
          aud.pause();
          setIsAudioPlaying(false);
        }
      },
      { threshold: 0.5 }
    );
    if (viewRef.current) observer.observe(viewRef.current);
    return () => observer.disconnect();
  }, [post.soundtrackUrl]);
  
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

  // Repost handler
  const handleRepost = useCallback(async () => {
    if (!walletAddress) { openLoginModal(); return; }
    const numericId = parseInt(post.id, 10);
    if (isNaN(numericId)) return;
    try {
      await repostPost(numericId);
      // Mark caches stale WITHOUT refetching now — refetching the unified feed
      // tears down the infinite-scroll list and snaps the user back to the top.
      queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-reposts'], refetchType: 'none' });
    } catch {
      toast.error('Failed to repost');
    }
  }, [post.id, walletAddress, openLoginModal, queryClient]);

  // Quote handler
  const handleQuote = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    setShowQuoteModal(true);
  }, [walletAddress, openLoginModal]);

  // Build minimal NFT for quote modal
  const postAsNFT = {
    tokenId: parseInt(post.id, 10) || 0,
    name: post.title || post.caption || '',
    description: post.description || post.caption || '',
    imageUrl: post.image || '',
    postType: 'feed-images' as const,
    minter: post.creatorId || '',
    minterUsername: post.creatorUsername || '',
    minterDisplayName: post.username,
    minterAvatarUrl: post.avatar,
    createdAt: post.createdAt || '',
  };

  // Navigate to single post page when clicking non-interactive areas
  // Pre-cache post data for instant display on the single post page
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't navigate if a drawer is open, or was just dismissed by a scrim tap
    // (that tap leaves a ghost click that would otherwise open the post).
    if (wasDrawerJustDismissed()) return;
    if (showPPVDrawer || showBountyDrawer || showLockedDrawer) return;

    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], [data-no-navigate]');
    if (isInteractive) return;
    // Allow text selection without navigating
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    
    // Cache the post data before navigation for instant display
    cacheImageForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`, { state: { fromFeed: true } });
  }, [navigate, post.id, queryClient, post, showPPVDrawer, showBountyDrawer, showLockedDrawer]);

  return (
    <div
      ref={viewRef}
      onClick={handleCardClick}
      className="overflow-visible cursor-pointer isolate"
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
          badgeBalance={post.creatorBadgeBalance}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all"
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-[23.5px] h-[23.5px]" />
          </button>
          <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
            <DrawerTrigger asChild>
              <button onClick={(e) => { if (!walletAddress) { e.preventDefault(); openLoginModal(); } }} className="text-zinc-400 hover:text-white transition-colors -mr-0.5">
                <MoreVertical className="w-[23.5px] h-[23.5px]" />
              </button>
            </DrawerTrigger>
            <DrawerContent glass className="px-4 pb-6">
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-1">
                {/* Bookmark / Post info — mobile/tablet only; desktop shows these
                    anchored left in the bottom action bar instead. */}
                <button
                  onClick={() => { toggleBookmark(); }}
                  disabled={isBookmarkLoading}
                  className={cn(
                    "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50",
                    isBookmarked ? "text-yellow-500" : "text-white"
                  )}
                >
                  <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
                  {isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                </button>
                <button
                  onClick={openPostInfoPage}
                  className="lg:hidden flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Info className="w-5 h-5" /> Post info
                </button>
                {!isOwnPost && (
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setShowTipModal(true); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Gem className="w-5 h-5" /> {t('postOptions.sendTip')}
                  </button>
                )}
                <button
                  onClick={() => { setShowOptionsDrawer(false); setTimeout(() => handleTranslateImage(), 300); }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Languages className="w-5 h-5" /> {t('postOptions.translateImage')}
                </button>
                {!isPPV && !isW2E && !isLocked && (
                  <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                    <Download className="w-5 h-5" /> {t('postOptions.download')}
                  </button>
                )}
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
                      onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowPollCreator(true), 300); }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                    >
                      <BarChart2 className="w-5 h-5" /> Create Poll
                    </button>
                    <button
                      onClick={() => {
                        if (!postTokenId || togglePinMutation.isPending) return;
                        togglePinMutation.mutate(postTokenId, {
                          onSuccess: (data) => setIsPinned(data.pinned),
                        });
                      }}
                      disabled={!postTokenId || togglePinMutation.isPending}
                      className={cn(
                        "lg:hidden flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40",
                        isPinned ? "text-blue-400" : "text-white"
                      )}
                    >
                      <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />
                      {isPinned ? 'Unpin post' : 'Pin post'}
                    </button>
                    <button
                      onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowDeleteModal(true), 300); }}
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
        {isComboLocked ? (
          <>
            {/* Combo PPV + Holdings Locked: blurred image with dual icons */}
            <div className="relative rounded-2xl overflow-hidden">
              <img src={images[0]} alt="" className="w-full max-h-[600px] object-cover blur-lg" loading="lazy" />
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
                onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const start = (e.currentTarget as any)._touchStart;
                  if (!start) return;
                  const touch = e.changedTouches[0];
                  if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowPPVDrawer(true); }
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Ticket className="h-6 w-6 text-white" />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10">
                    <Lock className="h-6 w-6 text-white" />
                  </div>
                </div>
                <p className="text-white font-semibold text-sm mb-1">
                  Unlock for {formatCompact(Number(post.ppvPrice))} {post.ppvCurrency || 'DHB'}
                </p>
                <p className="text-white/70 text-xs">
                  Must be holding {formatCompact(Number(post.lockedPrice))} {post.lockedCurrency || 'DHB'}
                </p>
              </div>
            </div>
          </>
        ) : isPPV ? (
          <>
            {/* PPV only: blurred image with ticket overlay */}
            <div className="relative rounded-2xl overflow-hidden">
              <img src={images[0]} alt="" className="w-full max-h-[600px] object-cover blur-lg" loading="lazy" />
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowPPVDrawer(true); }}
                onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const start = (e.currentTarget as any)._touchStart;
                  if (!start) return;
                  const touch = e.changedTouches[0];
                  if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowPPVDrawer(true); }
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
        ) : isLocked ? (
          <>
            {/* Holdings Locked: blurred image with lock icon overlay */}
            <div className="relative rounded-2xl overflow-hidden">
              <img src={images[0]} alt="" className="w-full max-h-[600px] object-cover blur-lg" loading="lazy" />
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowLockedDrawer(true); }}
                onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const start = (e.currentTarget as any)._touchStart;
                  if (!start) return;
                  const touch = e.changedTouches[0];
                  if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowLockedDrawer(true); }
                }}
              >
                <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                  <Lock className="h-7 w-7 text-white" />
                </div>
                <p className="text-white font-semibold text-sm mb-1">Holdings Required</p>
                <p className="text-white/70 text-xs">
                  Must be holding {formatCompact(Number(post.lockedPrice))} {post.lockedCurrency || 'DHB'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <SwipeableCarousel>
            <ImageCarousel images={images} onImageClick={handleImageClick} onIndexChange={setActiveImageIndex} aboveFold={aboveFold} postId={post.id} />
          </SwipeableCarousel>
        )}

        {/* Soundtrack badge — bottom-left, tap to play/pause */}
        {post.soundtrackUrl && post.soundtrackTitle && (
          <button
            type="button"
            data-no-navigate
            onClick={handleSoundtrackToggle}
            className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/40 backdrop-blur-[16px] px-2 py-1 rounded-lg border border-white/10 max-w-[60%] hover:bg-black/60 transition-colors"
          >
            {isAudioPlaying
              ? <Pause className="w-3 h-3 text-white flex-shrink-0" />
              : <Music className="w-3 h-3 text-white flex-shrink-0" />
            }
            <span className="text-white text-[10px] truncate">
              {post.soundtrackTitle}{post.soundtrackCreator ? ` — ${post.soundtrackCreator}` : ''}
            </span>
          </button>
        )}

        {/* Hidden audio element for soundtrack playback */}
        {post.soundtrackUrl && (
          <audio ref={soundtrackAudioRef} src={post.soundtrackUrl} loop preload="metadata" className="hidden" />
        )}

        {/* Content Type Badges - Bounty only (PPV/Lock are shown via centered overlay) */}
        {hasBadges && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
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

        {/* Quoted post embed (Twitter-style) */}
        {post.isQuotePost && post.quotedPost && (
          <QuotedPostEmbed quotedPost={post.quotedPost} className="mt-2" />
        )}
        
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
          tokenId={parseInt(post.id, 10) || undefined}
          isOwnPost={!!isOwnPost}
          utilityDesktopAnchor
          className="p-0"
          // While fullscreen is open its own action bar owns double-tap-to-like;
          // mute this one so a single double-tap doesn't cast two votes.
          enableDoubleTapLike={!fullscreenOpen}
          onComment={() => {
            setCommentsInitialTab(undefined);
            setShowComments(prev => !prev);
          }} 
          onRepost={handleRepost}
          onQuote={handleQuote}
          isLiked={post.isLiked} 
          isDisliked={post.isDisliked}
          likeCount={post.likes}
          commentCount={post.comments}
          repostCount={post.repostCount}
          isReposted={post.isReposted}
          isOptimistic={post.isOptimistic}
          tipCount={tipCount}
          onTip={() => setShowTipModal(true)}
          onSeeEngagements={() => {
            setCommentsInitialTab('reposts');
            setShowComments(true);
          }}
        />
        

        {/* Comments */}
        <CommentsWrapper
          open={showComments}
          onOpenChange={setShowComments}
          tokenId={post.id}
          initialTab={commentsInitialTab}
        />
      </div>

      {/* AI Chat */}
      <PostAIChat
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          type: 'image',
          author: post.username,
          caption: post.description || post.title || post.caption,
          imageUrl: images[activeImageIndex] || post.image,
          imageUrls: images.length > 1 ? images : undefined,
          activeImageIndex: images.length > 1 ? activeImageIndex : undefined,
        }}
      />

      {/* Fullscreen Image Viewer */}
      <FullscreenImageViewer
        images={images}
        initialIndex={fullscreenIndex}
        isOpen={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        postId={post.id}
        actions={{
          isLiked: post.isLiked,
          isDisliked: post.isDisliked,
          likeCount: post.likes,
          commentCount: post.comments,
          repostCount: post.repostCount,
          isReposted: post.isReposted,
          tipCount,
          isOwnPost: !!isOwnPost,
          tokenId: parseInt(post.id, 10) || undefined,
          // This bar owns double-tap-to-like while fullscreen is open.
          enableDoubleTapLike: fullscreenOpen,
          // Comment/tip need drawers (z-[100]) that would sit behind the viewer —
          // close fullscreen first, then open them on the card.
          onComment: () => {
            setFullscreenOpen(false);
            setCommentsInitialTab(undefined);
            setShowComments(true);
          },
          onRepost: handleRepost,
          onTip: () => {
            setFullscreenOpen(false);
            setShowTipModal(true);
          },
        }}
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
        tokenId={post.id}
      />

      {/* PPV Drawer - controlled, rendered at root level for mobile compatibility */}
      {(isPPV || isComboLocked) && (
        <Drawer open={showPPVDrawer} onOpenChange={setShowPPVDrawer}>
          <PPVDrawerContent
            tokenId={post.id}
            price={Number(post.ppvPrice ?? 0)}
            currency={post.ppvCurrency || 'DHB'}
            creatorAddress={post.creatorId}
            chainId={post.chainId}
            onClose={() => setShowPPVDrawer(false)}
            onUnlocked={() => {
              setLocallyUnlocked(true);
              markTokenUnlocked(post.id);
              queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
              queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
              queryClient.invalidateQueries({ queryKey: ['nft-info', post.id] });
            }}
            formatCompact={formatCompact}
          />
        </Drawer>
      )}

      {/* Bounty Drawer - controlled, rendered at root level for mobile compatibility */}
      {isW2E && (
        <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Gift className="w-5 h-5 text-white" />
                {t('drawers.bountyTitle')}
              </DrawerTitle>
              <button onClick={() => setShowBountyDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
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
            <DrawerHeader className="pb-3 relative">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-white" />
                {t('drawers.gatedTitle')}
              </DrawerTitle>
              <button onClick={() => setShowLockedDrawer(false)} className="absolute top-3 right-0 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
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
              {post.lockedPrice && post.lockedPrice > 0 && (
                <VerifyUnlockButton
                  requiredAmount={post.lockedPrice}
                  currency={post.lockedCurrency || 'DHB'}
                  onUnlocked={() => {
                    setShowLockedDrawer(false);
                    setLocallyUnlocked(true);
                    markTokenUnlocked(post.id);
                    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
                    queryClient.invalidateQueries({ queryKey: ['dehub-images'] });
                    queryClient.invalidateQueries({ queryKey: ['nft-info', post.id] });
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Quote Post Modal */}
      <QuotePostModal
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        quotedPost={postAsNFT as any}
      />

      {/* Poll Creator Drawer */}
      <Drawer open={showPollCreator} onOpenChange={setShowPollCreator}>
        <DrawerContent glass className="px-4 pb-6">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-white text-lg">Create Poll</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3">
            <input
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-zinc-500 outline-none"
              placeholder="Ask a question…"
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value)}
            />
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-zinc-500 outline-none"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next); }}
                />
                {pollOptions.length > 2 && (
                  <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 4 && (
              <button onClick={() => setPollOptions([...pollOptions, ''])} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
                <Plus className="w-4 h-4" /> Add option
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} className="accent-white" />
              Allow multiple choices
            </label>
            <input
              type="datetime-local"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none"
              value={pollExpiry}
              onChange={e => setPollExpiry(e.target.value)}
            />
            <button
              className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
              disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || createPollMutation.isPending}
              onClick={async () => {
                const tokenIdNum = parseInt(post.id, 10);
                if (!tokenIdNum) return;
                await createPollMutation.mutateAsync({
                  tokenId: tokenIdNum,
                  question: pollQuestion.trim(),
                  options: pollOptions.filter(o => o.trim()),
                  isMultipleChoice: pollMultiple,
                  expiresAt: pollExpiry || undefined,
                });
                setShowPollCreator(false);
                setPollQuestion('');
                setPollOptions(['', '']);
                setPollMultiple(false);
                setPollExpiry('');
                queryClient.invalidateQueries({ queryKey: ['polls', tokenIdNum] });
              }}
            >
              {createPollMutation.isPending ? 'Creating…' : 'Create Poll'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
});
