/**
 * CommentsWrapper
 * ===============
 * Phone (<md): full-width bottom-sheet drawer, the same shape as the mobile
 *   app's comment sheet. Inline expansion left a nested reply with ~200px of
 *   card to live in and its action row running off the right edge; the sheet
 *   gives the thread the whole viewport width and 82% of its height.
 * Feed cards (md and up): inline expandable section that grows the bottom
 *   of the post bento — no drawer, no scrim, the card just gets taller.
 * Immersive surfaces (fullscreen shorts / immersive video, `immersive` prop):
 *   non-modal bottom-sheet drawer, because there is no bento to expand into and
 *   the media needs to stay visible behind the comments.
 * Collapsed sidebar (multi-column): compact height to fit smaller cards.
 */

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { AnimatePresence, motion } from 'framer-motion';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';

// The thread itself is a lazy chunk. This wrapper sits inside every feed card,
// so CommentsSection (the composer, reactions, likers drawer, translation…)
// was in the entry bundle for a thread most cards never open. All three
// surfaces below only render it once `open` is true, so the first open on a
// page fetches it; the section's own loading state covers the beat.
const CommentsSection = lazy(() => import('./CommentsSection').then(m => ({ default: m.CommentsSection })));

interface CommentsWrapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string;
  initialTab?: 'replies' | 'quotes' | 'reposts' | 'search';
  /**
   * Fullscreen surfaces (shorts, immersive video) where the comments must
   * overlay as a bottom-sheet drawer because there is no post bento to expand.
   * Feed cards leave this off and get the inline bento expansion on every
   * breakpoint.
   */
  immersive?: boolean;
  /** Creator turned replies off — swaps the composer for a notice. */
  commentsDisabled?: boolean;
  /**
   * Post author's wallet address. Forwarded to CommentsSection, which hides the
   * author's straight comments from the list — pass it only when the host page
   * renders those comments itself (the author thread on the post page).
   */
  postAuthorAddress?: string;
}

function useIsTabletOrMobile() {
  const [isTabletOrMobile, setIsTabletOrMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsTabletOrMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isTabletOrMobile;
}

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const check = () => setIsPhone(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isPhone;
}

function useAdaptiveDrawerHeight(enabled: boolean) {
  const [drawerHeight, setDrawerHeight] = useState('56dvh');

  useEffect(() => {
    if (!enabled) return;

    const calculateHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const calculated = Math.round(viewportHeight * 0.56);
      const clamped = Math.min(Math.max(calculated, 340), 560);
      const finalHeight = Math.min(clamped, Math.round(viewportHeight - 24));
      setDrawerHeight(`${finalHeight}px`);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    window.visualViewport?.addEventListener('resize', calculateHeight);

    return () => {
      window.removeEventListener('resize', calculateHeight);
      window.visualViewport?.removeEventListener('resize', calculateHeight);
    };
  }, [enabled]);

  return drawerHeight;
}

/** Can this element still take `deltaY` worth of scrolling in that direction? */
function canAbsorb(el: Element, deltaY: number) {
  const room = deltaY > 0
    ? el.scrollHeight - el.clientHeight - el.scrollTop
    : el.scrollTop;
  if (room <= 1) return false;
  if (el === document.scrollingElement) return true;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll';
}

/**
 * Hand the wheel back to the page once the comment list bottoms out.
 *
 * The dropdown scrolls internally, so without this the wheel dead-ends: the
 * user reaches the last reply, keeps scrolling because they want the next post,
 * and the feed sits still. Browsers latch a wheel gesture to the scroller it
 * started on and only chain to the page once the gesture stops, which is the
 * same dead end for anyone who scrolls in one continuous motion. So when
 * nothing inside the dropdown can take the delta, scroll the page ourselves.
 */
function useWheelChaining(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const onWheel = (e: WheelEvent) => {
      // Pinch-zoom, and horizontal swipes the feed reads as tab switches.
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;

      let node: Element | null = e.target as Element;
      while (node && !canAbsorb(node, e.deltaY)) {
        node = node.parentElement;
      }
      // Nothing left to scroll anywhere, or the list itself can still move —
      // either way the browser's own handling is correct.
      if (!node || el.contains(node)) return;

      // deltaMode is lines on Firefox/Windows and pages on some remotes.
      const step = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1;
      node.scrollTop += e.deltaY * step;
      e.preventDefault();
    };

    // Non-passive: React registers its own wheel listener as passive, so the
    // preventDefault above only lands on a listener we attach ourselves.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled]);

  return ref;
}

export function CommentsWrapper({ open, onOpenChange, tokenId, initialTab, immersive = false, commentsDisabled = false, postAuthorAddress }: CommentsWrapperProps) {
  const isTabletOrMobile = useIsTabletOrMobile();
  const isPhone = useIsPhone();
  const adaptiveDrawerHeight = useAdaptiveDrawerHeight(isTabletOrMobile && immersive);
  const { isCollapsed } = useSidebarCollapse();

  // This sheet holds the page itself.
  //
  // Every other drawer gets it for free: `noBodyStyles` turns vaul's own lock
  // off on the grounds that Radix's modal Dialog wraps the overlay in
  // RemoveScroll. True at modal={true}, and this is the one sheet in the app
  // that passes modal={false} — so neither lock engaged and the feed scrolled
  // behind the open sheet. Shorts happens to be covered because the viewer
  // locks the body itself; immersive video does not, so there it was visible.
  //
  // Counted, so it nests with the viewer's own lock instead of fighting it.
  const immersiveSheet = isTabletOrMobile && immersive;
  useEffect(() => {
    if (!immersiveSheet || !open) return;
    return lockBodyScroll();
  }, [immersiveSheet, open]);
  // Inline expansion only — the immersive drawer sits over fullscreen media and
  // should keep the scroll to itself.
  const wheelChainRef = useWheelChaining(open && !isPhone && !(isTabletOrMobile && immersive));

  // Phone, non-immersive: the sheet. Modal, because unlike the immersive case
  // there is nothing behind it worth keeping visible, and the scrim is what
  // makes the thread read as its own surface instead of part of the card.
  if (isPhone && !immersive) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} modal dismissible>
        <DrawerContent
          glass
          hideHandle={false}
          data-comments-wrapper
          className="flex flex-col overflow-hidden"
          style={{
            height: '82dvh',
            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 8px)',
          }}
        >
          {/* One padding step and no nested card: the indent budget the replies
              spend is the viewport's, not what a bento left over. The section itself
              carries px-2 on mobile, so this is one 12px gutter, not two. */}
          <div
            className="flex-1 min-h-0 h-full px-1"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            data-vaul-no-drag
          >
            <Suspense fallback={null}>
              <CommentsSection
                tokenId={tokenId}
                onClose={() => onOpenChange(false)}
                initialTab={initialTab}
                commentsDisabled={commentsDisabled}
                postAuthorAddress={postAuthorAddress}
              />
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Only fullscreen/immersive surfaces use the bottom-sheet drawer. Feed cards
  // fall through to the inline expansion below on every breakpoint.
  if (isTabletOrMobile && immersive) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        modal={false}
        dismissible={true}
      >
        <DrawerContent
          glass
          data-comments-wrapper
          className="flex flex-col overflow-hidden !bg-black/60 !backdrop-blur-[24px] border border-white/[0.08]"
          style={{
            height: adaptiveDrawerHeight,
            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 8px)',
          }}
        >
          <div className="flex-1 min-h-0 px-3 pb-3 h-full" data-vaul-no-drag>
            <Suspense fallback={null}>
              <CommentsSection
                tokenId={tokenId}
                onClose={() => onOpenChange(false)}
                initialTab={initialTab}
                commentsDisabled={commentsDisabled}
                postAuthorAddress={postAuthorAddress}
              />
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // When sidebar is collapsed (multi-column feed), use compact sizing
  const isCompact = isCollapsed;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div
            ref={wheelChainRef}
            data-comments-wrapper
            data-no-navigate
            onClick={(e) => e.stopPropagation()}
            // No `overscroll-behavior: contain` here on purpose: this section is
            // part of the card, not an overlay, so scrolling past the last reply
            // has to carry on into the feed the way a side panel does. Adding it
            // back traps the wheel and the page reads as frozen.
            style={{ touchAction: 'pan-y' }}
            // Mobile (<md): CommentsSection lays out as `h-full` with an
            // absolutely-positioned, scrollable list inside a flex-1 region, so
            // it needs a definite parent height — an `auto`-height wrapper
            // collapses the list to 0 and the comments vanish. Give it a fixed
            // viewport height and let the section scroll internally. Desktop
            // keeps the grow-to-content behaviour (CommentsSection carries its
            // own min-h-[400px]).
            className={`bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 mt-3 h-[60vh] overflow-hidden md:h-auto md:overflow-y-auto ${
              isCompact ? 'px-2 pb-2 pt-1 md:max-h-[40vh] text-sm' : 'px-4 pb-4 pt-2 md:max-h-[70vh]'
            }`}
          >
            <Suspense fallback={null}>
              <CommentsSection
                tokenId={tokenId}
                onClose={() => onOpenChange(false)}
                initialTab={initialTab}
                commentsDisabled={commentsDisabled}
                postAuthorAddress={postAuthorAddress}
              />
            </Suspense>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
