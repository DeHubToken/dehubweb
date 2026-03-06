/**
 * CommentsWrapper
 * ===============
 * Mobile/Tablet (< lg): non-modal drawer (no overlay blur, video stays visible)
 * Desktop (lg+): inline expandable section below the post card
 * Collapsed sidebar (multi-column): compact height to fit smaller cards
 */

import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { CommentsSection } from './CommentsSection';
import { AnimatePresence, motion } from 'framer-motion';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { useState, useEffect } from 'react';

interface CommentsWrapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string;
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

export function CommentsWrapper({ open, onOpenChange, tokenId }: CommentsWrapperProps) {
  const isTabletOrMobile = useIsTabletOrMobile();
  const { isCollapsed } = useSidebarCollapse();

  if (isTabletOrMobile) {
    return (
      <Drawer 
        open={open} 
        onOpenChange={onOpenChange} 
        modal={false}
        dismissible={true}
        handleOnly={true}
      >
        <DrawerContent glass hideHandle noOverlay className="max-h-[75vh] flex flex-col overflow-hidden !bg-black/60 !backdrop-blur-[24px] border border-white/[0.08]">
          {/* Visible drag handle for closing */}
          <div className="flex justify-center py-2 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-white/40" />
          </div>
          <div className="flex-1 min-h-0 px-4 pb-4" data-vaul-no-drag>
            <CommentsSection
              tokenId={tokenId}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: inline expandable section
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
