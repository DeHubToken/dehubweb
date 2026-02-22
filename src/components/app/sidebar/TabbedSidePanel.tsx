import { useState, useRef, useCallback, memo } from 'react';
import { SquareUserRound, Trophy, MessagesSquare } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard, type SidebarLeaderboardHandle } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';
import { BadgeBalanceProvider } from '@/contexts/BadgeBalanceContext';

type TabType = 'leaderboard' | 'follow' | 'chat';

const tabs: { id: TabType; icon: typeof SquareUserRound }[] = [
  { id: 'leaderboard', icon: Trophy },
  { id: 'follow', icon: SquareUserRound },
  { id: 'chat', icon: MessagesSquare },
];

const TAB_INDEX: Record<TabType, number> = { leaderboard: 0, follow: 1, chat: 2 };

// Persist tab state across remounts so layout changes don't reset it
let persistedTab: TabType = 'leaderboard';

export const TabbedSidePanel = memo(function TabbedSidePanel() {
  const [activeTab, setActiveTab] = useState<TabType>(persistedTab);
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);

  const handleTabClick = useCallback((id: TabType) => {
    persistedTab = id;
    setActiveTab(() => id);
  }, []);

  const activeIndex = TAB_INDEX[activeTab];

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Tab Icons */}
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
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

      {/* Tab Content — sliding strip */}
      <div className="h-[400px] overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {/* Leaderboard panel */}
          <div className="w-full flex-shrink-0 h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            <SidebarLeaderboard ref={leaderboardRef} />
          </div>
          {/* Follow panel */}
          <div className="w-full flex-shrink-0 h-full flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            <WhoToFollow />
          </div>
          {/* Chat panel */}
          <div className="w-full flex-shrink-0 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            <BadgeBalanceProvider>
              <SidebarChat />
            </BadgeBalanceProvider>
          </div>
        </div>
      </div>
    </div>
  );
});
