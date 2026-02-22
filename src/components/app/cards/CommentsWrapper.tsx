/**
 * CommentsWrapper
 * ===============
 * Mobile: non-modal drawer (no overlay blur, video stays visible)
 * Desktop: inline expandable section below the post card
 */

import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { CommentsSection } from './CommentsSection';
import { AnimatePresence, motion } from 'framer-motion';

interface CommentsWrapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string;
}

export function CommentsWrapper({ open, onOpenChange, tokenId }: CommentsWrapperProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} modal={false}>
        <DrawerContent glass hideHandle noOverlay className="max-h-[70vh] flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 px-4 pb-4 pt-2">
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
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl border border-white/10 mt-3 px-4 pb-4 pt-2 max-h-[70vh] overflow-y-auto">
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
