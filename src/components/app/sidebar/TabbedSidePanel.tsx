import { useState } from 'react';
import { UserPlus, Trophy, MessageCircle } from 'lucide-react';
import { WhoToFollow } from '../WhoToFollow';
import { SidebarLeaderboard } from './SidebarLeaderboard';
import { SidebarChat } from './SidebarChat';

type TabType = 'follow' | 'leaderboard' | 'chat';

const tabs: { id: TabType; icon: typeof UserPlus }[] = [
  { id: 'follow', icon: UserPlus },
  { id: 'leaderboard', icon: Trophy },
  { id: 'chat', icon: MessageCircle },
];

export function TabbedSidePanel() {
  const [activeTab, setActiveTab] = useState<TabType>('follow');

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Tab Icons */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 flex items-center justify-center transition-colors ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-green-500 bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'follow' && <WhoToFollow />}
        {activeTab === 'leaderboard' && <SidebarLeaderboard />}
        {activeTab === 'chat' && <SidebarChat />}
      </div>
    </div>
  );
}
