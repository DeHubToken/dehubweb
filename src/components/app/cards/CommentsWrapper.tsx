/**
 * CommentsWrapper
 * ===============
 * Feed cards (all breakpoints): inline expandable section that grows the bottom
 *   of the post bento — no drawer, no scrim, the card just gets taller.
 * Immersive surfaces (fullscreen shorts / immersive video, `immersive` prop):
 *   non-modal bottom-sheet drawer, because there is no bento to expand into and
 *   the media needs to stay visible behind the comments.
 * Collapsed sidebar (multi-column): compact height to fit smaller cards.
 */

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { CommentsSection } from './CommentsSection';
import { AnimatePresence, motion } from 'framer-motion';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { useState, useEffect } from 'react';

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

export function CommentsWrapper({ open, onOpenChange, tokenId, initialTab, immersive = false }: CommentsWrapperProps) {
  const isTabletOrMobile = useIsTabletOrMobile();
  const adaptiveDrawerHeight = useAdaptiveDrawerHeight(isTabletOrMobile && immersive);
  const { isCollapsed } = useSidebarCollapse();

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
            <CommentsSection
              tokenId={tokenId}
              onClose={() => onOpenChange(false)}
              initialTab={initialTab}
            />
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
            data-comments-wrapper
            data-no-navigate
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
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
            <CommentsSection
              tokenId={tokenId}
              onClose={() => onOpenChange(false)}
              initialTab={initialTab}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
