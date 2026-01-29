import { useState, useCallback } from 'react';
import { SquareUserRound, Trophy, MessagesSquare } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';

type TabType = 'follow' | 'leaderboard' | 'chat';
type FollowSortMode = 'best' | 'new';

const tabs: { id: TabType; icon: typeof SquareUserRound }[] = [
  { id: 'follow', icon: SquareUserRound },
  { id: 'leaderboard', icon: Trophy },
  { id: 'chat', icon: MessagesSquare },
];

export function TabbedSidePanel() {
  const [activeTab, setActiveTab] = useState<TabType>('follow');
  const [followSortMode, setFollowSortMode] = useState<FollowSortMode>('best');

  const handleTabClick = useCallback((tabId: TabType) => {
    if (tabId === 'follow' && activeTab === 'follow') {
      // Toggle between 'best' and 'new' when clicking already active follow tab
      setFollowSortMode(prev => prev === 'best' ? 'new' : 'best');
    } else {
      setActiveTab(tabId);
    }
  }, [activeTab]);

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

      {/* Tab Content */}
      <div className="px-0 py-4 h-[400px]">
        {activeTab === 'follow' && <WhoToFollow sortMode={followSortMode} />}
        {activeTab === 'leaderboard' && <SidebarLeaderboard />}
        {activeTab === 'chat' && <SidebarChat />}
      </div>
    </div>
  );
}
