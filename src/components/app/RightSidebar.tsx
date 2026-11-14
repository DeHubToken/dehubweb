import { memo } from 'react';
import { motion } from 'framer-motion';

import { DesktopPeopleSearch } from './search/DesktopPeopleSearch';
import { TabbedSidePanel } from './sidebar';
import { WhatsHappening } from './WhatsHappening';
import { GettingStartedBento } from './GettingStartedBento';
import { useIsDesktopViewport } from '@/hooks/use-is-desktop';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { rightRailVariants } from '@/lib/surface-motion';

interface RightSidebarProps {
  showSearch?: boolean;
}

export const RightSidebar = memo(function RightSidebar({ showSearch = true }: RightSidebarProps) {
  const { isCollapsed } = useSidebarCollapse();
  const isDesktop = useIsDesktopViewport();
  // Below lg the rail is CSS-hidden anyway — skip mounting it entirely so its
  // leaderboard/trending rotations, queries and polls never run on mobile.
  if (!isDesktop) return null;
  return (
    // motion.aside inherits the surface transition label from SurfaceTransition:
    // the right bento column slides OFF to the right when opening docs and back
    // IN when returning. Desktop-only (`hidden lg:block`).
    <motion.aside data-desktop-right-rail variants={rightRailVariants} className={cn("hidden lg:block w-72 xl:w-80 2xl:w-88 h-screen sticky top-0 pb-4 overflow-y-auto overscroll-contain scrollbar-hide z-0 isolate transition-[padding] duration-500 ease-in-out motion-reduce:transition-none will-change-[padding]", isCollapsed ? "pl-0 pr-2 pt-[12px]" : "px-4 pt-[8px]")}>
      {showSearch && (
        <div data-side-panel data-search-bento data-search-surface className="rounded-xl">
          <DesktopPeopleSearch compact={isCollapsed} />
        </div>
      )}
      <div className={cn("space-y-4", isCollapsed ? "mt-[8px]" : "mt-[11px]")}>
        {/* Above the panels rather than below them: it renders nothing at all
            for everyone except a member who is mid-walkthrough, and when it
            does render it is the thing that person came back for. */}
        <GettingStartedBento />
        <TabbedSidePanel />
        <div className="relative -mt-[4px]">
          <WhatsHappening />
        </div>
      </div>
    </motion.aside>
  );
});
