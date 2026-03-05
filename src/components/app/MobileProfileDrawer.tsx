/**
 * MobileProfileDrawer
 * ====================
 * On mobile (<lg), profiles open as a bottom drawer that starts at ~45% height,
 * can be dragged up to full screen, and dismisses back on close.
 * On desktop (lg+), renders children inline with a fade animation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from '@/lib/utils';

interface MobileProfileDrawerProps {
  isOpen: boolean;
  children: React.ReactNode;
}

const SNAP_POINTS = [0.62, 1] as const;

export function MobileProfileDrawer({ isOpen, children }: MobileProfileDrawerProps) {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const [isMobile, setIsMobile] = useState(false);
  const isClosingRef = useRef(false);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Reset snap when opening
  useEffect(() => {
    if (isOpen) {
      setSnap(SNAP_POINTS[0]);
      isClosingRef.current = false;
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    navigate(-1);
  }, [navigate]);

  // Desktop: render inline
  if (!isMobile) {
    return <div className="animate-fade-in">{children}</div>;
  }

  const isFullScreen = snap === 1;

  return (
    <VaulDrawer.Root
      open={isOpen}
      onClose={handleClose}
      snapPoints={SNAP_POINTS as unknown as number[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      modal={false}
      dismissible
      shouldScaleBackground={false}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
          onClick={handleClose}
        />
        <VaulDrawer.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-[95] flex flex-col',
            'bg-black border-t border-white/10 rounded-t-[20px]',
            'focus:outline-none',
          )}
          style={{
            height: '100dvh',
            maxHeight: '100dvh',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/40" />
          </div>

          {/* Scrollable profile content */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain"
            data-vaul-no-drag={isFullScreen ? true : undefined}
          >
            {children}
          </div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
