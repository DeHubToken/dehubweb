/**
 * CommentsWrapper
 * ===============
 * Mobile/Tablet (< lg): non-modal drawer (no overlay blur, video stays visible)
 * Desktop (lg+): inline expandable section below the post card
 * Collapsed sidebar (multi-column): compact height to fit smaller cards
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

export function CommentsWrapper({ open, onOpenChange, tokenId, initialTab }: CommentsWrapperProps) {
  const isTabletOrMobile = useIsTabletOrMobile();
  const adaptiveDrawerHeight = useAdaptiveDrawerHeight(isTabletOrMobile);
  const { isCollapsed } = useSidebarCollapse();

  if (isTabletOrMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        modal={true}
        dismissible={true}
      >
        <DrawerContent
          glass
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
          <div className={`bg-zinc-900/80 backdrop-blur-2xl rounded-2xl border border-white/10 mt-3 overflow-y-auto ${
            isCompact ? 'px-2 pb-2 pt-1 max-h-[40vh] text-sm' : 'px-4 pb-4 pt-2 max-h-[70vh]'
          }`}>
            <CommentsSection
              tokenId={tokenId}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
