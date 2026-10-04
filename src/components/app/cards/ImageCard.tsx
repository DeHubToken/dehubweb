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

import { useState, memo, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type ReactNode } from 'react';
const BountyClaimActions = lazy(() => import('./BountyClaimActions'));
import { DhbAmount } from '@/components/app/DhbAmount';
import { useImageSoundtrack } from '@/hooks/use-image-soundtrack';
import { useHorizontalBitmap } from '@/hooks/use-horizontal-bitmap';
import { SoundtrackControl } from './SoundtrackControl';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { FeedLinkPreviews } from '@/components/app/cards/FeedLinkPreviews';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { stripDehubLinkMatches } from '@/lib/dehub-links';
import { stripAssetRefs } from '@/lib/asset-refs';
import { useAutoOpenComments } from '@/hooks/use-auto-open-comments';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { Eye, MoreVertical, Download, Flag, Ban, VolumeX, EyeOff, Sparkles, Zap, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Link2, MessageSquare, Languages, Globe, Trash2, Ticket, Gift, Lock, MessageCircle, Gem, X, BarChart2, Plus, Pencil, Star } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useSuperpowers } from '@/hooks/use-superpowers';
import { useCreatePoll } from '@/hooks/use-polls';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { cdnImageSrcSet } from '@/lib/media-url';
import { motion, AnimatePresence } from 'framer-motion';
import dehubCoin from '@/assets/dehub-coin.png';
import { CardHeader } from './CardHeader';
import { MatureContentGate, useMatureGate } from './MatureContentGate';
import { ActionBar } from './ActionBar';
import { ShopBoardLazy } from '../live/ShopBoardLazy';
import { CommentsWrapper } from './CommentsWrapper';
import { PostMetadata } from './PostMetadata';
import { PPVDrawerContent } from './PPVDrawerContent';
import { useTranslation, LANGUAGE_NAMES, renderTextWithLinks, splitTranslatedTitleAndBody } from '../TranslatableText';
import { useTranslation as useI18n } from 'react-i18next';
import { PostAIChatLazy } from './PostAIChatLazy';
import { ReportModal } from '../modals/ReportModal';

import { DeletePostModal } from '../modals/DeletePostModal';
// Lazy, mounted on demand — see the note on the same pair in VideoCard.
const EditPostModal = lazy(() =>
  import('../modals/EditPostModal').then((m) => ({ default: m.EditPostModal }))
);
const BoostModal = lazy(() =>
  import('../modals/BoostModal').then((m) => ({ default: m.BoostModal }))
);
import { applyOptimisticEdit } from '@/lib/optimistic-edit';
import { QuotePostModalLazy } from '../modals/QuotePostModalLazy';
import { QuotedPostEmbed } from './QuotedPostEmbed';
import { TipModal } from '../modals/TipModal';
import { SwipeableCarousel } from '../SwipeableCarousel';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';
import { FullscreenImageViewerLazy } from './FullscreenImageViewerLazy';
import { ImageTranslationSheet } from './ImageTranslationSheet';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { useImageTranslation } from '@/hooks/use-image-translation';
import { useAuth } from '@/contexts/AuthContext';
import { usePostLinkCopyCount, useTrackPostLinkCopy } from '@/hooks/use-link-copy-count';
import { VerifyUnlockButton } from './VerifyUnlockButton';
import { updateTokenVisibility, repostPost, type TokenVisibility } from '@/lib/api/dehub';
import { PostUtilityMenuItems } from './PostUtilityMenuItems';
import { useBlockAuthor } from '@/hooks/use-block-author';
import { useMuteAuthor } from '@/hooks/use-mute-author';
import { cacheImageForNavigation } from '@/lib/post-cache';
import { HandoffImage } from './HandoffImage';
import { galleryIndex, rememberGalleryIndex, subscribeGallery } from '@/lib/media-presentation';
import { warmPostPage } from '@/lib/preload-post-page';
import { FEED_IMAGE_MAX_HEIGHT } from '@/lib/feed-image-layout';
import { chainVerticalWheel } from '@/lib/chain-vertical-wheel';
import { downloadMedia, imageDownloadName } from '@/lib/download-media';
import { isHoldGated, isSubscriberGated, cheapestSubscriberPlan, subscriberPlanPrice } from '@/lib/content-gate';

/** Lazy: PlanCard reaches the subscription contracts, and this card boots. */
const SubscriberGateDrawer = lazy(() =>
  import('./SubscriberGateDrawer').then((m) => ({ default: m.SubscriberGateDrawer }))
);
import { isTokenUnlocked, markTokenUnlocked } from '@/lib/unlocked-tokens-store';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
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

/**
 * Tallest a photo gets on the post page — the same cap the post page video
 * uses (index.css, --post-media-max-h). On phones that is at least a
 * full-width 9:16 frame, so a tall photo runs edge to edge like a vertical
 * video instead of stopping a few pixels short of both sides.
 */
const IMMERSIVE_IMAGE_MAX_HEIGHT = 'var(--post-media-max-h, 80dvh)';

interface ImageCardProps {
  post: ImagePost;
  /** Dedicated pages own one shared comments window below the post card. */
  onOpenComments?: (tab?: 'replies' | 'quotes' | 'reposts' | 'search') => void;
  /** First few feed items — skip lazy loading so LCP image loads immediately */
  aboveFold?: boolean;
  /**
   * Phone/tablet post page: the image owns the top of the screen the way an
   * immersive video does — edge to edge, square corners, centred on black —
   * and the creator row moves under it, where the video post draws its own.
   */
  isImmersive?: boolean;
  /** Photo taps open the viewer only on the dedicated post page. */
  postPage?: boolean;
}

/**
 * Measured width/height ratio per image URL. The feed API sends no
 * dimensions, so this is how repeat mounts reserve the right height
 * before the image loads (CLS fix). Session-scoped, bounded by feed size.
 */
const imageAspectRatioCache = new Map<string, number>();
const MAX_RATIO_CACHE = 1000; // numbers are tiny; cap only guards multi-hour sessions
function cacheAspectRatio(url: string, ratio: number) {
  if (imageAspectRatioCache.size >= MAX_RATIO_CACHE) {
    const oldest = imageAspectRatioCache.keys().next().value;
    if (oldest !== undefined) imageAspectRatioCache.delete(oldest);
  }
  imageAspectRatioCache.set(url, ratio);
}

/**
 * Single slide inside the Instagram-style carousel. Extracted so we can
 * safely call the double-tap-to-like hook per-image (hooks may not run
 * inside a .map callback).
 */
/**
 * Candidate widths (device px) for a feed image and the slot it renders into
 * (CSS px). The card is edge-to-edge on a phone and ~640 px wide beside the
 * sidebars, so a 1x desktop takes the 720 and a 3x phone the 1080 or 1440 —
 * instead of every device taking the 1080 the URL was built with.
 */
// Widths sit just above what common phones ask for at sizes=100vw, or the
// browser rounds up to the next rung: 412 CSS px at 1.75x is 721 device px,
// so a 720 rung loses to 1080; 412 at 2.625x is 1081.5, so 1080 lost to 1440.
const FEED_IMAGE_WIDTHS = [480, 736, 1100, 1440];
const FEED_IMAGE_SIZES = '(max-width: 767px) 100vw, 640px';
const BITMAP_RETAIN_MARGIN = '1200px 100%';
const BITMAP_RELEASE_DELAY_MS = 15_000;

function ImageSlide({
  img,
  idx,
  aboveFold,
  postId,
  onImageClick,
  viewportRef,
  immersive = false,
}: {
  img: string;
  idx: number;
  aboveFold: boolean;
  postId?: string;
  onImageClick: (index: number) => void;
  viewportRef: React.RefObject<HTMLDivElement>;
  immersive?: boolean;
}) {
  // Upgraded from the click-only double-tap to the shared ladder, so a photo
  // gets the same triple-tap ❤️ and hold-for-the-tray as every other surface.
  const tapGestures = useTapGestures({
    postId,
    onSingleTap: () => onImageClick(idx),
  });
  // Feed items carry no image dimensions, so first paint reserves minHeight and
  // the card grows on load (CLS). Remembering the measured ratio per URL means
  // every LATER mount (tab switch, feed revisit, carousel re-render) reserves
  // the exact final height up front.
  const [measurement, setMeasurement] = useState<{ img: string; ratio: number }>();
  const ratio = measurement?.img === img ? measurement.ratio : imageAspectRatioCache.get(img);
  const slideRef = useRef<HTMLDivElement>(null);
  const [retainBitmap, setRetainBitmap] = useState(aboveFold || immersive);
  const horizontalBitmap = useHorizontalBitmap(img, !!ratio, viewportRef, slideRef);
  // Resolve the ratio during render so a replaced image never paints with the
  // previous image's dimensions or needs a second render just to reset them.

  useEffect(() => {
    if (aboveFold || typeof IntersectionObserver === 'undefined') {
      setRetainBitmap(true);
      return;
    }

    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (releaseTimer) clearTimeout(releaseTimer);
          releaseTimer = undefined;
          setRetainBitmap(true);
          return;
        }

        // Native lazy-loading never unloads an image once decoded. Release it
        // only after it has stayed far outside the viewport, leaving a wide
        // buffer and grace period so ordinary scroll-back remains instant.
        if (!releaseTimer) {
          releaseTimer = setTimeout(() => setRetainBitmap(false), BITMAP_RELEASE_DELAY_MS);
        }
      },
      { rootMargin: BITMAP_RETAIN_MARGIN },
    );
    const node = slideRef.current;
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      if (releaseTimer) clearTimeout(releaseTimer);
    };
  }, [aboveFold, img]);

  return (
    <div
      ref={slideRef}
      className={cn('relative flex cursor-pointer select-none', immersive ? 'justify-center' : 'justify-start')}
      style={{ minHeight: ratio ? undefined : '200px' }}
      // Still stops the click reaching the card's navigate handler; the ladder
      // itself now runs off pointer events, which embla's drag does not consume.
      onClick={(e) => e.stopPropagation()}
      {...tapGestures}
    >
      <TapReactionBurst postId={postId} />
      {/* The image sizes itself: fills the card width when it's wide enough,
          otherwise caps at 600px tall and shrinks its own width — so a narrow /
          portrait image is just the image, hugged to the left, with no blurred
          side-fill. width/height attrs (from the cached ratio) reserve the box
          up front so there's no layout shift on load. */}
      <HandoffImage
        mediaKey={`${postId ?? img}:${idx}`}
        priority={immersive ? 1 : 0}
        src={retainBitmap && horizontalBitmap ? img : undefined}
        srcSet={retainBitmap && horizontalBitmap ? cdnImageSrcSet(img, FEED_IMAGE_WIDTHS) : undefined}
        sizes={FEED_IMAGE_SIZES}
        width={ratio ? Math.round(ratio * 1000) : undefined}
        height={ratio ? 1000 : undefined}
        className={cn('block w-auto h-auto max-w-full object-contain', immersive ? 'rounded-none' : 'rounded-2xl')}
        // Keep the slide's geometry when its offscreen bitmap is released.
        // An img without src otherwise collapses and changes the feed height.
        // On the post page (immersive) the photo follows the post page video
        // rule: it grows until it fills the width or 80% of the screen height,
        // whichever comes first, keeping its real shape.
        style={immersive
          ? { maxHeight: IMMERSIVE_IMAGE_MAX_HEIGHT, width: ratio ? `calc(${IMMERSIVE_IMAGE_MAX_HEIGHT} * ${ratio.toFixed(4)})` : undefined, aspectRatio: ratio }
          : { maxHeight: FEED_IMAGE_MAX_HEIGHT, width: ratio ? ratio * FEED_IMAGE_MAX_HEIGHT : undefined, aspectRatio: ratio }}
        loading={aboveFold && idx === 0 ? 'eager' : 'lazy'}
        fetchPriority={aboveFold && idx === 0 ? 'high' : 'auto'}
        onImageLoad={(el) => {
          if (el.naturalWidth > 0 && el.naturalHeight > 0) {
            const measured = el.naturalWidth / el.naturalHeight;
            cacheAspectRatio(img, measured);
            setMeasurement((previous) => previous?.img === img && previous.ratio === measured
              ? previous
              : { img, ratio: measured });
          }
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
  immersive = false,
  overlay,
  soundPlaying = false,
}: {
  images: string[];
  onImageClick: (index: number) => void;
  onIndexChange?: (index: number) => void;
  aboveFold?: boolean;
  postId?: string;
  immersive?: boolean;
  /** Sits on the bottom edge of the photo, inside its clip. */
  overlay?: ReactNode;
  /** The photo's soundtrack is playing: the photo drifts slowly. */
  soundPlaying?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Where the current photo sits inside the gallery, for the overlay. */
  const [photoBox, setPhotoBox] = useState<{ left: number; width: number; bottom: number }>();
  const hasOverlay = !!overlay;
  const galleryKey = postId ?? images.join('|');
  const [currentIndex, setCurrentIndex] = useState(() => galleryIndex(galleryKey));
  const selectedRef = useRef(currentIndex);
  const [activeHeight, setActiveHeight] = useState<number>();
  const [currentSlideFillsViewport, setCurrentSlideFillsViewport] = useState(false);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => chainVerticalWheel(event, viewport);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const updateCurrentIndex = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const slides = Array.from(viewport.children) as HTMLElement[];
    if (!slides.length) return;
    const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
    const idx = slides.reduce((nearest, slide, index) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const nearestSlide = slides[nearest];
      const nearestCenter = nearestSlide.offsetLeft + nearestSlide.offsetWidth / 2;
      return Math.abs(center - viewportCenter) < Math.abs(nearestCenter - viewportCenter)
        ? index
        : nearest;
    }, 0);
    setCurrentIndex(idx);
    selectedRef.current = idx;
    rememberGalleryIndex(galleryKey, idx);
    // The slot, not the img: the img is scaled while its soundtrack plays.
    const photo = (slides[idx].querySelector('[data-image-slot]') ?? slides[idx].querySelector('img'))?.getBoundingClientRect();
    const height = photo?.height;
    setActiveHeight(height && height > 0 ? height : undefined);
    // A portrait photo is narrower than the card, and in a gallery a short one
    // sits above the tallest one's bottom: the overlay follows the photo, not
    // the card, or it hangs off the side of it and below it.
    const gallery = hasOverlay ? rootRef.current?.getBoundingClientRect() : undefined;
    const left = photo && gallery ? Math.round(Math.max(0, photo.left - gallery.left)) : 0;
    const right = photo && gallery ? Math.round(Math.min(gallery.width, photo.right - gallery.left)) : 0;
    const bottom = photo && gallery ? Math.round(Math.max(0, gallery.bottom - photo.bottom)) : 0;
    setPhotoBox(previous => right - left <= 0 ? undefined
      : previous?.left === left && previous.width === right - left && previous.bottom === bottom ? previous
      : { left, width: right - left, bottom });
    // A narrower/tall image already reveals the next image, which is the best
    // possible scroll affordance. Keep the buttons for edge-to-edge slides,
    // where the rest of the gallery would otherwise be completely hidden.
    setCurrentSlideFillsViewport(slides[idx].offsetWidth >= viewport.clientWidth - 1);
    onIndexChange?.(idx);
  }, [onIndexChange, galleryKey, hasOverlay]);

  useEffect(() => {
    const restore = () => {
      const viewport = scrollRef.current;
      const index = Math.min(galleryIndex(galleryKey), images.length - 1);
      if (index === selectedRef.current && viewport?.scrollLeft) return;
      const slide = viewport?.children[index] as HTMLElement | undefined;
      if (viewport && slide) {
        selectedRef.current = index;
        setCurrentIndex(index);
        viewport.scrollLeft = slide.offsetLeft;
      }
    };
    restore();
    return subscribeGallery(galleryKey, restore);
  }, [galleryKey, images.length]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    updateCurrentIndex();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateCurrentIndex);
    observer.observe(viewport);
    Array.from(viewport.children).forEach((slide) => {
      observer.observe(slide);
      const image = slide.querySelector("img");
      if (image) observer.observe(image);
    });
    return () => observer.disconnect();
  }, [images, updateCurrentIndex]);

  const scrollToImage = useCallback((index: number) => {
    const viewport = scrollRef.current;
    const slide = viewport?.children[index] as HTMLElement | undefined;
    if (!viewport || !slide) return;
    viewport.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }, []);

  const scrollPrev = useCallback(() => scrollToImage(Math.max(0, currentIndex - 1)), [currentIndex, scrollToImage]);
  const scrollNext = useCallback(() => scrollToImage(Math.min(images.length - 1, currentIndex + 1)), [currentIndex, images.length, scrollToImage]);

  // Keep horizontal trackpad momentum inside the gallery while allowing the
  // browser to move the strip by the gesture's full, continuous distance.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (images.length <= 1) return;
    const absDeltaX = Math.abs(e.deltaX);
    const absDeltaY = Math.abs(e.deltaY);
    if (absDeltaX >= absDeltaY && absDeltaX > 0) e.stopPropagation();
  }, [images.length]);
  
  const hasMultiple = images.length > 1;
  
  return (
    <div ref={rootRef} data-media-full data-sound-playing={soundPlaying || undefined} className={cn('relative overflow-hidden', immersive ? 'rounded-none' : 'rounded-2xl')} onWheel={handleWheel} data-no-navigate data-no-swipe={hasMultiple ? true : undefined}>
      {/* Carousel container */}
      <div
        ref={scrollRef}
        onScroll={updateCurrentIndex}
        style={{ height: immersive ? activeHeight : undefined }}
        className={cn("flex items-start gap-2 scrollbar-hide", hasMultiple ? "overflow-x-auto overscroll-x-contain touch-auto" : "overflow-x-hidden touch-pan-y")}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className={cn(
              'min-w-0',
              hasMultiple ? 'flex-none max-w-full' : 'flex-[0_0_100%]',
            )}
          >
            <ImageSlide
              img={img}
              idx={idx}
              aboveFold={aboveFold}
              postId={postId}
              onImageClick={onImageClick}
              viewportRef={scrollRef}
              immersive={immersive}
            />
          </div>
        ))}
      </div>
      
      {/* A peeking next image explains the scroll itself; full-width slides need controls. */}
      {hasMultiple && currentSlideFillsViewport && (
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
      {overlay && (
        <div
          className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-10', !immersive && 'overflow-hidden rounded-b-2xl')}
          style={photoBox && { left: photoBox.left, right: 'auto', width: photoBox.width, bottom: photoBox.bottom }}
        >
          {overlay}
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
  postId,
  disabled,
  title, 
  description,
  isTranslated,
  translatedText,
  onOpen,
}: { 
  onOpen?: () => void;
  postId: string;
  disabled?: boolean;
  title?: string; 
  description?: string;
  isTranslated?: boolean;
  translatedText?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // A single tap on the title or description opens the post, like the rest of
  // the card; two and three taps still react. Links and "See more" keep theirs.
  const tapGestures = useTapGestures({
    postId,
    disabled,
    enableLongPress: false,
    onSingleTap: (event) => {
      if ((event.target as HTMLElement | null)?.closest?.('button, a, input, textarea, [role="button"]')) return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      onOpen?.();
    },
  });
  const MAX_LENGTH = 150;
  
  // Parse translated text back into title/description.
  //
  // The old version took parts[0] as the title and fell back to the ORIGINAL
  // description whenever the rest came back empty. On a translation that lost
  // its blank line that put the entire post in the title — which renders
  // unclamped here, while the description is capped at MAX_LENGTH — so pressing
  // translate on a long post expanded it to full length and left the body
  // untranslated underneath. See splitTranslatedTitleAndBody.
  const [displayTitle, displayDescription] = useMemo(() => {
    if (isTranslated && translatedText) {
      return splitTranslatedTitleAndBody(translatedText, title, description);
    }
    return [title, description];
  }, [isTranslated, translatedText, title, description]);
  
  // DeHub links become cards, so they come out of the text — and they come out
  // BEFORE the truncation below, not after. Stripping afterwards meant a URL
  // could be cut in half by the 150-character clamp and then no longer match,
  // leaving half a link on screen next to its own card; it also spent a third
  // of the visible budget on a URL nobody reads.
  const linkSource = useMemo(
    () => [displayTitle, displayDescription].filter(Boolean).join('\n'),
    [displayTitle, displayDescription],
  );
  const { links: dehubLinks } = useDehubLinks(linkSource);
  // Contract addresses come out here too, for the same reason and at the same
  // stage: half a stripped address left behind by the clamp is worse than none.
  const { refs: assetRefs } = useAssetRefsInText(linkSource);
  const linkFreeTitle = useMemo(
    () => stripAssetRefs(
      dehubLinks.length ? stripDehubLinkMatches(displayTitle, dehubLinks) : displayTitle,
      assetRefs,
    ),
    [displayTitle, dehubLinks, assetRefs],
  );
  const linkFreeDescription = useMemo(
    () => stripAssetRefs(
      dehubLinks.length ? stripDehubLinkMatches(displayDescription, dehubLinks) : displayDescription,
      assetRefs,
    ),
    [displayDescription, dehubLinks, assetRefs],
  );

  // Suppress duplicate: if description starts with the title text, strip it out
  const dedupedDescription = useMemo(() => {
    if (!linkFreeTitle || !linkFreeDescription) return linkFreeDescription;
    const trimTitle = linkFreeTitle.trim();
    const trimDesc = linkFreeDescription.trim();
    if (trimDesc === trimTitle) return undefined;
    if (trimDesc.startsWith(trimTitle)) {
      const rest = trimDesc.slice(trimTitle.length).replace(/^\s*\n+/, '').trim();
      return rest || undefined;
    }
    return linkFreeDescription;
  }, [linkFreeTitle, linkFreeDescription]);

  const hasLongDescription = dedupedDescription && dedupedDescription.length > MAX_LENGTH;
  const shownDescription = expanded || !hasLongDescription
    ? dedupedDescription
    : `${dedupedDescription.slice(0, MAX_LENGTH)}...`;

  // A post whose whole caption was a link still has something to show.
  if (!title && !description && dehubLinks.length === 0) return null;

  return (
    <div className="relative space-y-1" data-card-caption={(linkFreeTitle || shownDescription) && dehubLinks.length === 0 && assetRefs.length === 0 && !/https?:\/\//.test(linkSource ?? '') ? '' : undefined} data-no-navigate {...tapGestures} onClick={(event) => event.stopPropagation()}>
      {!disabled && <TapReactionBurst postId={postId} />}
      {linkFreeTitle && (
        <h3 className="text-white text-[14px] leading-tight">
          {renderTextWithLinks(linkFreeTitle)}
        </h3>
      )}
      {shownDescription && (
        <div>
          <p className="text-zinc-300 text-[14px] leading-relaxed">
            {renderTextWithLinks(shownDescription)}
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
      <DehubLinkEmbeds links={dehubLinks} />
      <FeedLinkPreviews text={linkSource} />
      <AssetRefCards refs={assetRefs} />
    </div>
  );
}

export const ImageCard = memo(function ImageCard({ post, aboveFold = false, onOpenComments, isImmersive = false, postPage = false }: ImageCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentsInitialTab, setCommentsInitialTab] = useState<'replies' | 'quotes' | 'reposts' | 'search' | undefined>(undefined);
  useAutoOpenComments(setShowComments, post.id);
  const { t } = useI18n();
  const [showAIChat, setShowAIChat] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalMounted, setEditModalMounted] = useState(false);
  useEffect(() => {
    if (showEditModal) setEditModalMounted(true);
  }, [showEditModal]);
  const [showBoostModal, setShowBoostModal] = useState(false);

  // caption holds the raw API description including any [soundtrack:...] tag
  // that `description` strips for display — edit the raw text so saving
  // doesn't silently drop the post's soundtrack.
  const editDescription = /\[soundtrack:/.test(post.caption) ? post.caption : (post.description ?? '');
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  const [visibility, setVisibility] = useState<TokenVisibility>('public');
  const [showPPVDrawer, setShowPPVDrawer] = useState(false);
  const [showBountyDrawer, setShowBountyDrawer] = useState(false);
  const [showLockedDrawer, setShowLockedDrawer] = useState(false);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);
  const isPhone = useIsMobile();
  const [showTipModal, setShowTipModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollExpiry, setPollExpiry] = useState('');
  const createPollMutation = useCreatePoll();
  const { data: tipCount = 0 } = usePostTipCount(post.id, post.totalTips);
  const isTabletOrMobile = useIsTabletOrMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  // Deep Current is the one power spent on somebody ELSE's post, so it is
  // the one row that belongs in this half of the menu. `status.powers` is
  // the authority for whether this account has it — the badge the client
  // draws from a live wallet read deliberately over-reports.
  const { data: superpowerStatus } = useSuperpowers(!!walletAddress);
  const canGiftBoost = !!superpowerStatus?.powers.some(
    p => p.key === 'deep_current' && p.unlocked && p.available,
  );
  // The options menu offers the same copy as the share sheet, so it counts the
  // same. Shares one react-query key with the ActionBar below, so no extra
  // request — and the bump lands on the card's own share counter.
  const { data: linkCopyCount = 0 } = usePostLinkCopyCount(post.id);
  const trackLinkCopy = useTrackPostLinkCopy();
  const isOwnPost = !!post.isOwner || !!(
    walletAddress && post.creatorId?.toLowerCase() === walletAddress.toLowerCase()
  );
  const { blockAuthor } = useBlockAuthor();
  const { muteAuthor } = useMuteAuthor();
  const handleBlockCreator = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!post.creatorId) return;
    setShowOptionsDrawer(false);
    blockAuthor(post.creatorId, post.username || undefined);
  }, [walletAddress, openLoginModal, post.creatorId, post.username, blockAuthor]);
  const handleMuteCreator = useCallback(() => {
    if (!walletAddress) { openLoginModal(); return; }
    if (!post.creatorId) return;
    setShowOptionsDrawer(false);
    muteAuthor(post.creatorId, post.username || undefined);
  }, [walletAddress, openLoginModal, post.creatorId, post.username, muteAuthor]);
  const postTokenId = parseInt(post.id, 10) || undefined;

  // PPV/Bounty/Locked status - bypass for owners & already-unlocked content
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const [locallySubscribed, setLocallySubscribed] = useState(false);
  const [showSubDrawer, setShowSubDrawer] = useState(false);
  const storedUnlocked = isTokenUnlocked(post.id);
  const canBypassGating = !!(isOwnPost || post.isOwner || post.isUnlocked || locallyUnlocked || storedUnlocked);
  const isPPV = (post.isPPV || false) && !canBypassGating;
  const isW2E = (post.isW2E || false) && !canBypassGating;
  const isLocked = isHoldGated(post.isLocked, post.lockedPrice) && !canBypassGating;
  // A second, independent gate — subscribe to this creator, not own a token.
  const isSubGated = isSubscriberGated(post.subscriberPlans, !!isOwnPost || !!post.isOwner || locallySubscribed);
  // Cheapest plan a reader can actually buy. The price lives on the plan's
  // chain entry, not on `plan.price` — that field does not exist on this
  // payload, and reading it gave NaN, which formatCompact renders as "0".
  const cheapestPlanPrice = subscriberPlanPrice(cheapestSubscriberPlan(post.subscriberPlans));
  const isComboLocked = isPPV && isLocked;
  // Independent of the monetisation gates above: a post can be both mature and
  // pay-per-view, and the creator's own post is warned about too — the warning
  // is for whoever is looking at the screen.
  const matureGate = useMatureGate(post.contentRating);
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

  const soundtrackEnabled = !matureGate.isGated && !isPPV && !isLocked && !isSubGated && !isW2E;
  const soundtrack = useImageSoundtrack(post.soundtrackUrl, viewRef, soundtrackEnabled, post.id);
  const soundtrackControl = post.soundtrackUrl && soundtrackEnabled ? (
    <SoundtrackControl title={post.soundtrackTitle} creator={post.soundtrackCreator} {...soundtrack} />
  ) : null;
  
  // Translation hook for text content
  const descriptionText = [post.title, post.description].filter(Boolean).join('\n\n');
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    handleTranslate,
    handleShowOriginal,
    sourceLang,
    isTooShort: nothingToTranslate,
  } = useTranslation(descriptionText, true, viewRef, true);
  const { isLoading: isTranslating, error: translationError, result: translationResult, translateImage, clearResult } = useImageTranslation();

  // Get images array - use imageUrls if available, otherwise fall back to single image
  const images = useMemo(() => post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : [post.image], [post.imageUrls, post.image]);

  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadImage = useCallback(async () => {
    const source = images[activeImageIndex] || images[0];
    if (!source || isDownloading) return;
    setShowOptionsDrawer(false);
    setIsDownloading(true);
    const toastId = `image-download-${post.id}`;
    toast.loading('Preparing download...', { id: toastId });
    try {
      await downloadMedia(source, imageDownloadName(source, post.id, activeImageIndex));
      toast.success('Download started', { id: toastId });
    } catch {
      toast.error('Download failed. Please try again.', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  }, [images, activeImageIndex, isDownloading, post.id]);

  const openPost = useCallback(() => {
    if (wasDrawerJustDismissed() || showPPVDrawer || showBountyDrawer || showLockedDrawer) return;
    cacheImageForNavigation(queryClient, post);
    navigate(`/app/post/${post.id}`, { state: { fromFeed: true } });
  }, [navigate, queryClient, post, showPPVDrawer, showBountyDrawer, showLockedDrawer]);

  const handleImageClick = (index: number) => {
    if (wasDrawerJustDismissed()) return;
    if (!postPage) {
      openPost();
      return;
    }
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
    } catch (err) {
      toast.error('Failed to repost');
      throw err; // let ActionBar roll back its optimistic repost state
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
    
    openPost();
  }, [openPost, showPPVDrawer, showBountyDrawer, showLockedDrawer]);

  const headerRow = (
    <div data-card-head="plain" className="flex items-end justify-between" style={{ paddingBottom: 0 }}>
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
      <div className="flex items-center gap-1 pb-2">
        {isOwnPost && (
          <button
            onClick={() => setShowBoostModal(true)}
            disabled={!postTokenId}
            className="mr-[1.6px] text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all disabled:opacity-40"
            aria-label={t('postOptions.boostPost')}
          >
            <Zap className="w-[23.5px] h-[23.5px]" />
          </button>
        )}
        {/* On phones Ask AI lives in the options menu instead. */}
        {!isPhone && (
          <button
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-95 transition-all"
            aria-label="Ask AI about this post"
          >
            <Sparkles className="w-[23.5px] h-[23.5px]" />
          </button>
        )}
        <Drawer open={showOptionsDrawer} onOpenChange={setShowOptionsDrawer}>
          {/* State-driven, not DrawerTrigger — see PostCard: a trigger pins
              vaul's Root (and its window scroll listener) into every card. */}
          <button
            onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowOptionsDrawer(true); }}
            aria-label="Post options"
            className="text-zinc-400 hover:text-white transition-colors -mr-0.5"
          >
            <MoreVertical className="w-[23.5px] h-[23.5px]" />
          </button>
          <DrawerContent scrollable column glass className="px-4 pb-6">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1">
              {/* Bookmark / pin / post info. Also on the action bar as icons
                  on desktop — both surfaces read the same state, so the menu
                  is a reliable place to find them at every width. */}
              <button
                onClick={() => { setShowOptionsDrawer(false); if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Sparkles className="w-5 h-5" /> {t('postOptions.askAI', 'Ask AI')}
              </button>
              <PostUtilityMenuItems
                postId={post.id}
                tokenId={postTokenId}
                isOwnPost={isOwnPost}
                onBeforeNavigate={() => setShowOptionsDrawer(false)}
              />
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
                <button onClick={handleDownloadImage} disabled={isDownloading} className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-50">
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
                  trackLinkCopy(post.id, walletAddress, linkCopyCount);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Link2 className="w-5 h-5" /> {t('postOptions.copyPostUrl')}
              </button>
              {!isOwnPost && (
                <button onClick={handleMuteCreator} className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <VolumeX className="w-5 h-5" /> {t('postOptions.muteCreator')}
                </button>
              )}
              {!isOwnPost && (
                <button onClick={handleBlockCreator} className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Ban className="w-5 h-5" /> {t('postOptions.blockCreator')}
                </button>
              )}
              {!isOwnPost && canGiftBoost && (
                <button
                  onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowBoostModal(true), 300); }}
                  disabled={!postTokenId}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40"
                >
                  <Gift className="w-5 h-5" /> {t('postOptions.giftBoost', { defaultValue: 'Gift a boost' })}
                </button>
              )}
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
                    onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowEditModal(true), 300); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                  </button>
                  {/* Boost. Offered to every owner rather than only to badge holders:
                      the sheet explains what a badge buys and links to staking, which is
                      worth more than hiding the row from the people who have not staked. */}
                  <button
                    onClick={() => { setShowOptionsDrawer(false); setTimeout(() => setShowBoostModal(true), 300); }}
                    disabled={!postTokenId}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left disabled:opacity-40"
                  >
                    <ThemedIcon icon="superpowers" alt="" className="w-5 h-5 object-contain" /> {t('postOptions.boostPost')}
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
  );

  return (
    <div
      ref={viewRef}
      data-image-card
      onClick={handleCardClick}
      onPointerDownCapture={warmPostPage}
      className={isImmersive ? 'overflow-hidden isolate' : 'overflow-visible cursor-pointer isolate'}
    >
      {/* Header with AI and menu buttons. Immersive draws it under the image. */}
      {!isImmersive && headerRow}

      {/* Image Carousel - wrapped to prevent tab switching on swipe */}
      <div data-image-media className="relative">
        {/* Mature warning sits outermost: revealing it falls through to
            whatever gate the post actually has (PPV, holdings), rather than
            replacing it. */}
        {matureGate.isGated ? (
          <MatureContentGate preview={images[0]} onReveal={matureGate.reveal} />
        ) : isComboLocked ? (
          <>
            {/* Combo PPV + Holdings Locked: blurred image with dual icons */}
            <div data-media-full className={cn('relative overflow-hidden', isImmersive ? 'rounded-none' : 'rounded-2xl')}>
              <img
                src={images[0]}
                alt=""
                className="w-full object-cover blur-lg"
                style={{ maxHeight: FEED_IMAGE_MAX_HEIGHT }}
                loading={aboveFold ? 'eager' : 'lazy'}
                fetchPriority={aboveFold ? 'high' : 'auto'}
                decoding={aboveFold ? 'sync' : 'async'}
              />
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
                  Unlock for <DhbAmount amount={formatCompact(Number(post.ppvPrice))} currency={post.ppvCurrency} />
                </p>
                <p className="text-white/70 text-xs">
                  Must be holding <DhbAmount amount={formatCompact(Number(post.lockedPrice))} currency={post.lockedCurrency} />
                </p>
              </div>
            </div>
          </>
        ) : isPPV ? (
          <>
            {/* PPV only: blurred image with ticket overlay */}
            <div data-media-full className={cn('relative overflow-hidden', isImmersive ? 'rounded-none' : 'rounded-2xl')}>
              <img
                src={images[0]}
                alt=""
                className="w-full object-cover blur-lg"
                style={{ maxHeight: FEED_IMAGE_MAX_HEIGHT }}
                loading={aboveFold ? 'eager' : 'lazy'}
                fetchPriority={aboveFold ? 'high' : 'auto'}
                decoding={aboveFold ? 'sync' : 'async'}
              />
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
        ) : isSubGated ? (
          <>
            {/* Subscriber gated: same blur, different ask. Ordered above the
                holdings branch because a post carrying both is more likely to
                be a creator's subscriber post than a token play. */}
            <div data-media-full className={cn('relative overflow-hidden', isImmersive ? 'rounded-none' : 'rounded-2xl')}>
              <img
                src={images[0]}
                alt=""
                className="w-full object-cover blur-lg"
                style={{ maxHeight: FEED_IMAGE_MAX_HEIGHT }}
                loading={aboveFold ? 'eager' : 'lazy'}
                fetchPriority={aboveFold ? 'high' : 'auto'}
                decoding={aboveFold ? 'sync' : 'async'}
              />
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setShowSubDrawer(true); }}
                onTouchStart={(e) => { (e.currentTarget as any)._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  const start = (e.currentTarget as any)._touchStart;
                  if (!start) return;
                  const touch = e.changedTouches[0];
                  if (Math.abs(touch.clientX - start.x) < 10 && Math.abs(touch.clientY - start.y) < 10) { e.preventDefault(); setShowSubDrawer(true); }
                }}
              >
                <div className="w-16 h-16 rounded-2xl bg-black/40 backdrop-blur-[24px] saturate-[180%] flex items-center justify-center border border-white/10 mb-3">
                  <Star className="h-7 w-7 text-white" />
                </div>
                <p className="text-white font-semibold text-sm mb-1">Subscribers only</p>
                <p className="text-white/70 text-xs">
                  {cheapestPlanPrice !== undefined ? (
                    <>
                      Subscribe from <DhbAmount amount={formatCompact(cheapestPlanPrice)} />
                    </>
                  ) : (
                    `Subscribe to ${post.username}`
                  )}
                </p>
              </div>
            </div>
          </>
        ) : isLocked ? (
          <>
            {/* Holdings Locked: blurred image with lock icon overlay */}
            <div data-media-full className={cn('relative overflow-hidden', isImmersive ? 'rounded-none' : 'rounded-2xl')}>
              <img
                src={images[0]}
                alt=""
                className="w-full object-cover blur-lg"
                style={{ maxHeight: FEED_IMAGE_MAX_HEIGHT }}
                loading={aboveFold ? 'eager' : 'lazy'}
                fetchPriority={aboveFold ? 'high' : 'auto'}
                decoding={aboveFold ? 'sync' : 'async'}
              />
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
                  Must be holding <DhbAmount amount={formatCompact(Number(post.lockedPrice))} currency={post.lockedCurrency} />
                </p>
              </div>
            </div>
          </>
        ) : (
          <SwipeableCarousel>
            <ImageCarousel
              images={images}
              onImageClick={handleImageClick}
              onIndexChange={setActiveImageIndex}
              aboveFold={aboveFold}
              postId={post.id}
              immersive={isImmersive}
              overlay={fullscreenOpen ? undefined : soundtrackControl}
              soundPlaying={soundtrack.playing && !fullscreenOpen}
            />
          </SwipeableCarousel>
        )}


        {/* Content Type Badges - Bounty only (PPV/Lock are shown via centered overlay) */}
        {hasBadges && (
          /* Immersive: the post page's back button owns the top-left corner. */
          <div className={cn('absolute top-2 z-10 flex items-center gap-1.5', isImmersive ? 'left-12' : 'left-2')}>
            {/* Bounty Badge */}
            {isW2E && (
              <button 
                className="flex items-center gap-1 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-2 py-1 rounded-lg border border-white/10 hover:bg-black/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowBountyDrawer(true); }}
              >
                <Gift className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-medium">
                  {post.bountyAmount && post.bountyAmount > 0 
                    ? <DhbAmount amount={formatCompact(post.bountyAmount)} currency={post.bountyCurrency} />
                    : 'Bounty'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info & Actions. Immersive media runs edge to edge, so the copy under it
          brings its own gutter — the same px-3 the immersive video card uses. */}
      <div data-card-info className={cn('pt-3 space-y-2', isImmersive && 'px-3')}>
        {isImmersive && headerRow}
        {/* Title & Description */}
        <FeedDescription 
          postId={post.id}
          onOpen={openPost}
          disabled={matureGate.isGated || isPPV || isW2E || isLocked || isSubGated}
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
          className="!mt-3"
          timestamp={post.timeAgo}
          viewCount={post.views}
          tokenId={post.id}
          translateControl={nothingToTranslate ? undefined : {
            isTranslated,
            isLoading: isTranslateLoading,
            error: translateError,
            onTranslate: handleTranslate,
            onShowOriginal: handleShowOriginal,
            sourceLang,
          }}
        />

        {/* The creator's Shop board — affiliate links, opened in place. */}
        <ShopBoardLazy tokenId={post.id} links={post.shopLinks} listingCount={post.shopListingCount} variant="inline" />

        <ActionBar
          postId={post.id}
          newPostSlug={post.status === 'signed' ? post.newPostId ?? null : null}
          tokenId={parseInt(post.id, 10) || undefined}
          isOwnPost={!!isOwnPost}
          utilityDesktopAnchor
          className="p-0"
          // While fullscreen is open its own action bar owns double-tap-to-like;
          // mute this one so a single double-tap doesn't cast two votes.
          enableDoubleTapLike={!fullscreenOpen}
          onComment={() => {
            if (onOpenComments) {
              onOpenComments();
              return;
            }
            setCommentsInitialTab(undefined);
            setShowComments(prev => !prev);
          }} 
          onRepost={handleRepost}
          onQuote={handleQuote}
          isLiked={post.isLiked}
          isDisliked={post.isDisliked}
          myReaction={post.myReaction}
          reactionCounts={post.reactionCounts}
          likeCount={post.likes}
          dislikeCount={post.dislikes}
          commentCount={post.comments}
          repostCount={post.repostCount}
          isReposted={post.isReposted}
          isOptimistic={post.isOptimistic}
          tipCount={tipCount}
          onTip={post.creatorPaymentsDisabled ? undefined : () => setShowTipModal(true)}
          onSeeEngagements={() => {
            if (onOpenComments) {
              onOpenComments('reposts');
              return;
            }
            setCommentsInitialTab('reposts');
            setShowComments(true);
          }}
        />
        

        {/* Comments */}
        {!onOpenComments && (
          <CommentsWrapper
            open={showComments}
            onOpenChange={setShowComments}
            tokenId={post.id}
            initialTab={commentsInitialTab}
            commentsDisabled={!!(post as { commentsDisabled?: boolean }).commentsDisabled}
            forKids={!!post.forKids}
          />
        )}
      </div>

      {/* AI Chat */}
      <PostAIChatLazy
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
      <FullscreenImageViewerLazy
        images={images}
        soundtrackControl={soundtrackControl && (
          <SoundtrackControl title={post.soundtrackTitle} creator={post.soundtrackCreator} {...soundtrack} layout="inline" />
        )}
        initialIndex={fullscreenIndex}
        isOpen={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        postId={post.id}
        actions={{
          isLiked: post.isLiked,
          isDisliked: post.isDisliked,
          myReaction: post.myReaction,
          reactionCounts: post.reactionCounts,
          likeCount: post.likes,
          dislikeCount: post.dislikes,
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
          queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
        }}
      />

      {/* Boost Modal — mounted only while open, so the chunk is fetched on the
          tap that opens it rather than with the feed. */}
      {showBoostModal && (
        <Suspense fallback={null}>
          <BoostModal
            open={showBoostModal}
            onOpenChange={setShowBoostModal}
            tokenId={postTokenId}
            postTitle={post.title ?? post.caption ?? ''}
          />
        </Suspense>
      )}

      {/* Edit Post Modal — mounted on first open and kept, so the drawer's
          close animation still runs. */}
      {editModalMounted && (
        <Suspense fallback={null}>
          <EditPostModal
            open={showEditModal}
            onOpenChange={setShowEditModal}
            tokenId={post.id}
            currentTitle={post.title ?? ''}
            currentDescription={editDescription}
            currentCategories={post.categories ?? []}
            currentContentRating={post.contentRating}
            currentForKids={post.forKids}
            currentShopLinks={post.shopLinks}
            onSuccess={(edited) => {
              applyOptimisticEdit(queryClient, post.id, edited);
            }}
          />
        </Suspense>
      )}

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
              queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
              queryClient.invalidateQueries({ queryKey: ['nft-info', post.id] });
            }}
            formatCompact={formatCompact}
          />
        </Drawer>
      )}

      {/* Bounty Drawer - controlled, rendered at root level for mobile compatibility */}
      {isW2E && (
        <Drawer open={showBountyDrawer} onOpenChange={setShowBountyDrawer}>
          <DrawerContent scrollable column glass className="px-4 pb-6">
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
                    <span className="text-white text-lg font-bold"><DhbAmount amount={post.bountyAmount} currency={post.bountyCurrency} /></span>
                  </div>
                </div>
              )}
              <p className="text-center text-white/60 text-sm">
                {t('drawers.bountyDescription')}
              </p>
              <Suspense fallback={null}>
                <BountyClaimActions tokenId={post.id} open={showBountyDrawer} />
              </Suspense>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Subscriber sheet — a different gate to the holdings one below. */}
      {isSubGated && (
        <Drawer open={showSubDrawer} onOpenChange={setShowSubDrawer}>
          <DrawerContent scrollable column glass className="px-4 pb-6">
            <Suspense fallback={<div className="py-10 text-center text-white/60 text-sm">Loading…</div>}>
              <SubscriberGateDrawer
                creatorAddress={post.creatorId || ""}
                creatorName={post.username}
                previewPlans={post.subscriberPlans}
                onSubscribed={() => {
                  setLocallySubscribed(true);
                  setShowSubDrawer(false);
                  queryClient.invalidateQueries({ queryKey: ["unified-feed"] });
                  queryClient.invalidateQueries({ queryKey: ["dehub-feed"] });
                }}
              />
            </Suspense>
          </DrawerContent>
        </Drawer>
      )}

      {/* Locked Drawer - controlled, rendered at root level for mobile compatibility */}
      {isLocked && (
        <Drawer open={showLockedDrawer} onOpenChange={setShowLockedDrawer}>
          <DrawerContent scrollable column glass className="px-4 pb-6">
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
                    <span className="text-white text-lg font-bold"><DhbAmount amount={formatCompact(post.lockedPrice)} currency={post.lockedCurrency} /></span>
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
                  tokenAddress={post.lockedTokenAddress}
                  chainId={post.lockedChainId}
                  onUnlocked={() => {
                    setShowLockedDrawer(false);
                    setLocallyUnlocked(true);
                    markTokenUnlocked(post.id);
                    queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
                    queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
                    queryClient.invalidateQueries({ queryKey: ['nft-info', post.id] });
                  }}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Quote Post Modal */}
      <QuotePostModalLazy
        open={showQuoteModal}
        onOpenChange={setShowQuoteModal}
        quotedPost={postAsNFT as any}
      />

      {/* Poll Creator Drawer */}
      <Drawer open={showPollCreator} onOpenChange={setShowPollCreator}>
        <DrawerContent scrollable column glass className="px-4 pb-6">
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

