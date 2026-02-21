import { useState, useRef } from 'react';
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

export function TabbedSidePanel() {
  const [activeTab, setActiveTab] = useState<TabType>('leaderboard');
  const leaderboardRef = useRef<SidebarLeaderboardHandle>(null);

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
          <BadgeBalanceProvider>
            <SidebarChat />
          </BadgeBalanceProvider>
        </div>
      </div>
    </div>
  );
}
