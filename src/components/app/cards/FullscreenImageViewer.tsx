/**
 * Fullscreen Image Viewer Component
 * ==================================
 * Displays images in fullscreen. Swipe navigation for multi-image posts,
 * swipe/drag down to close, pinch (or trackpad pinch) to zoom.
 *
 * ── Two things this screen owes the viewer ──
 *
 * 1. THE ORIGINAL, NOT THE FEED COPY. Everything upstream holds a `cdnImage()`
 *    URL capped at `DEFAULT_IMAGE_WIDTH` (1080px, quality 80) — the right file
 *    for a feed slot and the wrong one to zoom into. The active slide unwraps
 *    that back to the uploaded file and swaps to it once it has decoded, so
 *    fullscreen opens instantly on the copy the feed already has and then
 *    sharpens, rather than opening on a blank screen.
 *
 * 2. ZOOM HAS TO OWN THE GESTURE. Three other things want the same fingers:
 *    embla's horizontal drag, this viewer's swipe-down-to-close, and the
 *    double-tap-to-like ladder on the image itself. While a slide is zoomed,
 *    `watchDrag` refuses embla the drag and the slide swallows the touch stream
 *    before the close handlers see it; at 1x all three behave as they always
 *    did. Double-tap is left alone — it stays a like, as it is on the card.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { ImageTranslationSheet } from './ImageTranslationSheet';
import { ActionBar } from './ActionBar';
import { PostUtilityButtons } from './PostUtilityButtons';
import { useImageTranslation } from '@/hooks/use-image-translation';
import { cdnImageSource } from '@/lib/media-url';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';
import type { PostReaction, ReactionCounts } from '@/lib/reactions';

/**
 * Engagement data + handlers for the bottom action bar. When provided (along
 * with `postId`), the viewer renders the shared ActionBar over a dark scrim so
 * users can like / comment / repost / tip and see live counts without leaving
 * fullscreen. Handlers that need a drawer (comment, tip) should close the
 * viewer first — drawers are z-[100] and would otherwise render behind it.
 */
export interface FullscreenViewerActions {
  isLiked?: boolean;
  isDisliked?: boolean;
  myReaction?: PostReaction | null;
  reactionCounts?: ReactionCounts | null;
  hideDislike?: boolean;
  likeCount?: number;
  dislikeCount?: number;
  commentCount?: number;
  repostCount?: number;
  isReposted?: boolean;
  tipCount?: number;
  isOwnPost?: boolean;
  tokenId?: number;
  /** Let this bar own double-tap-to-like while fullscreen is open (parent should mute the card's bar). */
  enableDoubleTapLike?: boolean;
  onComment?: () => void;
  onRepost?: () => void;
  onTip?: () => void;
}

export interface FullscreenImageViewerProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  /** Post ID — enables double-tap-to-like on the fullscreen image */
  postId?: string;
  /** Engagement data + handlers; when set with `postId`, renders the bottom action bar. */
  actions?: FullscreenViewerActions;
}

const SWIPE_DOWN_THRESHOLD = 100;

export function FullscreenImageViewer({
  images,
  initialIndex,
  isOpen,
  onClose,
  postId,
  actions,
}: FullscreenImageViewerProps) {
  // A zoomed slide owns the drag. `watchDrag` is consulted on every touchstart,
  // so a ref is enough here — no reInit, and no stale closure either.
  const zoomedRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const handleZoomChange = useCallback((next: boolean) => {
    zoomedRef.current = next;
    setZoomed(next);
  }, []);
  const emblaOptions = useMemo(
    () => ({ loop: false, startIndex: initialIndex, watchDrag: () => !zoomedRef.current }),
    [initialIndex],
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showTranslationSheet, setShowTranslationSheet] = useState(false);
  
  // Image translation hook
  const { isLoading: isTranslating, error: translationError, result: translationResult, translateImage, clearResult } = useImageTranslation();
  
  // Drag state for swipe-down-to-close
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartX = useRef(0);
  
  const handleTranslateImage = useCallback(async () => {
    const imageUrl = images[currentIndex];
    if (!imageUrl) return;
    
    setShowTranslationSheet(true);
    await translateImage(imageUrl);
  }, [images, currentIndex, translateImage]);
  
  const handleCloseTranslation = useCallback(() => {
    setShowTranslationSheet(false);
    clearResult();
  }, [clearResult]);

  // Sync carousel to initial index when opening
  useEffect(() => {
    if (isOpen && emblaApi) {
      emblaApi.scrollTo(initialIndex, true);
      setCurrentIndex(initialIndex);
      setDragOffset(0);
      // Slides unmount on close without their effects getting to say so.
      handleZoomChange(false);
    }
  }, [isOpen, initialIndex, emblaApi, handleZoomChange]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') scrollPrev();
      if (e.key === 'ArrowRight') scrollNext();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, scrollPrev, scrollNext]);

  // Touch handlers for swipe-down-to-close. A zoomed slide stops the stream
  // before it reaches here; these guards cover a gesture that zoomed mid-drag.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (zoomedRef.current) return;
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || zoomedRef.current) return;
    
    const deltaY = e.touches[0].clientY - dragStartY.current;
    const deltaX = Math.abs(e.touches[0].clientX - dragStartX.current);
    
    // Only allow downward drag, and only if vertical > horizontal
    if (deltaY > 0 && deltaY > deltaX) {
      setDragOffset(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > SWIPE_DOWN_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
    isDragging.current = false;
  }, [dragOffset, onClose]);

  // Mouse handlers for click-and-drag down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomedRef.current) return;
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartX.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || zoomedRef.current) return;
    
    const deltaY = e.clientY - dragStartY.current;
    const deltaX = Math.abs(e.clientX - dragStartX.current);
    
    if (deltaY > 0 && deltaY > deltaX) {
      setDragOffset(deltaY);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragOffset > SWIPE_DOWN_THRESHOLD) {
      onClose();
    }
    setDragOffset(0);
    isDragging.current = false;
  }, [dragOffset, onClose]);

  // Wheel handler for two-finger scroll down (trackpad). The slide takes the
  // wheel over to zooming while it is zoomed in, and stops it reaching here.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (zoomedRef.current) return;
    // Positive deltaY = scrolling down
    if (e.deltaY > SWIPE_DOWN_THRESHOLD && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      onClose();
    }
  }, [onClose]);

  const hasMultiple = images.length > 1;
  const showActionBar = !!(postId && actions);

  // Calculate opacity based on drag offset
  const bgOpacity = Math.max(0.3, 1 - dragOffset / 300);

  // Portalled to the body, so when the viewer is opened from inside a drawer
  // (comments, DMs) it inherits the `pointer-events: none` Radix pins on the
  // body for the open dialog. Without `pointer-events-auto` the viewer paints
  // over the page but every click falls through to the drawer behind it.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-overlay-content
          className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity * 0.95})` }}
          onClick={onClose}
          onWheel={handleWheel}
        >
          {/* Top-right controls. Order left → right: utility chips (desktop
              only), translate, close. Close stays anchored far-right. */}
          <div data-keep-dark className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {/* Bookmark / pin / info — lifted here on desktop to match the
                Close / Translate controls; the bottom bar keeps them inline on
                mobile/tablet. */}
            {showActionBar && (
              <div
                className="hidden lg:flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <PostUtilityButtons
                  postId={postId}
                  tokenId={actions?.tokenId}
                  isOwnPost={actions?.isOwnPost}
                  variant="chip"
                />
              </div>
            )}

            {/* Translate button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTranslateImage();
              }}
              className="w-10 h-10 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Translate image text"
            >
              <Languages className="w-5 h-5" />
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              aria-label="Close fullscreen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Image counter */}
          {hasMultiple && (
            <div data-keep-dark className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 text-white text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Carousel with drag offset */}
          <motion.div 
            className="w-full h-full overflow-hidden" 
            ref={emblaRef}
            style={{ 
              transform: `translateY(${dragOffset}px)`,
              opacity: Math.max(0.5, 1 - dragOffset / 200)
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="flex h-full">
              {images.map((img, idx) => (
                <FullscreenSlide
                  key={idx}
                  img={img}
                  onClose={onClose}
                  postId={postId}
                  isActive={idx === currentIndex}
                  onZoomChange={handleZoomChange}
                />
              ))}
            </div>
          </motion.div>

          {/* Navigation arrows – hidden on mobile/tablet, swipe to navigate
              instead, and out of the way entirely while a slide is zoomed. */}
          {hasMultiple && !zoomed && (
            <>
              {currentIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollPrev();
                  }}
                  data-keep-dark
                  className="hidden lg:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 items-center justify-center text-white hover:bg-black/80 transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {currentIndex < images.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollNext();
                  }}
                  data-keep-dark
                  className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/20 items-center justify-center text-white hover:bg-black/80 transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </>
          )}

          {/* Dot indicators — lifted above the action bar when it is present */}
          {hasMultiple && !zoomed && (
            <div className={`absolute ${showActionBar ? 'bottom-20' : 'bottom-6'} left-1/2 -translate-x-1/2 flex gap-2`}>
              {images.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    emblaApi?.scrollTo(idx);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex
                      ? 'bg-white w-3'
                      : 'bg-white/50 hover:bg-white/70'
                  }`}
                  aria-label={`Go to image ${idx + 1}`}
                />
              ))}
            </div>
          )}
          
          {/* Bottom action bar — like / comment / repost / tip with live counts,
              over a dark scrim so it reads on any image. Kept dark across themes. */}
          {showActionBar && (
            <div
              data-keep-dark
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 inset-x-0 z-10 px-2 pt-10 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 via-black/45 to-transparent"
            >
              <ActionBar
                postId={postId}
                className="p-1"
                quickRepost
                centered
                hideUtilityDesktop
                enableDoubleTapLike={actions?.enableDoubleTapLike}
                isLiked={actions?.isLiked}
                isDisliked={actions?.isDisliked}
                myReaction={actions?.myReaction}
                reactionCounts={actions?.reactionCounts}
                hideDislike={actions?.hideDislike}
                likeCount={actions?.likeCount}
                dislikeCount={actions?.dislikeCount}
                commentCount={actions?.commentCount}
                repostCount={actions?.repostCount}
                isReposted={actions?.isReposted}
                tipCount={actions?.tipCount}
                isOwnPost={actions?.isOwnPost}
                tokenId={actions?.tokenId}
                onComment={actions?.onComment}
                onRepost={actions?.onRepost}
                onTip={actions?.onTip}
              />
            </div>
          )}

          {/* Image Translation Sheet */}
          <ImageTranslationSheet
            isOpen={showTranslationSheet}
            onClose={handleCloseTranslation}
            isLoading={isTranslating}
            error={translationError}
            result={translationResult}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Zoom ceiling. Past 4x even an original is mush on a phone photo. */
const MAX_ZOOM = 4;
/** Released below this, the gesture counts as a return to 1x, not a tiny zoom. */
const ZOOM_FLOOR = 1.02;

interface ZoomState {
  scale: number;
  /** Screen px, applied before the scale, measured from the frame's centre. */
  x: number;
  y: number;
}

const NO_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

function touchDistance(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Single fullscreen slide — image sits inside a padded container.
 * Double-tapping the image likes the post; single tap on empty area closes.
 *
 * Pinch (two fingers), or a trackpad pinch / ctrl-scroll, zooms up to 4x about
 * whatever is under the fingers; one finger or the mouse then pans, clamped so
 * the picture can never be dragged off its own frame. Releasing under 1.02x
 * snaps back to 1x, which is also what hands the carousel its gestures back.
 */
function FullscreenSlide({
  img,
  onClose,
  postId,
  isActive,
  onZoomChange,
}: {
  img: string;
  onClose: () => void;
  postId?: string;
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const tapGestures = useTapGestures({
    postId,
    onSingleTap: () => {
      /* single-tap on the image itself is a no-op (closing happens on the
         surrounding padded area). */
    },
  });

  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(NO_ZOOM);
  const zoomRef = useRef(NO_ZOOM);
  const [gesturing, setGesturing] = useState(false);
  /** A pan that moved is not a click, so the release must not close the viewer. */
  const movedRef = useRef(false);

  const applyZoom = useCallback((next: ZoomState) => {
    const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
    const frame = frameRef.current;
    const image = imageRef.current;
    // Layout size, which a transform does not affect — so this stays the
    // image's real box however far it is currently scaled.
    const maxX = frame && image
      ? Math.max(0, (image.clientWidth * scale - frame.clientWidth) / 2)
      : 0;
    const maxY = frame && image
      ? Math.max(0, (image.clientHeight * scale - frame.clientHeight) / 2)
      : 0;
    const clamped: ZoomState = scale <= 1
      ? NO_ZOOM
      : {
          scale,
          x: Math.min(maxX, Math.max(-maxX, next.x)),
          y: Math.min(maxY, Math.max(-maxY, next.y)),
        };
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  /** Scale to `scale`, keeping whatever sits under (clientX, clientY) put. */
  const zoomAbout = useCallback((scale: number, clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const focalX = clientX - (rect.left + rect.width / 2);
    const focalY = clientY - (rect.top + rect.height / 2);
    const current = zoomRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(1, scale));
    const ratio = next / current.scale;
    applyZoom({
      scale: next,
      x: focalX + (current.x - focalX) * ratio,
      y: focalY + (current.y - focalY) * ratio,
    });
  }, [applyZoom]);

  // ── Touch: two fingers zoom, one finger pans once zoomed ──
  const gesture = useRef<{
    kind: 'pinch' | 'pan';
    startScale: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    distance: number;
  } | null>(null);

  const beginPan = useCallback((clientX: number, clientY: number) => {
    gesture.current = {
      kind: 'pan',
      startScale: zoomRef.current.scale,
      startX: zoomRef.current.x,
      startY: zoomRef.current.y,
      originX: clientX,
      originY: clientY,
      distance: 0,
    };
  }, []);

  const beginPinch = useCallback((a: React.Touch, b: React.Touch) => {
    const current = zoomRef.current;
    gesture.current = {
      kind: 'pinch',
      startScale: current.scale,
      startX: current.x,
      startY: current.y,
      originX: (a.clientX + b.clientX) / 2,
      originY: (a.clientY + b.clientY) / 2,
      distance: Math.max(1, touchDistance(a, b)),
    };
    setGesturing(true);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    movedRef.current = false;
    if (e.touches.length >= 2) {
      // Embla ends its own drag the moment a second finger lands, so the pinch
      // never has to fight it — see `move()` in embla's drag handler.
      e.stopPropagation();
      beginPinch(e.touches[0], e.touches[1]);
      return;
    }
    if (zoomRef.current.scale > 1) {
      e.stopPropagation();
      beginPan(e.touches[0].clientX, e.touches[0].clientY);
      setGesturing(true);
    }
  }, [beginPan, beginPinch]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const active = gesture.current;
    if (!active) return;
    e.stopPropagation();
    movedRef.current = true;
    if (active.kind === 'pinch' && e.touches.length >= 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      const frame = frameRef.current;
      if (!frame) return;
      const scale = Math.min(
        MAX_ZOOM,
        Math.max(1, (active.startScale * touchDistance(a, b)) / active.distance),
      );
      const rect = frame.getBoundingClientRect();
      const focalX = active.originX - (rect.left + rect.width / 2);
      const focalY = active.originY - (rect.top + rect.height / 2);
      const ratio = scale / active.startScale;
      // The centroid is allowed to travel, so a pinch that drifts also pans.
      const driftX = (a.clientX + b.clientX) / 2 - active.originX;
      const driftY = (a.clientY + b.clientY) / 2 - active.originY;
      applyZoom({
        scale,
        x: focalX + (active.startX - focalX) * ratio + driftX,
        y: focalY + (active.startY - focalY) * ratio + driftY,
      });
      return;
    }
    if (active.kind === 'pan') {
      const touch = e.touches[0];
      applyZoom({
        scale: zoomRef.current.scale,
        x: active.startX + (touch.clientX - active.originX),
        y: active.startY + (touch.clientY - active.originY),
      });
    }
  }, [applyZoom]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!gesture.current) return;
    e.stopPropagation();
    if (e.touches.length >= 2) {
      beginPinch(e.touches[0], e.touches[1]);
      return;
    }
    if (e.touches.length === 1 && zoomRef.current.scale > 1) {
      // A finger lifted out of a pinch — the one left over carries on panning.
      beginPan(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    gesture.current = null;
    setGesturing(false);
    if (zoomRef.current.scale < ZOOM_FLOOR) applyZoom(NO_ZOOM);
  }, [applyZoom, beginPan, beginPinch]);

  // ── Mouse: drag to pan once zoomed ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    movedRef.current = false;
    if (zoomRef.current.scale <= 1 || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = zoomRef.current.x;
    const startY = zoomRef.current.y;
    const originX = e.clientX;
    const originY = e.clientY;
    setGesturing(true);
    const onMove = (move: MouseEvent) => {
      movedRef.current = true;
      applyZoom({
        scale: zoomRef.current.scale,
        x: startX + (move.clientX - originX),
        y: startY + (move.clientY - originY),
      });
    };
    const onUp = () => {
      setGesturing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [applyZoom]);

  // ── Wheel: trackpad pinch (ctrl+wheel), and plain wheel once zoomed ──
  //
  // A native listener because React registers `wheel` passively at the root,
  // where `preventDefault()` is ignored — and without it the browser zooms the
  // whole page instead. Stopping propagation here is also what keeps the
  // viewer's close-on-scroll from firing while the image is zoomed in.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      const zoomedIn = zoomRef.current.scale > 1;
      if (!e.ctrlKey && !zoomedIn) return;
      e.preventDefault();
      e.stopPropagation();
      const step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      zoomAbout(zoomRef.current.scale * step, e.clientX, e.clientY);
    };
    // iOS Safari keeps its own pinch on top of `touch-action`, and it wins
    // unless the move is cancelled — which React's passive touchmove cannot do.
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable && (gesture.current || zoomRef.current.scale > 1)) e.preventDefault();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchmove', onTouchMove);
    };
  }, [zoomAbout]);

  // Swiping on to another image leaves this one at 1x, so coming back to it is
  // not a surprise — and so the carousel is never left holding a zoomed slide.
  useEffect(() => {
    if (!isActive && zoomRef.current.scale !== 1) {
      gesture.current = null;
      applyZoom(NO_ZOOM);
    }
  }, [isActive, applyZoom]);

  useEffect(() => {
    onZoomChange(isActive && zoom.scale > 1);
  }, [isActive, zoom.scale, onZoomChange]);

  // ── The original, swapped in once it has arrived ──
  const source = useMemo(() => cdnImageSource(img), [img]);
  const [fullResReady, setFullResReady] = useState(false);
  useEffect(() => {
    if (!isActive || source === img) {
      setFullResReady(source === img);
      return;
    }
    setFullResReady(false);
    const probe = new window.Image();
    probe.onload = () => setFullResReady(true);
    probe.src = source;
    return () => {
      probe.onload = null;
    };
  }, [isActive, source, img]);

  return (
    <div
      ref={frameRef}
      className="relative flex-[0_0_100%] min-w-0 h-full flex items-center justify-center overflow-hidden p-4"
      // `none` rather than leaving it to the browser: the two-finger stream has
      // to reach these handlers instead of becoming a page zoom. Embla does its
      // own preventDefault, so its horizontal drag is unaffected.
      style={{ touchAction: 'none', cursor: zoom.scale > 1 ? 'grab' : undefined }}
      onClick={(e) => {
        if (zoom.scale > 1 || movedRef.current) {
          e.stopPropagation();
          return;
        }
        onClose();
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <TapReactionBurst postId={postId} />
      <img
        ref={imageRef}
        src={fullResReady ? source : img}
        alt=""
        className="max-w-full max-h-full object-contain select-none"
        draggable={false}
        style={{
          transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
          transition: gesturing ? 'none' : 'transform 180ms ease-out',
          willChange: zoom.scale > 1 ? 'transform' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        {...tapGestures}
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/placeholder.svg';
        }}
      />
    </div>
  );
}
