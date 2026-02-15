import { useState, useRef, useCallback } from 'react';
import { SquareUserRound, Trophy, MessagesSquare } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard, type SidebarLeaderboardHandle } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';

type TabType = 'leaderboard' | 'follow' | 'chat';

const tabs: { id: TabType; icon: typeof SquareUserRound }[] = [
  { id: 'leaderboard', icon: Trophy },
  { id: 'follow', icon: SquareUserRound },
  { id: 'chat', icon: MessagesSquare },
];

const TAB_ORDER: TabType[] = ['leaderboard', 'follow', 'chat'];
const SWIPE_THRESHOLD = 50;

export function TabbedSidePanel() {
  const [activeTab, setActiveTab] = useState<TabType>('leaderboard');
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);

  // Touch swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);
  const lastSwipeTime = useRef(0);

  const handleSwipe = useCallback((direction: 1 | -1) => {
    const now = Date.now();
    if (now - lastSwipeTime.current < 300) return;
    lastSwipeTime.current = now;

    // Always switch tab — don't let leaderboard period consume swipes
    const idx = TAB_ORDER.indexOf(activeTab);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < TAB_ORDER.length) {
      setActiveTab(TAB_ORDER[newIdx]);
    }
  }, [activeTab]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    swiping.current = false;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;

    handleSwipe(deltaX < 0 ? 1 : -1);
  }, [handleSwipe]);

  // Wheel handler for 2-finger trackpad swipe
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedDeltaX = useRef(0);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < 2) return;

    accumulatedDeltaX.current += e.deltaX;

    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      const total = accumulatedDeltaX.current;
      accumulatedDeltaX.current = 0;

      if (Math.abs(total) < SWIPE_THRESHOLD) return;

      handleSwipe(total > 0 ? 1 : -1);
    }, 40);
  }, [handleSwipe]);

  return (
    <div
      className="bg-zinc-900 rounded-2xl overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Tab Icons */}
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-3 flex items-center justify-center transition-colors ${
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              {activeTab === tab.id && (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
              )}
              <Icon className="w-5 h-5 relative z-10" />
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="px-0 py-4 h-[400px] overflow-x-hidden">
        <div style={{ display: activeTab === 'leaderboard' ? 'block' : 'none' }} className="h-full">
          <SidebarLeaderboard ref={leaderboardRef} />
        </div>
        <div style={{ display: activeTab === 'follow' ? 'block' : 'none' }} className="h-full">
          <WhoToFollow />
        </div>
        <div style={{ display: activeTab === 'chat' ? 'block' : 'none' }} className="h-full">
          <SidebarChat />
        </div>
      </div>
    </div>
  );
}
